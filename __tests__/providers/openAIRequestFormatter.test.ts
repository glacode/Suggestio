import { OpenAIRequestFormatter } from '../../src/providers/openAIRequestFormatter.js';
import { StandardReasoningProcessor } from '../../src/providers/reasoningProcessor.js';
import { IAnonymizer, IPrompt, IChatMessage, IToolDefinition } from '../../src/types.js';
import { expect, jest } from '@jest/globals';

describe('OpenAIRequestFormatter', () => {
  let formatter: OpenAIRequestFormatter;
  let mockAnonymizer: jest.Mocked<IAnonymizer>;
  let mockPrompt: jest.Mocked<IPrompt>;
  const reasoningProcessor = new StandardReasoningProcessor();

  beforeEach(() => {
    mockAnonymizer = {
      anonymize: jest.fn((s: string) => `anon_${s}`),
      deanonymize: jest.fn((s: string) => s.replace('anon_', '')),
      createStreamingDeanonymizer: jest.fn()
    };

    mockPrompt = {
      generateChatHistory: jest.fn<IPrompt['generateChatHistory']>(),
    };

    formatter = new OpenAIRequestFormatter(reasoningProcessor, mockAnonymizer);
  });

  it('should format a basic request', () => {
    const history: IChatMessage[] = [{ role: 'user', content: 'hello' }];
    mockPrompt.generateChatHistory.mockReturnValue(history);

    const result = formatter.formatRequest(mockPrompt, 'test-model', {
      maxTokens: 100,
      stream: false
    });

    expect(result.model).toBe('test-model');
    expect(result.max_tokens).toBe(100);
    expect(result.stream).toBeUndefined();
    expect(result.messages[0].content).toBe('anon_hello');
  });

  it('should include tools if provided', () => {
    mockPrompt.generateChatHistory.mockReturnValue([]);
    const tools: IToolDefinition[] = [{
      name: 'test_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} }
    }];

    const result = formatter.formatRequest(mockPrompt, 'test-model', {
      maxTokens: 100,
      stream: false,
      tools: tools
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools?.[0].type).toBe('function');
    expect(result.tools?.[0].function.name).toBe('test_tool');
  });

  it('should enable streaming if requested', () => {
    mockPrompt.generateChatHistory.mockReturnValue([]);
    const result = formatter.formatRequest(mockPrompt, 'test-model', {
      maxTokens: 100,
      stream: true
    });
    expect(result.stream).toBe(true);
  });

  it('should not anonymize non-user messages', () => {
    const history: IChatMessage[] = [{ role: 'assistant', content: 'hello' }];
    mockPrompt.generateChatHistory.mockReturnValue(history);

    const result = formatter.formatRequest(mockPrompt, 'test-model', {
      maxTokens: 100,
      stream: false
    });

    expect(result.messages[0].content).toBe('hello');
    expect(mockAnonymizer.anonymize).not.toHaveBeenCalled();
  });
});
