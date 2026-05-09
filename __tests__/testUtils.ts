import {
    IChatMessage,
    ILlmProvider,
    IPrompt,
    IToolDefinition,
    IUriLike,
    IVscodeApiLocal,
    IWebview,
    IWebviewView,
    IDisposable,
    MessageFromTheExtensionToTheWebview,
    WebviewMessage,
    IWebviewApi,
    ITextDocument,
    IIgnoreManager,
    IConfig,
    IChatHistoryManager,
    IStoredChatMessage,
    IProfileConfig,
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
    IConfigProvider,
    IDiffManager,
    IHttpClient,
    IPersistentChatHistoryManager,
    IWorkspaceChatHistoryStorage,
    IFileDeleter,
    IExtensionContextMinimal
} from "../src/types.js";
import { ILogger } from "../src/log/logger.js";
import { CONFIG_DEFAULTS } from "../src/constants/config.js";
import { jest } from "@jest/globals";
import * as path from 'path';

export class FakeProvider implements ILlmProvider {
    private callCount = 0;
    public get queryCount() { return this.callCount; }
    constructor(private responses: (IChatMessage | null)[], private eventBus?: IEventBus) { }

    async query(_prompt: IPrompt, _tools?: IToolDefinition[], signal?: AbortSignal): Promise<IChatMessage | null> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        return this.getNextResponse();
    }

    async queryStream(_prompt: IPrompt, _tools?: IToolDefinition[], signal?: AbortSignal): Promise<IChatMessage[]> {
        if (signal?.aborted) { throw new Error("Aborted"); }
        const response = this.getNextResponse();
        if (response) {
            if (response.content && this.eventBus) {
                this.eventBus.emit('agent:token', { token: response.content, type: 'content' });
            }
            if (response.reasoning && this.eventBus) {
                this.eventBus.emit('agent:token', { token: response.reasoning, type: 'reasoning' });
            }
            return [response];
        }
        return [];
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
        joinPath: joinPathImpl,
        parse: jest.fn((s: string) => {
            const normalized = s.startsWith('suggestio-diff:/') ? s : s.replace('suggestio-diff:', 'suggestio-diff:/');
            return { fsPath: s, toString: () => normalized };
        })
    },
    commands: {
        executeCommand: jest.fn<any>().mockResolvedValue(undefined)
    },
    window: {
        tabGroups: {
            all: [],
            close: jest.fn<any>().mockResolvedValue(undefined)
        }
    }
});

export class MockWebviewApi implements IWebviewApi {
    public messages: WebviewMessage[] = [];
    private state: any = undefined;

    postMessage(message: WebviewMessage): void {
        this.messages.push(message);
    }

    getState(): any {
        return this.state;
    }

    setState(state: any): any {
        this.state = state;
        return state;
    }
}

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

export const createMockHttpClient = (): jest.Mocked<IHttpClient> => ({
    post: jest.fn<IHttpClient["post"]>(),
});

