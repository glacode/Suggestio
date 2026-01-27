import { 
    ChatMessage, 
    ILlmProvider, 
    IPrompt, 
    ToolDefinition, 
    IUriLike, 
    IVscodeApiLocal, 
    IWebview, 
    IWebviewView,
    IDisposable,
    MessageFromTheExtensionToTheWebview,
    ITextDocument,
    IIgnoreManager,
    Config,
    IChatHistoryManager,
    ChatHistory
} from "../src/types.js";
import { jest } from "@jest/globals";

export class FakeProvider implements ILlmProvider {
    private callCount = 0;
    public get queryCount() { return this.callCount; }
    constructor(private responses: (ChatMessage | null)[]) { }

    async query (_prompt: IPrompt, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<ChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        return this.getNextResponse();
    }

    async queryStream (_prompt: IPrompt, onToken: (token: string) => void, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<ChatMessage | null> {
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

export const createMockUri = (path: string): IUriLike => ({
    fsPath: path,
    toString: () => path
});

export const createMockVscodeApi = (
    joinPathImpl: (base: IUriLike, ...paths: string[]) => IUriLike = 
        (_b, ..._p) => ({ fsPath: 'joined', toString: () => 'joined' })
): IVscodeApiLocal => ({
    Uri: {
        joinPath: joinPathImpl
    }
});

export const createMockWebview = (posted: MessageFromTheExtensionToTheWebview[] = []): IWebview & { __handler?: (msg: any) => void } => {
    const webview: IWebview & { __handler?: (msg: any) => void } = {
        options: undefined,
        asWebviewUri: (uri: IUriLike) => ({
            fsPath: `webview:${JSON.stringify(uri)}`,
            toString: () => `webview:${JSON.stringify(uri)}`
        }),
        html: '',
        onDidReceiveMessage<T>(handler: (msg: T) => void): IDisposable {
            webview.__handler = handler;
            return { dispose: () => { } };
        },
        postMessage: (msg: MessageFromTheExtensionToTheWebview) => {
            posted.push(msg);
            return Promise.resolve(true);
        }
    };
    return webview;
};

export const createMockWebviewView = (webview: IWebview, title: string = ''): IWebviewView => ({
    title,
    webview
});

export const createMockDocument = (content: string = 'content', languageId: string = 'typescript'): ITextDocument => ({
    uri: createMockUri('/path/to/file.ts'),
    languageId,
    lineCount: content.split('\n').length,
    lineAt: (line: number) => ({ text: content.split('\n')[line] }),
});

export const createMockProvider = (): jest.Mocked<ILlmProvider> => ({
    query: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<ChatMessage | null>>(),
    queryStream: jest.fn<(prompt: any, onToken: any, tools?: any, signal?: any) => Promise<ChatMessage | null>>(),
});

export const createMockIgnoreManager = (): jest.Mocked<IIgnoreManager> => ({
    shouldIgnore: jest.fn<(filePath: string) => Promise<boolean>>().mockResolvedValue(false),
});

export const createMockHistoryManager = (recorded: ChatHistory = []): IChatHistoryManager => ({
    clearHistory: () => { recorded.length = 0; },
    addMessage: (m) => { recorded.push(m); },
    getChatHistory: () => [...recorded]
});

export const createDefaultConfig = (overrides: Partial<Config> = {}): Config => ({
    activeProvider: 'test',
    enableInlineCompletion: true,
    providers: {},
    anonymizer: { enabled: false, words: [] },
    ...overrides
});