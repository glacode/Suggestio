// This test file uses `describe` to group related tests and `it` for individual test cases.
// It's designed to test the `ChatWebviewViewProvider` without actually using a full VS Code environment.
// Instead, it uses "mocks" (fake versions) of VS Code API parts and other dependencies.

import { describe, it, expect } from '@jest/globals';
// Import necessary types from the chat module. These define the shapes of objects
// like URIs, VS Code API, profiles, webviews, and messages.
import type {
  IUriLike, // A type representing a URI (Uniform Resource Identifier), similar to a file path.
  ILlmProviderAccessor, // A type for accessing language model (LLM) profiles.
  IChatAgent, // A type for handling chat logic (sending/receiving messages).
  IPersistentChatHistoryManager, // A type for managing persistent chat history.
  MessageFromTheExtensionToTheWebview, // A type for messages sent *to* the webview (e.g., AI responses).
  ChatRole,
  ChatHistory,
  IPrompt,
  IAnonymizer,
  IToolUiProvider
} from '../../src/types.js';
import { SYSTEM_PROMPTS } from '../../src/constants/prompts.js';
import { WEBVIEW_COMMANDS, EXTENSION_COMMANDS, EXTENSION_EVENTS, MESSAGE_SENDERS } from '../../src/constants/protocol.js';
// Import the actual ChatWebviewViewProvider class that we are testing.
import { ChatWebviewViewProvider } from '../../src/chat/chatWebviewViewProvider.js';
import { EventBus } from '../../src/utils/eventBus.js';
import {
  createMockVscodeApi,
  createMockWebview,
  createMockWebviewView,
  createMockPersistentHistoryManager,
  createMockUri,
  createMockFileContentReader,
  createMockDiffManager,
  createDefaultConfig
} from '../testUtils.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';
import { configProcessor, type ISecretManager } from '../../src/config/configProcessor.js';
import type { IHttpClient } from '../../src/types.js';
import { jest } from '@jest/globals';

