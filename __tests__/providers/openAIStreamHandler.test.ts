import { OpenAIStreamHandler } from '../../src/providers/openAIStreamHandler.js';
import { StandardReasoningProcessor } from '../../src/providers/reasoningProcessor.js';
import { OpenAIResponseParser } from '../../src/providers/openAIResponseParser.js';
import { IAnonymizer, IHttpResponse } from '../../src/types.js';
import { createMockEventBus, createMockLogger, createMockAnonymizer } from '../testUtils.js';
import { expect, jest } from '@jest/globals';

describe('OpenAIStreamHandler', () => {
  let handler: OpenAIStreamHandler;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAnonymizer: jest.Mocked<IAnonymizer>;
  const reasoningProcessor = new StandardReasoningProcessor();
  const parser = new OpenAIResponseParser();

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockLogger = createMockLogger();
    mockAnonymizer = createMockAnonymizer();

    handler = new OpenAIStreamHandler(
      mockEventBus,
      reasoningProcessor,
      parser,
      mockLogger,
      mockAnonymizer
    );
  });


  async function* createAsyncIterable(chunks: string[]) {
    for (const chunk of chunks) {
      yield Buffer.from(chunk);
    }
  }

  it('should process a simple stream and emit tokens', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: [DONE]\n'
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const results = await handler.handleStream(response);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Hello world');
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: 'Hello', type: 'content' });
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: ' world', type: 'content' });
  });

  it('should handle interleaved reasoning and content', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning":"Thinking..."}}]}\n',
      'data: {"choices":[{"delta":{"content":"Result"}}]}\n',
      'data: [DONE]\n'
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const results = await handler.handleStream(response);

    expect(results).toHaveLength(2);
    expect(results[0].reasoning).toBe('Thinking...');
    expect(results[1].content).toBe('Result');
  });

  it('should handle tool calls in stream', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search"}}]}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":\\"test\\"}"}}]}}]}\n',
      'data: [DONE]\n'
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const results = await handler.handleStream(response);

    expect(results).toHaveLength(1);
    expect(results[0].tool_calls).toHaveLength(1);
    expect(results[0].tool_calls?.[0].function.name).toBe('search');
    expect(results[0].tool_calls?.[0].function.arguments).toBe('{"q":"test"}');
  });

  it('should throw if response body is missing', async () => {
    const response: IHttpResponse = {
      body: null,
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };
    await expect(handler.handleStream(response)).rejects.toThrow(/Response body is null/);
  });

  it('should NOT split tool calls into separate messages when whitespace content appears between them', async () => {
    // This reproduces the bug where newlines between tool calls cause the stream handler
    // to flush the tool_calls message and start a new one, creating sparse arrays
    const chunks = [
      // First tool call
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"file1.ts\\"}"}}]}}]}\n',
      // Whitespace content (newline) between tool calls - this should NOT cause a phase change
      'data: {"choices":[{"delta":{"content":"\\n"}}]}\n',
      // Second tool call
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"file2.ts\\"}"}}]}}]}\n',
      // More whitespace
      'data: {"choices":[{"delta":{"content":"\\n"}}]}\n',
      // Third tool call
      'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call_3","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"file3.ts\\"}"}}]}}]}\n',
      'data: [DONE]\n'
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const results = await handler.handleStream(response);

    // Should produce only ONE message with all 3 tool calls, not multiple messages
    // The bug would cause 3 separate tool_calls messages (each with sparse arrays)
    expect(results).toHaveLength(1);
    expect(results[0].tool_calls).toHaveLength(3);
    expect(results[0].tool_calls?.[0].function.name).toBe('read_file');
    expect(results[0].tool_calls?.[0].function.arguments).toContain('file1.ts');
    expect(results[0].tool_calls?.[1].function.name).toBe('read_file');
    expect(results[0].tool_calls?.[1].function.arguments).toContain('file2.ts');
    expect(results[0].tool_calls?.[2].function.name).toBe('read_file');
    expect(results[0].tool_calls?.[2].function.arguments).toContain('file3.ts');
    
    // Verify no undefined elements in the tool_calls array (no sparse array)
    for (const tc of results[0].tool_calls || []) {
      expect(tc).toBeDefined();
      expect(tc.function).toBeDefined();
      expect(tc.function.name).toBeDefined();
    }
  });

  it('should NOT emit null tool_calls when indices are non-sequential', async () => {
    // Some models (e.g. qwen/devstral-family, Nemotron) assign tool call IDs out
    // of order, emitting a higher index before lower ones (here index 2 before
    // index 1). The accumulation logic writes at toolCalls[index], which for a
    // non-sequential index leaves trailing HOLES in the array.
    //
    // Holes survive Array.prototype.map() (it skips but preserves them) and get
    // serialized to `null` by JSON.stringify, causing OpenAI-compatible APIs to
    // reject the request with e.g. "invalid type: null, expected struct
    // ChatCompletionMessageToolCall". This test locks in the fix.
    const chunks = [
      // First tool call at index 0
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_0","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"file1.ts\\"}"}}]}}]}\n',
      // Second tool call at index 2, SKIPPING index 1 -> creates a hole
      'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call_2","type":"function","function":{"name":"grep_search","arguments":"{\\"q\\":\\"chat\\"}"}}]}}]}\n',
      'data: [DONE]\n'
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const results = await handler.handleStream(response);
    const toolCalls = results[0].tool_calls!;

    // The two real tool calls must be present.
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].function.name).toBe('read_file');
    expect(toolCalls[1].function.name).toBe('grep_search');

    // The critical assertion: no holes remain, so serialization produces no nulls.
    expect(JSON.stringify(toolCalls)).not.toContain('null');

    // Every element must be a concrete, defined tool call (no dummy fillers).
    for (const tc of toolCalls) {
      expect(tc).toBeDefined();
      expect(tc.function).toBeDefined();
      expect(tc.function.name).toBeTruthy();
    }
  });
});
