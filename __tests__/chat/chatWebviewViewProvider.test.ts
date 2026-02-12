// This test file uses `describe` to group related tests and `it` for individual test cases.
// It's designed to test the `ChatWebviewViewProvider` without actually using a full VS Code environment.
// Instead, it uses "mocks" (fake versions) of VS Code API parts and other dependencies.

// Import necessary types from the chat module. These define the shapes of objects
// like URIs, VS Code API, providers, webviews, and messages.
import type {
  IUriLike, // A type representing a URI (Uniform Resource Identifier), similar to a file path.
  ILlmProviderAccessor, // A type for accessing language model (LLM) providers.
  IChatAgent, // A type for handling chat logic (sending/receiving messages).
  IChatHistoryManager, // A type for managing chat history (e.g., clearing it).
  MessageFromTheExtensionToTheWebview, // A type for messages sent *to* the webview (e.g., AI responses).
  ChatRole,
  ChatHistory,
  IPrompt,
  IAnonymizer,
  IVscodeApiLocal,
  IFileContentReader
} from '../../src/types.js';
// Import the actual ChatWebviewViewProvider class that we are testing.
import { ChatWebviewViewProvider } from '../../src/chat/chatWebviewViewProvider.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { createMockVscodeApi, createMockWebview, createMockWebviewView, createMockHistoryManager, createMockUri, createMockFileContentReader, createMockLogger } from '../testUtils.js';

