// This test file uses `describe` to group related tests and `it` for individual test cases.
// It's designed to test the `ChatWebviewViewProvider` without actually using a full VS Code environment.
// Instead, it uses "mocks" (fake versions) of VS Code API parts and other dependencies.

// Import necessary types from the chat module. These define the shapes of objects
// like URIs, VS Code API, providers, webviews, and messages.
import type {
  UriLike, // A type representing a URI (Uniform Resource Identifier), similar to a file path.
  IVscodeApiLocal, // A type for a local, faked VS Code API.
  ILlmProviderAccessor, // A type for accessing language model (LLM) providers.
  IChatResponder, // A type for handling chat logic (sending/receiving messages).
  IChatHistoryManager, // A type for managing chat history (e.g., clearing it).
  IWebview, // A type representing the webview itself, which displays HTML content.
  IWebviewView, // A type representing the VS Code WebviewView, a container for the webview.
  WebviewMessage, // A type for messages sent *from* the webview (e.g., user input).
  ResponseMessageFromTheExtensionToTheWebview, // A type for messages sent *to* the webview (e.g., AI responses).
  IDisposable, // A type for objects that can be disposed (cleaned up).
  ChatRole,
  ChatHistory,
  IPrompt
} from '../../src/chat/types.js';
// Import the actual ChatWebviewViewProvider class that we are testing.
import { ChatWebviewViewProvider } from '../../src/chat/chatWebviewViewProvider.js';
// Import the event bus, a system for sending and receiving events across different parts of the application.
import { eventBus } from '../../src/events/eventBus.js';

