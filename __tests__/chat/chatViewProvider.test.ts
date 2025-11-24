import type {
  UriLike,
  IVscodeApiLocal,
  IProviderAccessor,
  IChatResponder,
  IWebview,
  IWebviewView,
  WebviewMessage,
  WebviewResponseMessage,
  IDisposable
} from '../../src/chat/types.js';
import { ChatViewProvider } from '../../src/chat/chatViewProvider.js';
import { eventBus } from '../../src/events/eventBus.js';

describe('ChatViewProvider (integration, no vscode mocks)', () => {
  it('sets up webview, sets html and handles messages (tokens + completion)', async () => {
    const extensionUri: UriLike = { fsPath: '/ext' };

    // fake vscodeApi.Uri.joinPath
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        joinPath: (base: UriLike, ...paths: string[]) => ({ base, paths } as UriLike)
      }
    };

    const providerAccessor: IProviderAccessor = {
      getModels: () => ['m1', 'm2'],
      getActiveModel: () => 'm2'
    };

    // capture postMessage calls
    const posted: WebviewResponseMessage[] = [];

    // implement a fake webview that converts URIs
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        // expose the handler for test to call
        webview.__handler = handler;
        return { dispose: () => {} };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (msg: WebviewResponseMessage) => {
        posted.push(msg);
        return Promise.resolve(true);
      }
    };

    const webviewView: IWebviewView = { title: 'SUGGESTIO: CHAT', webview };

    // logic handler that emits two tokens
    const tokensEmitted: string[] = [];
    const logicHandler: IChatResponder = {
      fetchStreamChatResponse: async (prompt: string, onToken: (t: string) => void) => {
        onToken('tok1');
        onToken('tok2');
        tokensEmitted.push(prompt);
        return Promise.resolve();
      },
      clearHistory: () => {
        (logicHandler as unknown as { _cleared?: boolean })._cleared = true;
      }
    };

    const buildContext = () => 'CONTEXT';

    let receivedArgs: { extensionUri: UriLike; scriptUri: UriLike; highlightCssUri: UriLike; models: string[]; activeModel: string } | null = null;
    const getChatWebviewContent = (args: { extensionUri: UriLike; scriptUri: UriLike; highlightCssUri: UriLike; models: string[]; activeModel: string }) => {
      receivedArgs = args;
      return `HTML for ${args.models.join(',')}`;
    };

    const provider = new ChatViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler,
      buildContext,
      getChatWebviewContent,
      vscodeApi
    });

    // Resolve the view
    provider.resolveWebviewView(webviewView);

    // webview title cleared
    expect(webviewView.title).toBe('');
    // options set
    expect(webview.options).toBeDefined();
    expect(webview.options?.enableScripts).toBe(true);
    expect(webview.options?.localResourceRoots?.[0]).toBe(extensionUri);

    // getChatWebviewContent called with proper args
    expect(receivedArgs).not.toBeNull();
    expect(receivedArgs!.models).toEqual(['m1', 'm2']);
    expect(receivedArgs!.activeModel).toBe('m2');
    // html set
    expect(webview.html).toBe('HTML for m1,m2');

    // simulate sending a message
    const handler = webview.__handler as (msg: WebviewMessage) => Promise<void>;
    await handler({ command: 'sendMessage', text: 'hello' });

    // tokens should have been posted followed by completion
    expect(posted).toEqual([
      { sender: 'assistant', type: 'token', text: 'tok1' },
      { sender: 'assistant', type: 'token', text: 'tok2' },
      { sender: 'assistant', type: 'completion', text: '' }
    ]);

    // ensure prompt included buildContext and message
    expect(tokensEmitted.length).toBe(1);
    expect(tokensEmitted[0]).toContain('CONTEXT');
    expect(tokensEmitted[0]).toContain('hello');
  });

  it('emits modelChanged and calls clearHistory and reports errors', async () => {
    const extensionUri: UriLike = { fsPath: '/ext' };
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        joinPath: (b: UriLike, ...p: string[]) => ({ b, p } as UriLike)
      }
    };

    const providerAccessor: IProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    const posted: WebviewResponseMessage[] = [];
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler;
        return { dispose: () => {} };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (msg: WebviewResponseMessage) => {
        posted.push(msg);
        return Promise.resolve(true);
      }
    };
    const webviewView: IWebviewView = { title: 'X', webview };

    let cleared = false;
    const logicHandler: IChatResponder = {
      fetchStreamChatResponse: async () => {
        throw new Error('boom');
      },
      clearHistory: () => {
        cleared = true;
      }
    };

    const provider = new ChatViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler,
      buildContext: () => '',
      getChatWebviewContent: () => '',
      vscodeApi
    });

    provider.resolveWebviewView(webviewView);

    // listen to eventBus
    let emittedModel: string = '';
    eventBus.on('modelChanged', (m: string) => {
      emittedModel = m;
    });

    // trigger modelChanged
    const handler = webview.__handler as (msg: WebviewMessage) => Promise<void>;
    await handler({ command: 'modelChanged', model: 'new-model' });
    expect(emittedModel).toBe('new-model');

    // trigger clearHistory
    await handler({ command: 'clearHistory' });
    expect(cleared).toBe(true);

    // trigger sendMessage which will error
    await handler({ command: 'sendMessage', text: 'x' });
    // last posted message should be error message
    const last = posted[posted.length - 1];
    expect(last).toBeDefined();
    expect(typeof last.text).toBe('string');
    expect(last.text).toContain('Sorry, there was an error processing your request');
  });

  it('ignores unknown commands (no-op branch)', async () => {
    const extensionUri: UriLike = { fsPath: '/ext' };
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        joinPath: (b: UriLike, ...p: string[]) => ({ b, p } as UriLike)
      }
    };

    const providerAccessor: IProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    const posted: WebviewResponseMessage[] = [];
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler;
        return { dispose: () => {} };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (msg: WebviewResponseMessage) => {
        posted.push(msg);
        return Promise.resolve(true);
      }
    };
    const webviewView: IWebviewView = { title: 'X', webview };

    const logicHandler: IChatResponder = {
      fetchStreamChatResponse: async () => {
        /* not called */
      },
      clearHistory: () => {
        /* not called */
      }
    };

    const provider = new ChatViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler,
      buildContext: () => '',
      getChatWebviewContent: () => '',
      vscodeApi
    });

    provider.resolveWebviewView(webviewView);

    // send an unknown command
    const handler = webview.__handler as (msg: unknown) => Promise<void>;
    await handler({ command: 'unknown' });

    // nothing should have been posted
    expect(posted.length).toBe(0);
  });
});
