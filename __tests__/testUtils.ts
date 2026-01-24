import { ChatMessage, ILlmProvider, IPrompt, ToolDefinition } from "../src/types.js";

export class FakeProvider implements ILlmProvider {
    private callCount = 0;
    public get queryCount() { return this.callCount; }
    constructor(private responses: (ChatMessage | null)[]) { }

    async query(_prompt: IPrompt, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<ChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        return this.getNextResponse();
    }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<ChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        const response = this.getNextResponse();
        if (response && response.content) {
            onToken(response.content);
        }
        return response || null;
    }

    private getNextResponse(): ChatMessage | null {
        if (this.callCount < this.responses.length) {
            return this.responses[this.callCount++];
        }
        return null;
    }
}