// `describe` is used to group tests. Here, we're testing the `ChatWebviewViewProvider`.
// The description "integration, no vscode mocks" indicates that while we're using
// fakes for dependencies, we're testing how components integrate, and we're *not*
// using a full-blown VS Code mock framework, but rather simple hand-rolled fakes.
describe('ChatWebviewViewProvider (integration, no vscode mocks)', () => {

  // `it` defines a single test case. This one checks if the webview is set up correctly,
  // receives its HTML content, and can handle messages to get AI responses (tokens and completion).
  it('sets up webview, sets html and handles messages (tokens + completion)', async () => {
    // `extensionUri` represents the base path of our extension.
    // We're faking it with a simple object that has a `fsPath` property.
    const extensionUri: UriLike = { fsPath: '/ext' };

    // `vscodeApi` is a fake (mock) version of the VS Code API.
    // We only implement the parts that `ChatWebviewViewProvider` needs,
    // specifically `Uri.joinPath` which is used to construct paths for webview resources.
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        // This fake `joinPath` just returns an object showing what it received,
        // rather than creating an actual URI.
        joinPath: (base: UriLike, ...paths: string[]) => ({ base, paths } as UriLike)
      }
    };

    // `providerAccessor` is a fake that provides information about available
    // and active language models (LLMs).
    const providerAccessor: ILlmProviderAccessor = {
      // `getModels` returns a list of fake model names.
      getModels: () => ['m1', 'm2'],
      // `getActiveModel` returns the currently selected fake model.
      getActiveModel: () => 'm2'
    };

    // `posted` is an array that will capture any messages sent *to* the webview
    // by the `ChatWebviewViewProvider`. This helps us check if the provider sends the
    // correct responses.
    const posted: ResponseMessageFromTheExtensionToTheWebview[] = [];

    // `webview` is a comprehensive fake implementation of the `IWebview` interface.
    // It simulates the behavior of a VS Code webview panel.
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined, // Webview options will be set by the provider.
      // `asWebviewUri` is a fake function that converts a local URI into a webview-compatible URI.
      // It simply serializes the URI for testing purposes.
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '', // This will hold the HTML content set by the provider.
      // `onDidReceiveMessage` is how the webview listens for messages *from* the webview (e.g., user input).
      // Here, we expose the `handler` function so our test can directly call it to simulate messages.
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler; // Store the handler for later use in the test.
        return { dispose: () => { } }; // Return a dummy disposable object.
      }) as IWebview['onDidReceiveMessage'],
      // `postMessage` is how the webview sends messages *to* the webview (e.g., AI responses).
      // Our fake implementation adds the message to the `posted` array for verification.
      postMessage: (msg: ResponseMessageFromTheExtensionToTheWebview) => {
        posted.push(msg);
        return Promise.resolve(true); // Simulate successful posting.
      }
    };

    // `webviewView` is a fake `IWebviewView` which acts as a container for our `webview`.
    // It initially has a title, which we expect the `ChatWebviewViewProvider` to clear.
    const webviewView: IWebviewView = { title: 'SUGGESTIO: CHAT', webview };

    // `tokensEmitted` will store the full prompts sent to the `logicHandler`.
    const promptsSent: IPrompt[] = [];
    // `logicHandler` is a fake `IChatResponder` that simulates the AI's response logic.
    const logicHandler: IChatResponder = {
      // `fetchStreamChatResponse` simulates getting a chat response in parts (tokens).
      // It immediately calls `onToken` twice with fake tokens and records the prompt.
      fetchStreamChatResponse: async (prompt: IPrompt, onToken: (t: string) => void) => {
        onToken('tok1'); // First fake token.
        onToken('tok2'); // Second fake token.
        promptsSent.push(prompt); // Record the prompt that was processed.
        return Promise.resolve(); // Simulate successful completion.
      }
    };

    // `buildContext` is a simple fake builder object that returns a static "CONTEXT" string.
    // This context is typically added to the user's prompt before sending it to the AI.
    const buildContext = { buildContext: () => 'CONTEXT' };

    // `receivedArgs` will capture the arguments passed to `getChatWebviewContent`.
    // We initialize it to `null` and expect it to be populated.
    let receivedArgs: { extensionUri: UriLike; scriptUri: UriLike; highlightCssUri: UriLike; models: string[]; activeModel: string } | null = null;
    // `getChatWebviewContent` is a fake function that generates the HTML for the webview.
    // It captures its arguments and returns a simple HTML string for verification.
    const getChatWebviewContent = (args: { extensionUri: UriLike; scriptUri: UriLike; highlightCssUri: UriLike; models: string[]; activeModel: string }) => {
      receivedArgs = args; // Store the arguments for assertion.
      return `HTML for ${args.models.join(',')}`; // Return a custom HTML string based on models.
    };

    const recorded: ChatHistory = [];
    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { recorded.length = 0; },
      addMessage: (m) => { recorded.push(m); },
      getChatHistory: () => recorded.slice()
    };

    // ********************************************************************************
    //  Instantiate the ChatWebviewViewProvider with all our fake dependencies.
    // ********************************************************************************
    const webViewViewProvider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri }, // Provides the extension's URI.
      providerAccessor, // Provides access to LLM models.
      logicHandler, // Handles the actual chat response logic.
      chatHistoryManager, // No-op for this test
      buildContext, // Provides additional context for prompts.
      getChatWebviewContent, // Function to generate webview HTML.
      vscodeApi // Faked VS Code API.
    });

    // ********************************************************************************
    //  Call `resolveWebviewView` which is the method VS Code calls to initialize the webview.
    // ********************************************************************************
    webViewViewProvider.resolveWebviewView(webviewView);

    // ********************************************************************************
    //  Assertions: Verify that the webview and its options are set up correctly.
    // ********************************************************************************

    // Expect the webview's title to be cleared by the provider.
    expect(webviewView.title).toBe('');
    // Expect webview options to be defined (i.e., not `undefined`).
    expect(webview.options).toBeDefined();
    // Expect scripts to be enabled in the webview for interactivity.
    expect(webview.options?.enableScripts).toBe(true);
    // Expect the `extensionUri` to be registered as a local resource root,
    // allowing the webview to load resources from our extension.
    expect(webview.options?.localResourceRoots?.[0]).toBe(extensionUri);

    // ********************************************************************************
    //  Assertions: Verify that `getChatWebviewContent` was called with the correct arguments.
    // ********************************************************************************

    // Expect `receivedArgs` to have been populated (not null).
    expect(receivedArgs).not.toBeNull();
    // Expect the models passed to `getChatWebviewContent` to match our fake list.
    expect(receivedArgs!.models).toEqual(['m1', 'm2']);
    // Expect the active model to match our fake active model.
    expect(receivedArgs!.activeModel).toBe('m2');
    // Expect the webview's HTML content to be set to the value returned by our fake `getChatWebviewContent`.
    expect(webview.html).toBe('HTML for m1,m2');

    // ********************************************************************************
    //  Simulate a message being sent *from* the webview (e.g., user typing a message).
    // ********************************************************************************

    // Cast the stored handler to its expected type for calling.
    const handler = webview.__handler as (msg: WebviewMessage) => Promise<void>;
    // Call the handler to simulate sending a 'sendMessage' command with user text.
    await handler({ command: 'sendMessage', text: 'hello' });

    // ********************************************************************************
    //  Assertions: Verify the messages posted *to* the webview (AI's response).
    // ********************************************************************************

    // Expect the `posted` array to contain the tokens emitted by our fake `logicHandler`,
    // followed by a 'completion' message indicating the end of the response.
    expect(posted).toEqual([
      { sender: 'assistant', type: 'token', text: 'tok1' }, // First token.
      { sender: 'assistant', type: 'token', text: 'tok2' }, // Second token.
      { sender: 'assistant', type: 'completion', text: '' } // Completion message.
    ]);

    // ********************************************************************************
    //  Assertions: Verify the prompt sent to the `logicHandler`.
    // ********************************************************************************

    // Expect only one prompt to have been processed.
    expect(promptsSent.length).toBe(1);
    const chatHistory: ChatHistory = promptsSent[0].generateChatHistory();
    expect(chatHistory.length).toBe(2);

    expect(chatHistory[0]).toEqual({ role: 'system', content: 'You are a code assistant\nCONTEXT' });
    expect(chatHistory[1]).toEqual({ role: 'user', content: 'hello' });

  });

  // Failing test: the current implementation prepends the build context to the
  // user's message and then stores that combined string in chat history. The
  // desired behavior is that chat history stores only the raw user message.
  // This test asserts the desired behavior and will fail until the code is fixed.
  it('does not add buildContext to chat history user messages', async () => {
    const extensionUri: UriLike = { fsPath: '/ext' };
    const vscodeApi: IVscodeApiLocal = {
      Uri: { joinPath: (b: UriLike, ...p: string[]) => ({ b, p } as UriLike) }
    };

    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };

    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler;
        return { dispose: () => { } };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (_msg: ResponseMessageFromTheExtensionToTheWebview) => Promise.resolve(true)
    };

    const webviewView: IWebviewView = { title: 'X', webview };

    // Spyable chat history manager to capture added messages.
    const recorded: { role: ChatRole; content: string }[] = [];
    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { },
      addMessage: (m) => recorded.push(m),
      getChatHistory: () => recorded.slice()
    };

    // Minimal config with a fake llm provider that immediately completes.
    const config = {
      activeProvider: 'p',
      providers: {},
      anonymizer: { enabled: false, words: [] },
      llmProviderForChat: {
        queryStream: async (_prompt: IPrompt, onToken: (t: string) => void) => {
          onToken('x');
          return Promise.resolve();
        }
      }
    } as unknown as import('../../src/config/types.js').Config;

    // Use the real ChatResponder which currently adds the (context+message) to history.
    const { ChatResponder } = await import('../../src/chat/chatResponder.js');
    const responder = new ChatResponder(config, () => { }, chatHistoryManager);

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler: responder,
      chatHistoryManager,
      buildContext: { buildContext: () => 'CONTEXT' },
      getChatWebviewContent: () => '',
      vscodeApi
    });

    provider.resolveWebviewView(webviewView);

    const handler = webview.__handler as (msg: WebviewMessage) => Promise<void>;
    await handler({ command: 'sendMessage', text: 'hello' });

    // Expect the first added message to be exactly the user's text without the build context.
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded[0]).toEqual({ role: 'user', content: 'hello' });
  });

  // This test case verifies that the `ChatWebviewViewProvider` correctly handles:
  // 1. The 'modelChanged' command, emitting an event.
  // 2. The 'clearHistory' command, calling the logic handler's `clearHistory`.
  // 3. Error reporting when `fetchStreamChatResponse` fails.
  it('emits modelChanged and calls clearHistory and reports errors', async () => {
    // Define a fake extension URI.
    const extensionUri: UriLike = { fsPath: '/ext' };
    // Define a fake VS Code API, specifically `Uri.joinPath`.
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        // A simplified `joinPath` for testing.
        joinPath: (b: UriLike, ...p: string[]) => ({ b, p } as UriLike)
      }
    };

    // Define a fake `providerAccessor` that returns empty lists for models.
    const providerAccessor: ILlmProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: ResponseMessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to the previous test.
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler;
        return { dispose: () => { } };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (msg: ResponseMessageFromTheExtensionToTheWebview) => {
        responseMessagesFromTheExtensionToTheWebview.push(msg);
        return Promise.resolve(true);
      }
    };
    // Fake `webviewView` container.
    const webviewView: IWebviewView = { title: 'X', webview };

    // Fake `logicHandler` for this test.
    const logicHandler: IChatResponder = {
      // For this test, `fetchStreamChatResponse` is made to throw an error immediately.
      fetchStreamChatResponse: async () => {
        throw new Error('boom'); // Simulate an error during AI response.
      }
    };

    let chatHistoryCleared = false;
    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => {
        chatHistoryCleared = true;
      },
      addMessage: () => { },
      getChatHistory: () => [],
    };

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: () => '' }, // Empty context for this test.
      getChatWebviewContent: () => '', // Empty HTML content for this test.
      vscodeApi
    });

    provider.resolveWebviewView(webviewView);

    // ********************************************************************************
    //  Listen to the `modelChanged` event on the global event bus.
    // ********************************************************************************
    let emittedModel: string = '';
    eventBus.on('modelChanged', (m: string) => {
      emittedModel = m; // Capture the model name emitted by the event.
    });

    // ********************************************************************************
    //  Simulate a 'modelChanged' command from the webview.
    // ********************************************************************************
    const handler = webview.__handler as (msg: WebviewMessage) => Promise<void>;
    await handler({ command: 'modelChanged', model: 'new-model' });
    // Expect that the `eventBus` emitted the 'modelChanged' event with the correct model name.
    expect(emittedModel).toBe('new-model');

    // ********************************************************************************
    //  Simulate a 'clearHistory' command from the webview.
    // ********************************************************************************
    await handler({ command: 'clearHistory' });
    // Expect that the `clearHistory` method on our fake `chatHistoryManager` was called.
    expect(chatHistoryCleared).toBe(true);

    // ********************************************************************************
    //  Simulate a 'sendMessage' command which is expected to trigger an error.
    // ********************************************************************************
    await handler({ command: 'sendMessage', text: 'x' });
    // Get the last message that was posted to the webview.
    const last = responseMessagesFromTheExtensionToTheWebview[responseMessagesFromTheExtensionToTheWebview.length - 1] as { text: string };
    // Expect an error message to have been posted.
    expect(last).toBeDefined();
    expect(typeof last.text).toBe('string');
    // Expect the error message to contain a specific user-friendly error string.
    expect(last.text).toContain('Sorry, there was an error processing your request');
  });

  // This test case verifies that the `ChatWebviewViewProvider` gracefully ignores
  // commands sent from the webview that it doesn't recognize.
  it('ignores unknown commands (no-op branch)', async () => {
    // Define a fake extension URI.
    const extensionUri: UriLike = { fsPath: '/ext' };
    // Define a fake VS Code API, specifically `Uri.joinPath`.
    const vscodeApi: IVscodeApiLocal = {
      Uri: {
        joinPath: (b: UriLike, ...p: string[]) => ({ b, p } as UriLike)
      }
    };

    // Define a fake `providerAccessor` that returns empty lists for models.
    const providerAccessor: ILlmProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: ResponseMessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to previous tests.
    const webview: IWebview & { __handler?: (msg: WebviewMessage) => void } = {
      options: undefined,
      asWebviewUri: (uri: UriLike) => `webview:${JSON.stringify(uri)}` as unknown as UriLike,
      html: '',
      onDidReceiveMessage: ((handler: (msg: WebviewMessage) => void): IDisposable => {
        webview.__handler = handler;
        return { dispose: () => { } };
      }) as IWebview['onDidReceiveMessage'],
      postMessage: (msg: ResponseMessageFromTheExtensionToTheWebview) => {
        responseMessagesFromTheExtensionToTheWebview.push(msg);
        return Promise.resolve(true);
      }
    };
    // Fake `webviewView` container.
    const webviewView: IWebviewView = { title: 'X', webview };

    // Fake `logicHandler` for this test.
    // Its methods are marked with `/* not called */` because we expect
    // them *not* to be invoked when an unknown command is received.
    const logicHandler: IChatResponder = {
      fetchStreamChatResponse: async () => {
        /* not called */ // This should not be called.
      }
    };

    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => {
        /* not called */ // This should not be called.
      },
      addMessage: () => { },
      getChatHistory: () => [],
    };

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: () => '' },
      getChatWebviewContent: () => '',
      vscodeApi
    });

    provider.resolveWebviewView(webviewView);

    // ********************************************************************************
    //  Simulate sending an unknown command from the webview.
    // ********************************************************************************
    // Cast the stored handler to a more generic type as we're sending an "unknown" message structure.
    const handler = webview.__handler as (msg: unknown) => Promise<void>;
    // Send a message with a 'command' that the `ChatWebviewViewProvider` does not handle.
    await handler({ command: 'unknown' });

    // ********************************************************************************
    //  Assertions: Verify that no messages were posted and no logic was executed.
    // ********************************************************************************
    // Expect that no messages were posted back to the webview, confirming the command was ignored.
    expect(responseMessagesFromTheExtensionToTheWebview.length).toBe(0);
    // (Implicitly, the `logicHandler` methods were not called due to the `/* not called */` comments in the mock.)
  });
});
