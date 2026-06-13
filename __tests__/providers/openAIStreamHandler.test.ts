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
});
