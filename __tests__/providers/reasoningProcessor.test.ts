import { describe, it, expect } from '@jest/globals';
import { StandardReasoningProcessor } from '../../src/providers/reasoningProcessor.js';

describe('StandardReasoningProcessor', () => {
    const processor = new StandardReasoningProcessor();

    it('should handle standard content delta', () => {
        const delta = { content: 'Hello' };
        const result = processor.process(delta);
        expect(result).toEqual({ content: 'Hello' });
    });

    it('should handle standard reasoning delta (reasoning field)', () => {
        const delta = { reasoning: 'Thinking...' };
        const result = processor.process(delta);
        expect(result).toEqual({ reasoning: 'Thinking...' });
    });

    it('should handle standard reasoning delta (reasoning_content field)', () => {
        const delta = { reasoning_content: 'Thinking...' };
        const result = processor.process(delta);
        expect(result).toEqual({ reasoning: 'Thinking...' });
    });

    it('should handle Gemma4 reasoning (extra_content flag)', () => {
        const delta = { 
            content: 'Gemma thinking', 
            extra_content: { google: { thought: true } } 
        };
        const result = processor.process(delta);
        expect(result).toEqual({ reasoning: 'Gemma thinking' });
    });

    it('should strip <thought> tags from reasoning', () => {
        const delta = { reasoning: '<thought>I am thinking</thought>' };
        const result = processor.process(delta);
        expect(result).toEqual({ reasoning: 'I am thinking' });
    });

    it('should strip <thought> tags from content', () => {
        const delta = { content: '<thought>Some thought</thought>' };
        const result = processor.process(delta);
        expect(result).toEqual({ reasoning: undefined, content: 'Some thought' });
    });

    it('should strip partial <thought> tags', () => {
        const delta = { content: '<thought>' };
        const result = processor.process(delta);
        expect(result).toEqual({ content: '', reasoning: undefined });
        
        const delta2 = { content: '</thought>' };
        const result2 = processor.process(delta2);
        expect(result2).toEqual({ content: '', reasoning: undefined });
    });

    it('should handle mixed content and reasoning', () => {
        const delta = { content: 'Hello', reasoning: 'Thinking' };
        const result = processor.process(delta);
        expect(result).toEqual({ content: 'Hello', reasoning: 'Thinking' });
    });

    it('should handle empty delta', () => {
        const delta = {};
        const result = processor.process(delta);
        expect(result).toEqual({ content: undefined, reasoning: undefined });
    });

    describe('prepareHistoryMessage', () => {
        it('should merge reasoning into content with tags for assistant messages', () => {
            const message = { 
                role: 'assistant' as const, 
                content: 'The answer is 42.', 
                reasoning: 'Calculating 6 * 7' 
            };
            const result = processor.prepareHistoryMessage(message);
            expect(result.content).toBe('<thought>\nCalculating 6 * 7\n</thought>\nThe answer is 42.');
            expect(result.role).toBe('assistant');
            expect(result.reasoning).toBeUndefined(); // Should be removed from output
        });

        it('should not merge reasoning for non-assistant messages (sanity check)', () => {
            const message = { 
                role: 'user' as const, 
                content: 'Hello', 
                reasoning: 'Some internal state' 
            };
            const result = processor.prepareHistoryMessage(message);
            expect(result.content).toBe('Hello');
            expect(result.reasoning).toBeUndefined();
        });

        it('should handle assistant messages without reasoning', () => {
            const message = { 
                role: 'assistant' as const, 
                content: 'No reasoning here' 
            };
            const result = processor.prepareHistoryMessage(message);
            expect(result.content).toBe('No reasoning here');
        });

        it('should preserve tool calls and other fields', () => {
            const message = { 
                role: 'assistant' as const, 
                content: '', 
                reasoning: 'I need to list files',
                tool_calls: [{ id: '1', type: 'function', function: { name: 'list', arguments: '{}' } }]
            };
            const result = processor.prepareHistoryMessage(message);
            expect(result.content).toContain('<thought>\nI need to list files\n</thought>');
            expect(result.tool_calls).toHaveLength(1);
            expect(result.tool_calls[0].id).toBe('1');
        });
    });
});
