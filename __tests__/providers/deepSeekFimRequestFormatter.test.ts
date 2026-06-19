import { DeepSeekFimRequestFormatter } from '../../src/providers/deepSeekFimRequestFormatter.js';
import { FimPrompt } from '../../src/completion/promptBuilder/fimPrompt.js';
import { IAnonymizer, IPrompt, IChatMessage } from '../../src/types.js';
import { expect, jest } from '@jest/globals';

describe('DeepSeekFimRequestFormatter', () => {
  let mockAnonymizer: jest.Mocked<IAnonymizer>;

  beforeEach(() => {
    mockAnonymizer = {
      anonymize: jest.fn((s: string) => `anon_${s}`),
      deanonymize: jest.fn((s: string) => s.replace('anon_', '')),
      createStreamingDeanonymizer: jest.fn()
    };
  });

  it('maps a FimPrompt prefix/suffix onto prompt/suffix fields', () => {
    // Arrange
    const formatter = new DeepSeekFimRequestFormatter();
    const prompt = new FimPrompt('const x =', ';\nreturn x;');

    // Act
    const result = formatter.formatRequest(prompt, 'deepseek-fim', {
      maxTokens: 256,
      stream: false
    });

    // Assert
    expect(result.model).toBe('deepseek-fim');
    expect(result.prompt).toBe('const x =');
    expect(result.suffix).toBe(';\nreturn x;');
    expect(result.max_tokens).toBe(256);
    expect(result.stream).toBeUndefined();
    // FIM bodies must never carry chat-only fields.
    expect('messages' in result).toBe(false);
  });

  it('omits the suffix field when there is no code after the cursor', () => {
    // Arrange
    const formatter = new DeepSeekFimRequestFormatter();
    const prompt = new FimPrompt('const x =', '');

    // Act
    const result = formatter.formatRequest(prompt, 'deepseek-fim', {
      maxTokens: 256,
      stream: false
    });

    // Assert
    expect(result.suffix).toBeUndefined();
  });

  it('enables streaming when requested', () => {
    // Arrange
    const formatter = new DeepSeekFimRequestFormatter();
    const prompt = new FimPrompt('a', 'b');

    // Act
    const result = formatter.formatRequest(prompt, 'm', { maxTokens: 10, stream: true });

    // Assert
    expect(result.stream).toBe(true);
  });

  it('anonymizes prefix and suffix when an anonymizer is configured', () => {
    // Arrange
    const formatter = new DeepSeekFimRequestFormatter(mockAnonymizer);
    const prompt = new FimPrompt('secret_prefix', 'secret_suffix');

    // Act
    const result = formatter.formatRequest(prompt, 'm', { maxTokens: 10, stream: false });

    // Assert
    expect(result.prompt).toBe('anon_secret_prefix');
    expect(result.suffix).toBe('anon_secret_suffix');
  });

  it('falls back to chat history as the prompt for a non-FIM prompt', () => {
    // Arrange
    const formatter = new DeepSeekFimRequestFormatter();
    const history: IChatMessage[] = [{ role: 'user', content: 'plain text' }];
    const chatPrompt: IPrompt = { generateChatHistory: () => history };

    // Act
    const result = formatter.formatRequest(chatPrompt, 'm', { maxTokens: 10, stream: false });

    // Assert
    expect(result.prompt).toBe('plain text');
    expect(result.suffix).toBeUndefined();
  });
});