// `describe` is used to group tests. Here, we're testing the `ChatWebviewViewProvider`.
// The description "integration, no vscode mocks" indicates that while we're using
// fakes for dependencies, we're testing how components integrate, and we're *not*
// using a full-blown VS Code mock framework, but rather simple hand-rolled fakes.
describe('ChatWebviewViewProvider (integration, no vscode mocks)', () => {

  const createMocks = () => {
    const config = createDefaultConfig();
    const secretManager: ISecretManager = {
      getOrRequestAPIKey: jest.fn<any>().mockResolvedValue('resolved-key'),
      getSecret: jest.fn<any>().mockResolvedValue('resolved-key'),
      updateAPIKey: jest.fn<any>().mockResolvedValue(undefined),
      deleteSecret: jest.fn<any>().mockResolvedValue(undefined),
    };

    const httpClient: IHttpClient = {
      post: jest.fn<any>()
    };
    const toolUiProvider: IToolUiProvider = {
      getToolUI: jest.fn<any>().mockReturnValue({ displayMessage: 'formatted-message', uiOptions: {} }),
      enrichHistory: jest.fn<any>().mockImplementation((history: ChatHistory) => history)
    };
    return { config, secretManager, httpClient, toolUiProvider };
  };

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

    // `profileAccessor` is a fake that provides information about available
    // and active language models (LLMs).
    const profileAccessor: ILlmProviderAccessor = {
      // `getProfiles` returns a list of fake profile names.
      getProfiles: () => ['m1', 'm2'],
      // `getActiveProfile` returns the currently selected fake profile.
      getActiveProfile: () => 'm2'
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

    // `tokensEmitted` will store the full prompts sent to the `chatAgent`.
    const promptsSent: IPrompt[] = [];
    // `chatAgent` is a fake `IChatAgent` that simulates the AI's response logic.
    const chatAgent: IChatAgent = {
      run: async (prompt: IPrompt) => {
        eventBus.emit('agent:token', { token: 'tok1', type: 'content' });
        eventBus.emit('agent:token', { token: 'tok2', type: 'content' });
        promptsSent.push(prompt); // Record the prompt that was processed.
        return Promise.resolve(); // Simulate successful completion.
      }
    };

    // `buildContext` is a simple fake builder object that returns an empty string by default.
    // This context is typically added to the user's prompt before sending it to the AI.
    const buildContext = { buildContext: async () => '' };

    // `receivedArgs` will capture the arguments passed to `getChatWebviewContent`.
    // We initialize it to `null` and expect it to be populated.
    let receivedArgs: any | null = null;
    // `getChatWebviewContent` is a fake function that generates the HTML for the webview.
    // It captures its arguments and returns a simple HTML string for verification.
    const getChatWebviewContent = (args: any) => {
      receivedArgs = args; // Store the arguments for assertion.
      return `HTML for ${args.initialState.profiles.join(',')}`; // Return a custom HTML string based on profiles.
    };

    const recorded: ChatHistory = [];
    const chatHistoryManager = createMockPersistentHistoryManager(recorded);

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    // ********************************************************************************
    //  Instantiate the ChatWebviewViewProvider with all our fake dependencies.
    // ********************************************************************************
    const webViewViewProvider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') }, // Provides the extension's URI.
      profileAccessor, // Provides access to LLM models.
      chatAgent, // Handles the actual chat response logic.
      chatHistoryManager, // No-op for this test
      buildContext, // Provides additional context for prompts.
      getChatWebviewContent, // Function to generate webview HTML.
      vscodeApi, // Faked VS Code API.
      fileReader,
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    // ********************************************************************************
    //  Call `resolveWebviewView` which is the method VS Code calls to initialize the webview.
    // ********************************************************************************
    await webViewViewProvider.resolveWebviewView(webviewView);

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
    // Expect the profiles passed to `getChatWebviewContent` to match our fake list.
    expect(receivedArgs!.initialState.profiles).toEqual(['m1', 'm2']);
    // Expect the active profile to match our fake active profile.
    expect(receivedArgs!.initialState.activeProfile).toBe('m2');
    // Expect the webview's HTML content to be set to the value returned by our fake `getChatWebviewContent`.
    expect(webview.html).toBe('HTML for m1,m2');

    // ********************************************************************************
    //  Simulate a message being sent *from* the webview (e.g., user typing a message).
    // ********************************************************************************

    // Call the handler to simulate sending a 'sendMessage' command with user text.
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    // ********************************************************************************
    //  Assertions: Verify the messages posted *to* the webview (AI's response).
    // ********************************************************************************

    // Expect the `posted` array to contain the tokens emitted by our fake `logicHandler`,
    // followed by a 'completion' message indicating the end of the response.
    expect(posted).toEqual([
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'tok1', tokenType: 'content' }, // First token.
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'tok2', tokenType: 'content' }, // Second token.
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION, text: '' } // Completion message.
    ]);

    // ********************************************************************************
    //  Assertions: Verify the prompt sent to the `logicHandler`.
    // ********************************************************************************

    // Expect only one prompt to have been processed.
    expect(promptsSent.length).toBe(1);
    const chatHistory: ChatHistory = promptsSent[0].generateChatHistory();
    expect(chatHistory.length).toBe(2);

    expect(chatHistory[0]).toEqual({ role: 'system', content: `${SYSTEM_PROMPTS.AGENT}` });
    expect(chatHistory[1]).toEqual({ role: 'user', content: 'hello' });

  });

  it('does not add buildContext to chat history user messages', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();

    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const webview = createMockWebview();

    const webviewView = createMockWebviewView(webview, 'X');

    // Spyable chat history manager to capture added messages.
    const recorded: { role: ChatRole; content: string }[] = [];
    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => { },
      addMessage: (m) => recorded.push(m),
      getChatHistory: () => recorded.slice(),
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
    };

    const eventBus = new EventBus();

    // Minimal config with a fake llm provider that immediately completes.
    const config = createDefaultConfig({
      activeChatProfile: 'p',
      profiles: {
        'p': { model: 'm', apiKey: 'k' }
      },
      llmProviderForChat: {
        query: async () => null,
        queryStream: async () => {
          eventBus.emit('agent:token', { token: 'x', type: 'content' });
          return Promise.resolve([]);
        }
      }
    });

    const { secretManager, httpClient, toolUiProvider } = createMocks();

    // Use the real Agent which currently adds the (context+message) to history.
    const { Agent } = await import('../../src/agent/agent.js');
    const chatAgent = new Agent({
      config,
      chatHistoryManager,
      eventBus
    });

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
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

    // Define a fake `profileAccessor` that returns empty lists for models.
    const profileAccessor: ILlmProviderAccessor = {
      getProfiles: () => [],
      getActiveProfile: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: MessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to the previous test.
    const webview = createMockWebview(responseMessagesFromTheExtensionToTheWebview);
    // Fake `webviewView` container.
    const webviewView = createMockWebviewView(webview, 'X');

    // Fake `chatAgent` for this test.
    const chatAgent: IChatAgent = {
      run: async () => {
        throw new Error('boom'); // Simulate an error during AI response.
      }
    };

    let chatHistoryCleared = false;
    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => {
        chatHistoryCleared = true;
      },
      addMessage: () => { },
      getChatHistory: () => [],
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
    };

    const eventBus = new EventBus();

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' }, // Empty context for this test.
      getChatWebviewContent: () => '', // Empty HTML content for this test.
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    // ********************************************************************************
    //  Listen to the `chatProfileChanged` event on the global event bus.
    // ********************************************************************************
    let emittedModel: string = '';
    eventBus.on('chatProfileChanged', (m: string) => {
      emittedModel = m; // Capture the profile ID emitted by the event.
    });

    // ********************************************************************************
    //  Simulate a 'modelChanged' command from the webview.
    // ********************************************************************************
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED, model: 'new-model' });
    }
    // Expect that the `eventBus` emitted the 'modelChanged' event with the correct model name.
    expect(emittedModel).toBe('new-model');

    // ********************************************************************************
    //  Simulate a 'clearHistory' command from the webview.
    // ********************************************************************************
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.CLEAR_HISTORY });
    }
    // Expect that the `clearHistory` method on our fake `chatHistoryManager` was called.
    expect(chatHistoryCleared).toBe(true);

    // ********************************************************************************
    //  Simulate a 'sendMessage' command which is expected to trigger an error.
    // ********************************************************************************
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'x' });
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

    // Define a fake `profileAccessor` that returns empty lists for models.
    const profileAccessor: ILlmProviderAccessor = {
      getProfiles: () => [],
      getActiveProfile: () => ''
    };

    // `posted` array to capture messages sent to the webview.
    const responseMessagesFromTheExtensionToTheWebview: MessageFromTheExtensionToTheWebview[] = [];
    // Fake `webview` implementation, similar to previous tests.
    const webview = createMockWebview(responseMessagesFromTheExtensionToTheWebview);
    // Fake `webviewView` container.
    const webviewView = createMockWebviewView(webview, 'X');

    // Fake `chatAgent` for this test.
    const chatAgent: IChatAgent = {
      run: async () => {
        /* not called */ // This should not be called.
      }
    };

    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => {
        /* not called */ // This should not be called.
      },
      addMessage: () => { },
      getChatHistory: () => [],
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
    };

    const eventBus = new EventBus();

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    // ********************************************************************************
    //  Instantiate and resolve the `ChatWebviewViewProvider`.
    // ********************************************************************************
    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

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
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };
    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const promptsSent: IPrompt[] = [];
    const chatAgent: IChatAgent = {
      run: async (prompt: IPrompt) => {
        promptsSent.push(prompt);
        return Promise.resolve();
      }
    };

    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => { },
      addMessage: () => { },
      getChatHistory: () => [],
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
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

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      buildContext: { buildContext: async (opts) => opts?.includeActiveEditor ? 'This is a SECRET' : '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      anonymizer,
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    expect(promptsSent.length).toBe(1);
    const chatHistory = promptsSent[0].generateChatHistory();
    // By default, context is empty, so content should be just the agent prompt
    expect(chatHistory[0].content).toBe(SYSTEM_PROMPTS.AGENT);
    expect(chatHistory[0].content).not.toContain('SECRET');
  });

  it('anonymizes context if the builder provides it (verifies wiring)', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };
    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const promptsSent: IPrompt[] = [];
    const chatAgent: IChatAgent = {
      run: async (prompt: IPrompt) => {
        promptsSent.push(prompt);
        return Promise.resolve();
      }
    };

    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => { },
      addMessage: () => { },
      getChatHistory: () => [],
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
    };

    // The anonymizer replaces 'SECRET' with 'ANONYMIZED'
    const anonymizer: IAnonymizer = {
      anonymize: (text: string) => text.replace('SECRET', 'ANONYMIZED'),
      deanonymize: (text: string) => text,
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => ({ processed: chunk, buffer: '' }),
        flush: () => ''
      })
    };

    const eventBus = new EventBus();
    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      // Here we simulate a builder that ignores the 'disabled' default and returns content anyway
      // to verify that IF there is content, it IS anonymized.
      buildContext: { buildContext: async () => 'This is a SECRET' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      anonymizer,
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    expect(promptsSent.length).toBe(1);
    const chatHistory = promptsSent[0].generateChatHistory();
    // Verify that the 'SECRET' from the builder was passed through the anonymizer
    expect(chatHistory[0].content).toContain('This is a ANONYMIZED');
    expect(chatHistory[0].content).not.toContain('SECRET');
  });

  it('aborts request and stops sending tokens when cancelRequest is received', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();

    let signalAtFetch: AbortSignal | undefined;
    const chatAgent: IChatAgent = {
      run: async (_prompt: IPrompt, signal?: AbortSignal) => {
        signalAtFetch = signal;
        eventBus.emit('agent:token', { token: 'tok1', type: 'content' });

        // Simulate cancellation mid-stream
        if (webview.__handler) {
          await webview.__handler({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST });
        }

        eventBus.emit('agent:token', { token: 'tok2', type: 'content' });

        if (signal?.aborted) {
          throw new Error('AbortError');
        }

        return Promise.resolve();
      }
    };

    const chatHistoryManager: IPersistentChatHistoryManager = {
      clearHistory: () => { },
      addMessage: () => { },
      getChatHistory: () => [],
      getSessions: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      loadSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      newSession: jest.fn<() => void>(),
      persistCurrentSession: jest.fn()
    };

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    // Verify signal was aborted
    expect(signalAtFetch).toBeDefined();
    expect(signalAtFetch?.aborted).toBe(true);

    // Verify only the first token was posted, followed by a completion message
    expect(posted).toEqual([
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'tok1', tokenType: 'content' },
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION, text: '' }
    ]);
  });

  it('newChat clears history and posts message to webview', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    let newSessionCalled = false;
    const chatHistoryManager = createMockPersistentHistoryManager();
    chatHistoryManager.newSession.mockImplementation(() => { newSessionCalled = true; });

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: { run: async () => { } },
      chatHistoryManager,
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus: new EventBus(),
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    // Test newChat before resolveWebviewView (view is undefined)
    provider.newChat();
    expect(newSessionCalled).toBe(true);
    expect(posted.length).toBe(0);

    newSessionCalled = false;
    await provider.resolveWebviewView(webviewView);
    provider.newChat();
    expect(newSessionCalled).toBe(true);
    expect(posted).toContainEqual({ command: EXTENSION_COMMANDS.NEW_CHAT });
  });

  it('handles viewDiff command by calling diffManager.showDiff', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const eventBus = new EventBus();
    const diffManager = createMockDiffManager();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager,
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    // 1. First trigger a confirmation request to populate the active diffs map
    const toolCallId = 'call-123';
    const diffData = { oldContent: 'old', newContent: 'new', filePath: 'test.ts' };
    
    eventBus.emit('agent:requestConfirmation', {
      toolCallId,
      toolName: 'write_file',
      message: 'test',
      diffData
    });

    // 2. Simulate the webview sending 'viewDiff'
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.VIEW_DIFF, toolCallId });
    }

    expect(diffManager.showDiff).toHaveBeenCalledWith(diffData.filePath, diffData.oldContent, diffData.newContent);
  });

  it('closes the diff when confirmToolCall is received with a "deny" decision', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const eventBus = new EventBus();
    const diffManager = createMockDiffManager();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager,
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    // 1. First trigger a confirmation request to populate the active diffs map
    const toolCallId = 'call-deny-test';
    const filePath = 'sensitive-file.ts';
    const diffData = { oldContent: 'old', newContent: 'new', filePath };
    
    eventBus.emit('agent:requestConfirmation', {
      toolCallId,
      toolName: 'write_file',
      message: 'test',
      diffData
    });

    // 2. Simulate the webview sending 'confirmToolCall' with 'deny'
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL, toolCallId, decision: 'deny' });
    }

    // 3. Verify that closeDiff was called with the correct file path
    expect(diffManager.closeDiff).toHaveBeenCalledWith(filePath);
  });

  it('handles agent:maxIterationsReached event', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();
    
    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    // Event before resolveWebviewView
    eventBus.emit('agent:maxIterationsReached', { maxIterations: CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS });
    expect(posted.length).toBe(0);

    await provider.resolveWebviewView(webviewView);
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
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };
    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus: new EventBus(),
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST });
    }
  });

  it('passes reasoning tokens with tokenType to webview', async () => {
    const extensionUri = createMockUri('/ext');
    const eventBus = new EventBus();
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const chatAgent: IChatAgent = {
      run: async () => {
        eventBus.emit('agent:token', { token: 'thought', type: 'reasoning' });
        eventBus.emit('agent:token', { token: 'result', type: 'content' });
        return Promise.resolve();
      }
    };

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent,
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    expect(posted).toEqual([
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'thought', tokenType: 'reasoning' },
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'result', tokenType: 'content' },
      { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION, text: '' }
    ]);
  });

  it('posts tool_end message to webview when agent:toolEnd is emitted', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const eventBus = new EventBus();
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor: { getProfiles: () => [], getActiveProfile: () => '' },
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    const toolCallId = 'call-123';
    const toolName = 'testTool';
    const result = 'execution result';
    const success = true;

    eventBus.emit('agent:toolEnd', {
      toolCallId,
      toolName,
      result,
      success
    });

    expect(posted).toContainEqual({
      sender: MESSAGE_SENDERS.ASSISTANT,
      type: EXTENSION_EVENTS.TOOL_END,
      toolCallId,
      toolName,
      result,
      success
    });
  });

  it('posts tool_start message to webview when agent:toolStart is emitted', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const eventBus = new EventBus();
    const posted: MessageFromTheExtensionToTheWebview[] = [];
    const webview = createMockWebview(posted);
    const webviewView = createMockWebviewView(webview, 'X');

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor: { getProfiles: () => [], getActiveProfile: () => '' },
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);

    const toolCallId = 'call-123';
    const toolName = 'testTool';
    const args = '{"arg1": "val1"}';

    eventBus.emit('agent:toolStart', {
      toolCallId,
      toolName,
      args
    });

    expect(posted).toContainEqual({
      sender: MESSAGE_SENDERS.ASSISTANT,
      type: EXTENSION_EVENTS.TOOL_START,
      toolCallId,
      toolName,
      displayMessage: 'formatted-message',
      args,
      uiOptions: {}
    });
  });

  it('_sendCompletionMessage does nothing if _view is undefined', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const profileAccessor: ILlmProviderAccessor = { getProfiles: () => [], getActiveProfile: () => '' };

    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');

    const eventBus = new EventBus();

    const { config, secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor,
      chatAgent: {
        run: async () => {
          // Simulate view being cleared during request
          provider._view = undefined;
          return Promise.resolve();
        }
      },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    await provider.resolveWebviewView(webviewView);
    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    expect(provider._view).toBeUndefined();
  });

  it('lazily resolves API key if missing when sending a message', async () => {
    const extensionUri = createMockUri('/ext');
    const vscodeApi = createMockVscodeApi();
    const eventBus = new EventBus();
    const config = createDefaultConfig({
      activeChatProfile: 'test-profile',
      profiles: {
        'test-profile': {
          model: 'test-model',
          apiKey: '${TEST_KEY}',
          apiKeyPlaceholder: 'TEST_KEY'
          // resolvedApiKey is missing
        }
      }
    });
    const { secretManager, httpClient, toolUiProvider } = createMocks();

    const provider = new ChatWebviewViewProvider({
      extensionContext: { extensionUri, globalStorageUri: createMockUri('/storage') },
      profileAccessor: { getProfiles: () => ['test-profile'], getActiveProfile: () => 'test-profile' },
      chatAgent: { run: async () => { } },
      chatHistoryManager: createMockPersistentHistoryManager(),
      buildContext: { buildContext: async () => '' },
      getChatWebviewContent: () => '',
      vscodeApi,
      fileReader: createMockFileContentReader(),
      eventBus,
      diffManager: createMockDiffManager(),
      config,
      secretManager,
      httpClient,
      toolUiProvider
    });

    const webview = createMockWebview();
    const webviewView = createMockWebviewView(webview, 'X');
    await provider.resolveWebviewView(webviewView);

    const updateProvidersSpy = jest.spyOn(configProcessor, 'updateProviders');

    if (webview.__handler) {
      await webview.__handler({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' });
    }

    expect(updateProvidersSpy).toHaveBeenCalledWith(config, eventBus, secretManager, httpClient, true);
    updateProvidersSpy.mockRestore();
  });
});
