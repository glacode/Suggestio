import { OpenAIResponseParser } from '../../src/providers/openAIResponseParser.js';
import { LLM_MESSAGES } from '../../src/constants/messages.js';
import { expect } from '@jest/globals';


describe('OpenAIResponseParser', () => {
  let parser: OpenAIResponseParser;

  beforeEach(() => {
    parser = new OpenAIResponseParser();
  });

  describe('parseResponse', () => {
    it('should parse a valid response with content', () => {
      const json = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello world'
          }
        }]
      };
      const result = parser.parseResponse(json);
      expect(result?.content).toBe('Hello world');
      expect(result?.tool_calls).toBeNull();
    });

    it('should parse reasoning and tool calls', () => {
      const json = {
        choices: [{
          message: {
            content: 'I will call a tool',
            reasoning: 'Checking files...',
            tool_calls: [{
              id: '123',
              type: 'function',
              function: { name: 'list_files', arguments: '{}' }
            }]
          }
        }]
      };
      const result = parser.parseResponse(json);
      expect(result?.content).toBe('I will call a tool');
      expect(result?.reasoning).toBe('Checking files...');
      expect(result?.tool_calls?.[0].function.name).toBe('list_files');
    });

    it('should throw MISSING_CHOICES if choices are missing', () => {
      const json = { choices: [] };
      expect(() => parser.parseResponse(json)).toThrow(LLM_MESSAGES.MISSING_CHOICES);
    });

    it('should throw MISSING_CHOICES if response is empty object', () => {
      const json = { foo: 'bar' };
      expect(() => parser.parseResponse(json)).toThrow(LLM_MESSAGES.MISSING_CHOICES);
    });

    it('should handle API error objects', () => {
      const json = {
        error: { message: 'Rate limit exceeded' }
      };
      expect(() => parser.parseResponse(json)).toThrow(LLM_MESSAGES.OPENAI_GENERIC_ERROR('Rate limit exceeded'));
    });

    it('should return null if message choice is missing', () => {
      const json = {
        choices: [{
          // message is missing
        }]
      };
      expect(parser.parseResponse(json)).toBeNull();
    });
  });

  describe('parseStreamChunk', () => {
    it('should parse a valid chunk with delta content', () => {
      const json = {
        choices: [{
          delta: { content: 'hello' }
        }]
      };
      const result = parser.parseStreamChunk(json);
      expect(result?.delta?.content).toBe('hello');
      expect(result?.finish_reason).toBeUndefined();
    });

    it('should parse a chunk with finish_reason', () => {
      const json = {
        choices: [{
          delta: {},
          finish_reason: 'stop'
        }]
      };
      const result = parser.parseStreamChunk(json);
      expect(result?.finish_reason).toBe('stop');
    });

    it('should return null if no choices', () => {
      const json = { choices: [] };
      expect(parser.parseStreamChunk(json)).toBeNull();
    });

    it('should throw if chunk is malformed (choices not an array)', () => {
      const json = { choices: 'not an array' };
      expect(() => parser.parseStreamChunk(json)).toThrow(new RegExp(LLM_MESSAGES.MALFORMED_RESPONSE("")));
    });
  });
});
