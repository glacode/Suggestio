import {
    IChatMessage,
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
    ChatHistory,
    IProviderConfig,
    IWindowProvider,
    IWorkspaceProvider,
    IFileContentReader,
    IFileContentWriter,
    IDirectoryReader,
    IDirectoryCreator,
    IPathResolver,
    IFileContentProvider,
    IDirectoryProvider,
    IWorkspaceProviderFull,
    IEventBus,
    IConfigProvider
} from "../src/types.js"; import { ILogger } from "../src/logger.js";
import { jest } from "@jest/globals";
import * as path from 'path';

export class FakeProvider implements ILlmProvider {
    private callCount = 0;
    public get queryCount() { return this.callCount; }
    constructor(private responses: (IChatMessage | null)[], private eventBus?: IEventBus) { }

    async query(_prompt: IPrompt, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<IChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        return this.getNextResponse();
    }

    async queryStream(_prompt: IPrompt, _tools?: ToolDefinition[], signal?: AbortSignal): Promise<IChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        const response = this.getNextResponse();
        if (response && response.content && this.eventBus) {
            this.eventBus.emit('agent:token', { token: response.content, type: 'content' });
        }
        if (response && response.reasoning && this.eventBus) {
            this.eventBus.emit('agent:token', { token: response.reasoning, type: 'reasoning' });
        }
        return response || null;
    }

    private getNextResponse(): IChatMessage | null {
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
    query: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<IChatMessage | null>>(),
    queryStream: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<IChatMessage | null>>(),
});

export const createMockEventBus = (): jest.Mocked<IEventBus> => ({
    on: jest.fn<any>(),
    once: jest.fn<any>(),
    off: jest.fn<any>(),
    emit: jest.fn<any>(),
    removeAllListeners: jest.fn<any>(),
});

export const createMockLogger = (): jest.Mocked<ILogger> => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setLogLevel: jest.fn(),
});

export const createMockIgnoreManager = (): jest.Mocked<IIgnoreManager> => ({
    shouldIgnore: jest.fn<(filePath: string) => Promise<boolean>>().mockResolvedValue(false),
});

export const createMockHistoryManager = (recorded: ChatHistory = []): IChatHistoryManager => ({
    clearHistory: () => { recorded.length = 0; },
    addMessage: (m) => { recorded.push(m); },
    getChatHistory: () => [...recorded]
});

export const createMockWindowProvider = (): jest.Mocked<IWindowProvider> => ({
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showTextDocument: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
});

export const createMockWorkspaceProvider = (): jest.Mocked<IWorkspaceProvider> => ({
    rootPath: jest.fn(),
});

export const createMockWorkspaceProviderFull = (): jest.Mocked<IWorkspaceProviderFull> => ({
    rootPath: jest.fn(),
    openTextDocument: jest.fn(),
});

export const createMockFileContentReader = (): jest.Mocked<IFileContentReader> => ({
    read: jest.fn(),
});

export const createMockFileContentWriter = (): jest.Mocked<IFileContentWriter> => ({
    write: jest.fn(),
});

export const createMockFileContentProvider = (): jest.Mocked<IFileContentProvider> => ({
    read: jest.fn(),
    write: jest.fn(),
});

export const createMockDirectoryReader = (): jest.Mocked<IDirectoryReader> => ({
    readdir: jest.fn(),
    exists: jest.fn(),
});

export const createMockDirectoryCreator = (): jest.Mocked<IDirectoryCreator> => ({
    mkdir: jest.fn(),
});

export const createMockDirectoryProvider = (): jest.Mocked<IDirectoryProvider> => ({
    readdir: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
});

export const createMockPathResolver = (): jest.Mocked<IPathResolver> => ({
    join: jest.fn((...paths: string[]) => path.join(...paths)),
    relative: jest.fn((from: string, to: string) => path.relative(from, to)),
    basename: jest.fn((p: string) => path.basename(p)),
    resolve: jest.fn((...paths: string[]) => path.resolve(...paths)),
    dirname: jest.fn((p: string) => path.dirname(p)),
});

export const createMockConfigProvider = (): jest.Mocked<IConfigProvider> => ({
    getLogLevel: jest.fn(),
    getMaxAgentIterations: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
});

export const createMockProviderConfig = (overrides: Partial<IProviderConfig> = {}): IProviderConfig => ({
    model: "fake-model",
    apiKey: "fake-key",
    ...overrides
});

export const createDefaultConfig = (overrides: Partial<Config> = {}): Config => ({
    activeProvider: 'test',
    enableInlineCompletion: true,
    providers: {},
    anonymizer: { enabled: false, words: [] },
    ...overrides
});