export const createMockProvider = (): jest.Mocked<ILlmProvider> => ({
    query: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<IChatMessage | null>>(),
    queryStream: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<IChatMessage[]>>(),
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

export const createMockHistoryManager = (recorded: IStoredChatMessage[] = []): jest.Mocked<IChatHistoryManager> => ({
    clearHistory: jest.fn(() => { recorded.length = 0; }),
    addMessage: jest.fn((m: IChatMessage) => { recorded.push(m); }),
    getChatHistory: jest.fn(() => [...recorded])
});

export const createMockPersistentHistoryManager = (recorded: IStoredChatMessage[] = []): jest.Mocked<IPersistentChatHistoryManager> => ({
    clearHistory: jest.fn(() => { recorded.length = 0; }),
    addMessage: jest.fn((m: IChatMessage) => { recorded.push(m); }),
    getChatHistory: jest.fn(() => [...recorded]),
    getSessions: jest.fn<IPersistentChatHistoryManager["getSessions"]>().mockResolvedValue([]),
    loadSession: jest.fn<IPersistentChatHistoryManager["loadSession"]>().mockResolvedValue(undefined),
    newSession: jest.fn<IPersistentChatHistoryManager["newSession"]>(),
    persistCurrentSession: jest.fn<IPersistentChatHistoryManager["persistCurrentSession"]>()
});

export const createMockDiffManager = (): jest.Mocked<IDiffManager> => ({
    showDiff: jest.fn<any>().mockResolvedValue(undefined),
    closeDiff: jest.fn<any>().mockResolvedValue(undefined),
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
    rootUri: jest.fn(),
    storagePath: jest.fn(),
});

export const createMockWorkspaceProviderFull = (): jest.Mocked<IWorkspaceProviderFull> => ({
    rootPath: jest.fn(),
    rootUri: jest.fn(),
    storagePath: jest.fn(),
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
    isDirectory: jest.fn(),
});

export const createMockDirectoryCreator = (): jest.Mocked<IDirectoryCreator> => ({
    mkdir: jest.fn(),
});

export const createMockDirectoryProvider = (): jest.Mocked<IDirectoryProvider> => ({
    readdir: jest.fn(),
    exists: jest.fn(),
    isDirectory: jest.fn(),
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
    getLogLevel: jest.fn<() => string>(),
    getMaxAgentIterations: jest.fn<() => number>(),
    getAnonymizerEnabled: jest.fn<() => boolean | undefined>(),
    getEnableInlineCompletion: jest.fn<() => boolean>(),
    getMaxRetries: jest.fn<() => number>(),
    getInitialDelay: jest.fn<() => number>(),
    getMaxSavedChatSessions: jest.fn<() => number>(),
    onDidChangeConfiguration: jest.fn<any>(),
});

export const createMockProfileConfig = (overrides: Partial<IProfileConfig> = {}): IProfileConfig => ({
    model: "fake-model",
    apiKey: "fake-key",
    ...overrides
});

export const createDefaultConfig = (overrides: Partial<IConfig> = {}): IConfig => ({
    activeChatProfile: 'test',
    enableInlineCompletion: true,
    profiles: {},
    anonymizer: { enabled: false, words: [] },
    logLevel: CONFIG_DEFAULTS.LOG_LEVEL,
    maxAgentIterations: CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS,
    toolResultMaxLength: CONFIG_DEFAULTS.TOOL_RESULT_MAX_LENGTH,
    maxRetries: CONFIG_DEFAULTS.MAX_RETRIES,
    initialDelay: CONFIG_DEFAULTS.INITIAL_DELAY,
    maxSavedChatSessions: CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS,
    autoAcceptEdits: false,
    ...overrides
});

export function createMockDomRect(overrides: Partial<DOMRect> = {}): DOMRect {
    return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...overrides
    };
}

export function setupChatDom() {
    document.body.innerHTML = `
        <div class="chat-container">
            <div id="chat"></div>
            <div class="chat-input">
                <div class="input-wrapper">
                    <div id="inputLoadingIndicator"></div>
                    <textarea id="messageInput"></textarea>
                    <div class="chat-controls">
                        <div id="modelSelector">
                            <div class="dropdown-label">
                                <span class="chat-profile-label"></span>
                            </div>
                            <div class="dropdown-content"></div>
                        </div>
                        <div class="send-icon"></div>
                    </div>
                </div>
            </div>
            <div id="emptyChatContent"></div>
        </div>
    `;
}

export const createMockWorkspaceChatHistoryStorage = (): jest.Mocked<IWorkspaceChatHistoryStorage> => ({
    loadSessions: jest.fn<IWorkspaceChatHistoryStorage["loadSessions"]>().mockReturnValue([]),
    saveSession: jest.fn<IWorkspaceChatHistoryStorage["saveSession"]>()
});

export const createMockFileDeleter = (): jest.Mocked<IFileDeleter> => ({
    delete: jest.fn()
});

export interface IMockWebviewViewResolveContext<T = any> {
    readonly state: T | undefined;
}

export interface IMockCancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested: (listener: (e: any) => any) => IDisposable;
}

export const createMockWebviewViewResolveContext = <T = any>(): IMockWebviewViewResolveContext<T> => ({
    state: undefined
});

export const createMockCancellationToken = (): IMockCancellationToken => ({
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(() => ({ dispose: () => { } }))
});

export const createMockExtensionContextMinimal = (overrides: Partial<IExtensionContextMinimal> = {}): IExtensionContextMinimal => ({
    extensionUri: createMockUri('/path/to/extension'),
    globalStorageUri: createMockUri('/path/to/globalStorage'),
    ...overrides
});
