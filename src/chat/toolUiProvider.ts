import { IToolImplementation, IToolUiOptions, IToolUiProvider, IChatMessage } from '../types.js';

/**
 * Default implementation of IToolUiProvider that uses tool implementations.
 */
export class ToolUiProvider implements IToolUiProvider {
    constructor(private readonly tools: IToolImplementation<any>[]) {}

    /**
     * Formats a descriptive message and provides UI options for a tool call.
     */
    getToolUI(toolName: string, args: string): { displayMessage?: string; uiOptions?: IToolUiOptions } {
        const tool = this.tools.find(t => t.definition.name === toolName);
        if (!tool) {
            return {};
        }

        let displayMessage: string | undefined;
        try {
            const parsedArgs = JSON.parse(args);
            if (tool.formatMessage) {
                displayMessage = tool.formatMessage(parsedArgs);
            }
        } catch (e) {
            // If parsing or formatting fails, we just don't provide a displayMessage
        }

        return {
            displayMessage,
            uiOptions: tool.uiOptions
        };
    }

    /**
     * Enriches a chat history with tool display messages and UI options.
     * Returns a deep copy with enriched tool calls.
     */
    enrichHistory(history: IChatMessage[]): any[] {
        return history.map(msg => {
            if (msg.role === 'assistant' && msg.tool_calls) {
                return {
                    ...msg,
                    tool_calls: msg.tool_calls.map(tc => {
                        const { displayMessage, uiOptions } = this.getToolUI(tc.function.name, tc.function.arguments);
                        return {
                            ...tc,
                            displayMessage,
                            uiOptions
                        };
                    })
                };
            }
            return msg;
        });
    }
}
