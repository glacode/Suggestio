// __tests__/src/chat/chat.test.ts
import type { Config } from '../../../src/config/types.js';
import { Chat, IChatParams, IVscodeLike } from '../../../src/chat/chat.js';
import { ChatLogicHandler } from '../../../src/chat/chatLogicHandler.js';

// Fake Webview implementing minimal interface
class FakeWebview {
    html = '';
    lastMessage: any = null;
    private handler: (msg: any) => void = () => {};

    postMessage(msg: any) {
        this.lastMessage = msg;
        return Promise.resolve(true);
    }

    onDidReceiveMessage(handler: (msg: any) => void) {
        this.handler = handler;
    }

    async receiveMessage(msg: any) {
        return this.handler(msg);
    }

    asWebviewUri(uri: any) {
        return `webview-uri:${uri.path ?? uri}`;
    }
}

// Minimal WebviewPanel-like
class FakeWebviewPanel {
    webview = new FakeWebview();
}

// Fake logic handler
class FakeLogicHandler {
    async fetchCompletion(prompt: string) {
        return 'FAKE_RESPONSE: ' + prompt;
    }
}

// Minimal fake VSCode module
const fakeVscode: IVscodeLike = {
    window: {
        createWebviewPanel: (_viewType, _title, _showOptions, _options) => new FakeWebviewPanel()
    },
    ViewColumn: { Beside: 1 },
    Uri: {
        joinPath: (base: any, ...paths: string[]) => {
            return { path: [base.path ?? base, ...paths].join('/') };
        }
    }
};

test('Chat should handle sendMessage', async () => {
    // Type-safe Config object
    const fakeConfig: Config = {
        activeProvider: 'llm7-qwen32',
        providers: {
            'llm7-qwen32': {
                endpoint: 'https://api.llm7.io/v1/chat/completions',
                model: 'qwen2.5-coder-32b-instruct',
                apiKey: 'dummy'
            }
        },
        anonymizer: {
            enabled: false,
            words: []
        }
    };

    const fakeContext = { extensionUri: { path: '/fake/extension' } } as any;

    const chatParams: IChatParams = {
        context: fakeContext,
        config: fakeConfig,
        vscode: fakeVscode, // inject fake VSCode
        webViewPanel: new FakeWebviewPanel(), // inject fake panel
        logicHandler: new FakeLogicHandler() as unknown as ChatLogicHandler,
        getWebviewContent: () => '<html>Test</html>',
        buildContext: () => 'FAKE_CONTEXT'
    };

    // Instantiate Chat
    void new Chat(chatParams);

    // Retrieve the fake panel from the chat
    const fakePanel = (chatParams.webViewPanel ??
        fakeVscode.window.createWebviewPanel('suggestioChat', 'Suggestio Chat', 1)) as FakeWebviewPanel;

    // Send a message
    await fakePanel.webview.receiveMessage({ command: 'sendMessage', text: 'Hello' });

    // Wait a tick for async handling
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assertions
    expect(fakePanel.webview.lastMessage).toBeDefined();
    expect(fakePanel.webview.lastMessage.sender).toBe('assistant');
    expect(fakePanel.webview.lastMessage.text).toContain('FAKE_RESPONSE');
    expect(fakePanel.webview.html).toBe('<html>Test</html>');
});


test('Chat should handle errors in sendMessage', async () => {
    const fakeConfig: Config = {
        activeProvider: 'llm7-qwen32',
        providers: {
            'llm7-qwen32': {
                endpoint: 'https://api.llm7.io/v1/chat/completions',
                model: 'qwen2.5-coder-32b-instruct',
                apiKey: 'dummy'
            }
        },
        anonymizer: {
            enabled: false,
            words: []
        }
    };

    const fakeContext = { extensionUri: { path: '/fake/extension' } } as any;

    // Logic handler that throws
    class ErrorLogicHandler {
        async fetchCompletion(_prompt: string) {
            throw new Error('Simulated failure');
        }
    }

    const fakePanel = new FakeWebviewPanel();

    const chatParams: IChatParams = {
        context: fakeContext,
        config: fakeConfig,
        vscode: fakeVscode,
        webViewPanel: fakePanel,
        logicHandler: new ErrorLogicHandler() as unknown as ChatLogicHandler,
        getWebviewContent: () => '<html>ErrorTest</html>',
        buildContext: () => 'FAKE_CONTEXT'
    };

    void new Chat(chatParams);

    // Trigger sendMessage
    await fakePanel.webview.receiveMessage({ command: 'sendMessage', text: 'Hello' });

    // Wait for async
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assertions for error branch
    expect(fakePanel.webview.lastMessage).toBeDefined();
    expect(fakePanel.webview.lastMessage.sender).toBe('assistant');
    expect(fakePanel.webview.lastMessage.text).toContain('Sorry, there was an error processing your request');
    expect(fakePanel.webview.lastMessage.text).toContain('Simulated failure');
});


test('Chat should ignore unknown commands', async () => {
    const fakePanel = new FakeWebviewPanel();

    const chatParams: IChatParams = {
        context: { extensionUri: { path: '/fake' } } as any,
        config: {
            activeProvider: 'llm7-qwen32',
            providers: {
                'llm7-qwen32': {
                    endpoint: 'https://api.llm7.io/v1/chat/completions',
                    model: 'qwen2.5-coder-32b-instruct',
                    apiKey: 'dummy'
                }
            },
            anonymizer: { enabled: false, words: [] }
        },
        vscode: fakeVscode,
        webViewPanel: fakePanel,
        logicHandler: new FakeLogicHandler() as unknown as ChatLogicHandler,
        getWebviewContent: () => '<html>IgnoreTest</html>',
        buildContext: () => 'FAKE_CONTEXT'
    };

    void new Chat(chatParams);

    // Send an irrelevant command
    await fakePanel.webview.receiveMessage({ command: 'otherCommand', text: 'Ignored' });

    // Wait for async (though nothing should happen)
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assertion: lastMessage is still null because handler did nothing
    expect(fakePanel.webview.lastMessage).toBeNull();
});