// `describe` is used to group tests. Here, we're testing the `ChatWebviewViewProvider`.
// The description "integration, no vscode mocks" indicates that while we're using
// fakes for dependencies, we're testing how components integrate, and we're *not*
// using a full-blown VS Code mock framework, but rather simple hand-rolled fakes.
describe('ChatWebviewViewProvider (integration, no vscode mocks)', () => {

  // `it` defines a single test case. This one checks if the webview is set up correctly,
  // receives its HTML content, and can handle messages to get AI responses (tokens and completion).
  it('sets up webview, sets html and handles messages (tokens + completion)', async () => {
    // `extensionUri` represents the base path of our extension.
    const extensionUri = createMockUri('/ext');

    const eventBus = new EventBus();

    // `vscodeApi` is a fake (mock) version of the VS Code API.
    // We only implement the parts that `ChatWebviewViewProvider` needs,
    // specifically `Uri.joinPath` which is used to construct paths for webview resources.
    const vscodeApi = createMockVscodeApi((base: IUriLike, ...paths: string[]) => 
        createMockUri(base.toString() + '/' + paths.join('/'))
    );

    const fileReader = createMockFileContentReader();

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
    const posted: MessageFromTheExtensionToTheWebview[] = [];

    // `webview` is a comprehensive fake implementation of the `IWebview` interface.
    // It simulates the behavior of a VS Code webview panel.
    const webview = createMockWebview(posted);

    // `webviewView` is a fake `IWebviewView` which acts as a container for our `webview`.
    // It initially has a title, which we expect the `ChatWebviewViewProvider` to clear.
    const webviewView = createMockWebviewView(webview, 'SUGGESTIO: CHAT');

    // `tokensEmitted` will store the full prompts sent to the `logicHandler`.
    const promptsSent: IPrompt[] = [];
    // `logicHandler` is a fake `IChatResponder` that simulates the AI's response logic.
    const logicHandler: IChatAgent = {
      run: async (prompt: IPrompt) => {
        eventBus.emit('agent:token', { token: 'tok1', type: 'content' });
        eventBus.emit('agent:token', { token: 'tok2', type: 'content' });
        promptsSent.push(prompt); // Record the prompt that was processed.
        return Promise.resolve(); // Simulate successful completion.
      }
    };

    // `buildContext` is a simple fake builder object that returns a static "CONTEXT" string.
    // This context is typically added to the user's prompt before sending it to the AI.
    const buildContext = { buildContext: async () => 'CONTEXT' };

    // `receivedArgs` will capture the arguments passed to `getChatWebviewContent`.
    // We initialize it to `null` and expect it to be populated.
    let receivedArgs: { extensionUri: IUriLike; scriptUri: IUriLike; highlightCssUri: IUriLike; models: string[]; activeModel: string; vscodeApi: IVscodeApiLocal; fileReader: IFileContentReader } | null = null;
    // `getChatWebviewContent` is a fake function that generates the HTML for the webview.
    // It captures its arguments and returns a simple HTML string for verification.
    const getChatWebviewContent = (args: { extensionUri: IUriLike; scriptUri: IUriLike; highlightCssUri: IUriLike; models: string[]; activeModel: string; vscodeApi: IVscodeApiLocal; fileReader: IFileContentReader }) => {
      receivedArgs = args; // Store the arguments for assertion.
      return `HTML for ${args.models.join(',')}`; // Return a custom HTML string based on models.
    };

    const recorded: ChatHistory = [];
    const chatHistoryManager = createMockHistoryManager(recorded);

    // ********************************************************************************
    //  Instantiate the ChatWebviewViewProvider with all our fake dependencies.
    // ********************************************************************************
    const webViewViewProvider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') }, // Provides the extension's URI.
      providerAccessor, // Provides access to LLM models.
      logicHandler, // Handles the actual chat response logic.
      chatHistoryManager, // No-op for this test
      buildContext, // Provides additional context for prompts.
      getChatWebviewContent, // Function to generate webview HTML.
      vscodeApi, // Faked VS Code API.
      fileReader,
      eventBus,
      logger: createMockLogger()
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

    // Call the handler to simulate sending a 'sendMessage' command with user text.
    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'hello' });
    }

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

    expect(chatHistory[0]).toEqual({ role: 'system', content: 'You are a code assistant. You can use tools to interact with the workspace.\nCONTEXT' });
    expect(chatHistory[1]).toEqual({ role: 'user', content: 'hello' });

  });

  it('does not add buildContext to chat history user messages', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();

    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };

    const webview = createMockWebview();

    const webviewView = createMockWebviewView(webview, 'X');

    // Spyable chat history manager to capture added messages.
    const recorded: { role: ChatRole; content: string }[] = [];
    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { },
      addMessage: (m) => recorded.push(m),
      getChatHistory: () => recorded.slice()
    };

    const eventBus = new EventBus();

    // Minimal config with a fake llm provider that immediately completes.
    const config: import('../../src/types.js').Config = {
      activeProvider: 'p',
      providers: {},
      anonymizer: { enabled: false, words: [] },
      llmProviderForChat: {
        query: async () => null,
        queryStream: async () => {
          eventBus.emit('agent:token', { token: 'x', type: 'content' });
          return Promise.resolve(null);
        }
      }
    };

    // Use the real Agent which currently adds the (context+message) to history.
    const { Agent } = await import('../../src/agent/agent.js');
    const responder = new Agent({
      config,
      logger: () => { },
      chatHistoryManager,
      eventBus
    });

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler: responder,
      chatHistoryManager,
      buildContext: { buildContext: async () => 'CONTEXT' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
    });

    provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'hello' });
    }

    // Expect the first added message to be exactly the user's text without the build context.
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded[0]).toEqual({ role: 'user', content: 'hello' });
  });

  // This test case verifies that the `ChatWebviewViewProvider` correctly handles:
  // 1. The 'modelChanged' command, emitting an event.
  // 2. The 'clearHistory' command, calling the logic handler's `clearHistory`.
  // 3. Error reporting when AI response fails.
  it('emits modelChanged and calls clearHistory and reports errors', async () => {
    // Define a fake extension URI.
    const extensionUri = createMockUri('/ext');
    // Define a fake VS Code API, specifically `Uri.joinPath`.
    const vscodeApi = createMockVscodeApi();

    // Define a fake `providerAccessor` that returns empty lists for models.
    const providerAccessor: ILlmProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: MessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to the previous test.
    const webview = createMockWebview(responseMessagesFromTheExtensionToTheWebview);
    // Fake `webviewView` container.
    const webviewView = createMockWebviewView(webview, 'X');

    // Fake `logicHandler` for this test.
    const logicHandler: IChatAgent = {
      run: async () => {
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

    const eventBus = new EventBus();

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' }, // Empty context for this test.
      getChatWebviewContent: () => '', // Empty HTML content for this test.
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
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
    if (webview.__handler) {
      await webview.__handler({ command: 'modelChanged', model: 'new-model' });
    }
    // Expect that the `eventBus` emitted the 'modelChanged' event with the correct model name.
    expect(emittedModel).toBe('new-model');

    // ********************************************************************************
    //  Simulate a 'clearHistory' command from the webview.
    // ********************************************************************************
    if (webview.__handler) {
      await webview.__handler({ command: 'clearHistory' });
    }
    // Expect that the `clearHistory` method on our fake `chatHistoryManager` was called.
    expect(chatHistoryCleared).toBe(true);

    // ********************************************************************************
    //  Simulate a 'sendMessage' command which is expected to trigger an error.
    // ********************************************************************************
    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'x' });
    }
    // Get the last message that was posted to the webview.
    const last = responseMessagesFromTheExtensionToTheWebview[responseMessagesFromTheExtensionToTheWebview.length - 1];
    // Expect an error message to have been posted.
    expect(last).toBeDefined();
    // Expect the error message to contain a specific user-friendly error string.
    expect(last).toMatchObject({
      text: expect.stringContaining('Sorry, there was an error processing your request')
    });
  });

  // This test case verifies that the `ChatWebviewViewProvider` gracefully ignores
  // commands sent from the webview that it doesn't recognize.
  it('ignores unknown commands (no-op branch)', async () => {
    // Define a fake extension URI.
    const extensionUri = createMockUri('/ext');
    // Define a fake VS Code API, specifically `Uri.joinPath`.
    const vscodeApi = createMockVscodeApi();

    // Define a fake `providerAccessor` that returns empty lists for models.
    const providerAccessor: ILlmProviderAccessor = {
      getModels: () => [],
      getActiveModel: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: MessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to previous tests.
    const webview = createMockWebview(responseMessagesFromTheExtensionToTheWebview);
    // Fake `webviewView` container.
    const webviewView = createMockWebviewView(webview, 'X');

    // Fake `logicHandler` for this test.
    const logicHandler: IChatAgent = {
      run: async () => {
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

    const eventBus = new EventBus();

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
    });

    provider.resolveWebviewView(webviewView);

    // ********************************************************************************
    //  Simulate sending an unknown command from the webview.
    // ********************************************************************************
    // Send a message with a 'command' that the `ChatWebviewViewProvider` does not handle.
    if (webview.__handler) {
      await webview.__handler({ command: 'unknown' });
    }

    // ********************************************************************************
    //  Assertions: Verify that no messages were posted and no logic was executed.
    // ********************************************************************************
    // Expect that no messages were posted back to the webview, confirming the command was ignored.
    expect(responseMessagesFromTheExtensionToTheWebview.length).toBe(0);
  });

  it('anonymizes context if anonymizer is provided', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };
    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const promptsSent: IPrompt[] = [];
    const logicHandler: IChatAgent = {
      run: async (prompt: IPrompt) => {
        promptsSent.push(prompt);
        return Promise.resolve();
      }
    };

    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { },
      addMessage: () => { },
      getChatHistory: () => []
    };

    const anonymizer: IAnonymizer = {
      anonymize: (text: string) => text.replace('SECRET', 'ANONYMIZED'),
      deanonymize: (text: string) => text,
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => ({ processed: chunk, buffer: '' }),
        flush: () => ''
      })
    };

    const eventBus = new EventBus();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: async () => 'This is a SECRET' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger(),
      anonymizer
    });

    provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'hello' });
    }

    expect(promptsSent.length).toBe(1);
    const chatHistory = promptsSent[0].generateChatHistory();
    expect(chatHistory[0].content).toContain('This is a ANONYMIZED');
    expect(chatHistory[0].content).not.toContain('SECRET');
  });

  it('aborts request and stops sending tokens when cancelRequest is received', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };

    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();

    let signalAtFetch: AbortSignal | undefined;
    const logicHandler: IChatAgent = {
      run: async (_prompt: IPrompt, signal?: AbortSignal) => {
        signalAtFetch = signal;
        eventBus.emit('agent:token', { token: 'tok1', type: 'content' });

        // Simulate cancellation mid-stream
        if (webview.__handler) {
          await webview.__handler({ command: 'cancelRequest' });
        }

        eventBus.emit('agent:token', { token: 'tok2', type: 'content' });

        if (signal?.aborted) {
          throw new Error('AbortError');
        }

        return Promise.resolve();
      }
    };

    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { },
      addMessage: () => { },
      getChatHistory: () => []
    };

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
    });

    provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'hello' });
    }

    // Verify signal was aborted
    expect(signalAtFetch).toBeDefined();
    expect(signalAtFetch?.aborted).toBe(true);

    // Verify only the first token was posted, followed by a completion message
    expect(posted).toEqual([
      { sender: 'assistant', type: 'token', text: 'tok1' },
      { sender: 'assistant', type: 'completion', text: '' }
    ]);
  });

  it('newChat clears history and posts message to webview', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    let historyCleared = false;
    const chatHistoryManager: IChatHistoryManager = {
      clearHistory: () => { historyCleared = true; },
      addMessage: () => { },
      getChatHistory: () => []
    };

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler: { run: async () => { } },
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus: new EventBus(),
      logger: createMockLogger()
    });

    // Test newChat before resolveWebviewView (view is undefined)
    provider.newChat();
    expect(historyCleared).toBe(true);
    expect(posted.length).toBe(0);

    historyCleared = false;
    provider.resolveWebviewView(webviewView);
    provider.newChat();
    expect(historyCleared).toBe(true);
    expect(posted).toContainEqual({ command: 'newChat' });
  });

  it('handles agent:maxIterationsReached event', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler: { run: async () => { } },
      chatHistoryManager: { clearHistory: () => { }, addMessage: () => { }, getChatHistory: () => [] },
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
    });

    // Event before resolveWebviewView
    eventBus.emit('agent:maxIterationsReached', { maxIterations: 5 });
    expect(posted.length).toBe(0);

    provider.resolveWebviewView(webviewView);
    eventBus.emit('agent:maxIterationsReached', { maxIterations: 10 });
    expect(posted.length).toBe(1);
    const lastPosted = posted[0];
    if ('text' in lastPosted) {
      expect(lastPosted.text).toContain('Max iterations reached (10)');
    }
  });

  it('cancelRequest does nothing if no abortController', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };
    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler: { run: async () => { } },
      chatHistoryManager: { clearHistory: () => { }, addMessage: () => { }, getChatHistory: () => [] },
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus: new EventBus(),
      logger: createMockLogger()
    });

    provider.resolveWebviewView(webviewView);
    if (webview.__handler) {
      await webview.__handler({ command: 'cancelRequest' });
    }
  });

  it('_sendCompletionMessage does nothing if _view is undefined', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const providerAccessor: ILlmProviderAccessor = { getModels: () => [], getActiveModel: () => '' };

    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      providerAccessor,
      logicHandler: {
        run: async () => {
          // Simulate view being cleared during request
          provider._view = undefined;
          return Promise.resolve();
        }
      },
      chatHistoryManager: {
        clearHistory: () => { },
        addMessage: () => { },
        getChatHistory: () => []
      },
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      logger: createMockLogger()
    });

    provider.resolveWebviewView(webviewView);
    if (webview.__handler) {
      await webview.__handler({ command: 'sendMessage', text: 'hello' });
    }

    expect(provider._view).toBeUndefined();
  });
});