import { DeepSeekFimResponseParser } from '../../src/providers/deepSeekFimResponseParser.js';
import { expect } from '@jest/globals';

describe('DeepSeekFimResponseParser', () => {
  let parser: DeepSeekFimResponseParser;

  beforeEach(() => {
    parser = new DeepSeekFimResponseParser();
  });

  describe('parseResponse', () => {
    it('extracts completion text from choices[].text', () => {
      // Arrange
      const json = { choices: [{ text: ' a, b int', finish_reason: 'stop' }] };

      // Act
      const result = parser.parseResponse(json);

      // Assert
      expect(result?.content).toBe(' a, b int');
      expect(result?.reasoning).toBeNull();
      expect(result?.tool_calls).toBeNull();
    });

    it('throws a provider error when the response carries an error object', () => {
      // Arrange
      const json = { error: { message: 'invalid model' } };

      // Act / Assert
      expect(() => parser.parseResponse(json)).toThrow(/invalid model/);
    });

    it('throws when choices is empty', () => {
      // Arrange
      const json = { choices: [] };

      // Act / Assert
      expect(() => parser.parseResponse(json)).toThrow();
    });
  });

  describe('parseStreamChunk', () => {
    it('adapts FIM text onto the common delta.content field', () => {
      // Arrange
      const json = { choices: [{ text: 'hello', finish_reason: null }] };

      // Act
      const result = parser.parseStreamChunk(json);

      // Assert
      expect(result?.delta?.content).toBe('hello');
      expect(result?.finish_reason).toBeNull();
    });

    it('returns null when there are no choices', () => {
      // Arrange
      const json = { choices: [] };

      // Act
      const result = parser.parseStreamChunk(json);

      // Assert
      expect(result).toBeNull();
    });
  });
});
