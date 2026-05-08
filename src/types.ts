import { z } from 'zod';
import type { ToolCall } from "./schemas.js";
import type { IEventBus, EventMap } from "./utils/eventBus.js";

export type { ToolCall, IEventBus, EventMap };

// --------------------------------------------------------------------------------
//  VS Code API Type Mocks/Abstractions
// --------------------------------------------------------------------------------

/**
 * `UriLike` is a minimal type representing a Uniform Resource Identifier (URI).
 * It abstracts `vscode.Uri` to avoid runtime dependencies on the `vscode` module.
 */
export interface IUriLike {
  /**
   * The scheme of the URI, such as 'file' or 'untitled'.
   */
  scheme?: string;

  /**
   * A file system path, like '/Users/name/project/file.txt'.
   * Optional because some URIs (e.g., 'http://') don't have a file system path.
   */
  fsPath?: string;

  /**
   * Returns the string representation of the URI.
   * @returns The string form of the URI.
   */
  toString(): string;
}

/**
 * `IExtensionContextMinimal` is a minimal representation of `vscode.ExtensionContext`.
 * It provides access to the `extensionUri`, which is crucial for locating resources
 * within the extension's installation directory.
 */
export interface IExtensionContextMinimal {
  /**
   * The URI of the directory where the extension is installed.
   * Used to resolve paths to resources like icons, templates, etc.
   */
  extensionUri: IUriLike;

  /**
   * The URI of the directory where the extension can store global state.
   */
  globalStorageUri: IUriLike;
}

/**
 * `IVscodeApiLocal` is a local abstraction of parts of the `vscode` API.
 * This is used to avoid direct dependency on the `vscode` module in certain contexts (like tests).
 */
export interface IVscodeApiLocal {
  /**
   * Contains utility methods for working with URIs.
   */
  Uri: {
    /**
     * Analogous to `vscode.Uri.joinPath`, it creates a new URI
     * by joining path segments to a base URI.
     *
     * @param base The base URI to join paths to.
     * @param paths The path segments to join.
     * @returns A new URI representing the combined path.
     */
    joinPath(base: IUriLike, ...paths: string[]): IUriLike;

    /**
     * Parses a string into a URI.
     */
    parse(value: string, strict?: boolean): IUriLike;
  };

  /**
   * Exposes VS Code commands.
   */
  commands: {
    /**
     * Executes a command.
     */
    executeCommand<T = any>(command: string, ...rest: any[]): Thenable<T>;
  };

  /**
   * Exposes VS Code window-related functionality.
   */
  window: {
    /**
     * Provides access to tab groups.
     */
    tabGroups: {
      all: readonly {
        tabs: readonly {
          input: any;
        }[];
      }[];
      close(tab: any | any[]): Thenable<boolean>;
    };
  };
}

/**
 * `IWebviewOptions` reflects a subset of `vscode.WebviewOptions`.
 * These options configure the behavior and security of the webview panel.
 */
export interface IWebviewOptions {
  /**
   * If `true`, scripts (JavaScript) are allowed to run in the webview.
   * @default false
   */
  enableScripts?: boolean;

  /**
   * An array of URIs that define which local directories the webview is allowed
   * to load resources (like images, scripts, stylesheets) from.
   * This is a crucial security feature to prevent unauthorized file access.
   */
  localResourceRoots?: readonly IUriLike[];
}

/**
 * `IDisposable` is an interface used for objects that can be "cleaned up" or
 * have resources released when they are no longer needed. It's equivalent to
 * `vscode.Disposable`.
 */
export interface IDisposable {
  /**
   * Performs the necessary cleanup of resources.
   */
  dispose(): void;
}

/**
 * `IWebview` is a minimal type representing the `vscode.Webview` object.
 * This is the actual HTML content surface within a `WebviewView`.
 */
export interface IWebview {
  /**
   * The configuration options for the webview.
   */
  options?: IWebviewOptions;

  /**
   * Analogous to `vscode.Webview.asWebviewUri`.
   * Converts a local `UriLike` into a special `https://webview.vscode-cdn.net/` URI
   * that the webview can safely load. This is a security measure.
   *
   * @param uri The local URI to convert.
   * @returns A URI that can be used within the webview.
   */
  asWebviewUri(uri: IUriLike): IUriLike;

  /**
   * Analogous to `vscode.Webview.onDidReceiveMessage`.
   * Fired when the webview (frontend) sends a message to the extension (backend).
   *
   * @param listener The function to call when a message is received.
   * @returns A disposable to unsubscribe from the event.
   */
  onDidReceiveMessage<T = WebviewMessage>(listener: (message: T) => void): IDisposable;

  /**
   * Analogous to `vscode.Webview.postMessage`.
   * Sends a message from the extension (backend) to the webview (frontend).
   *
   * @param message The message data to send.
   * @returns A promise that resolves when the message is posted.
   */
  postMessage(message: MessageFromTheExtensionToTheWebview): Promise<boolean> | Thenable<boolean>;

  /**
   * The HTML content displayed inside the webview.
   * Equivalent to `vscode.Webview.html`.
   */
  html?: string;
}

/**
 * `IWebviewApi` defines the interface for the VS Code Webview API,
 * which is available to scripts running inside the webview via `acquireVsCodeApi()`.
 */
export interface IWebviewApi<T = any> {
  /**
   * Posts a message to the extension backend.
   * @param message The message to send.
   */
  postMessage(message: WebviewMessage): void;

  /**
   * Retrieves the persisted state for the webview.
   */
  getState(): T | undefined;

  /**
   * Sets the persisted state for the webview.
   * @param state The state to persist.
   */
  setState(state: T): T;
}

/**
 * `IWebviewView` is a minimal type representing `vscode.WebviewView`.
 * This is the container for a webview within a VS Code sidebar panel.
 */
export interface IWebviewView {
  /**
   * The title displayed in the header of the webview view panel.
   */
  title?: string;

  /**
   * The actual `IWebview` object that holds the HTML content.
   */
  webview: IWebview;
}

import { WEBVIEW_COMMANDS, EXTENSION_COMMANDS, EXTENSION_EVENTS, MESSAGE_SENDERS } from './constants/protocol.js';

// --------------------------------------------------------------------------------
//  Custom Chat-Specific Types
// --------------------------------------------------------------------------------

/**
 * `WebviewMessage` defines the types of messages that can be sent *from* the webview
 * (frontend) to the extension (backend). This is used for user interactions.
 */
export type WebviewMessage =
  | {
    /** User wants to send a chat message. */
    command: typeof WEBVIEW_COMMANDS.SEND_MESSAGE;
    /** The text of the message to send. */
    text: string;
  }
  | {
    /** User has selected a different language model profile. */
    command: typeof WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED;
    /** The ID of the selected profile. */
    model: string;
  }
  | {
    /** User has selected a different completion model profile. */
    command: typeof WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED;
    /** The ID of the selected profile. */
    model: string;
  }
  | {
    /** User wants to clear the chat history. */
    command: typeof WEBVIEW_COMMANDS.CLEAR_HISTORY;
  }
  | {
    /** User wants to cancel the current LLM request. */
    command: typeof WEBVIEW_COMMANDS.CANCEL_REQUEST;
  }
  | {
    /** User wants to view a diff for a tool call. */
    command: typeof WEBVIEW_COMMANDS.VIEW_DIFF;
    /** The ID of the tool call. */
    toolCallId: string;
  }
  | {
    /** User has responded to a tool confirmation request. */
    command: typeof WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL;
    /** The ID of the tool call. */
    toolCallId: string;
    /** The user's decision ('allow', 'deny', 'always-allow' or 'always-allow-command'). */
    decision: 'allow' | 'deny' | 'always-allow' | 'always-allow-command';
    }  | {
    /** User wants to edit an API key. */
    command: typeof WEBVIEW_COMMANDS.EDIT_API_KEY;
    /** The placeholder of the key to edit. */
    placeholder: string;
  }
  | {
    /** User wants to delete an API key. */
    command: typeof WEBVIEW_COMMANDS.DELETE_API_KEY;
    /** The placeholder of the key to delete. */
    placeholder: string;
  }
  | {
    /** User wants to retry the last message. */
    command: typeof WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE;
  }
  | {
    /** User wants to retrieve the list of saved chat sessions. */
    command: typeof WEBVIEW_COMMANDS.GET_SESSIONS;
  }
  | {
    /** User wants to load a specific chat session. */
    command: typeof WEBVIEW_COMMANDS.LOAD_SESSION;
    /** The ID of the session to load. */
    sessionId: string;
  };

/**
 * Defines the role of a participant in the chat.
 * - `system`: Instructions for the AI behavior.
 * - `user`: The human interacting with the AI.
 * - `assistant`: The AI model itself.
 * - `tool`: The result of a tool execution.
 */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/**
 * Represents a single message in the chat history.
 */
export interface IChatMessage {
  /**
   * The role of the message sender.
   */
  role: ChatRole;

  /**
   * The text content of the message.
   */
  content: string;

  /**
   * The reasoning content of the message (Chain of Thought).
   */
  reasoning?: string;

  /**
   * Tool calls requested by the assistant.
   */
  tool_calls?: ToolCall[];

  /**
   * ID of the tool call this message is responding to (for role: 'tool').
   */
  tool_call_id?: string;
}

/**
 * Internal UI configuration for tool rendering in the Suggestio interface.
 * This metadata is used to guide the frontend and is NOT sent to the LLM.
 */
export interface IToolUiOptions {
  /** 
   * When true, the tool's raw arguments will be hidden behind a collapsed 
   * <details> element in the chat. This is useful for tools with large 
   * inputs (like file writes) to keep the chat interface clean and focused.
   */
  collapseByDefault?: boolean;
}

/**
 * `MessageFromTheExtensionToTheWebview` defines the types of messages that can be sent *from* the extension
 * (backend) to the webview (frontend).
 *
 * Messages generally fall into two categories:
 * 1. AI Responses and Status Updates (from 'assistant').
 * 2. Extension Commands (e.g. 'newChat').
 */
export type MessageFromTheExtensionToTheWebview =
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Represents a partial piece of the AI's response (for streaming). */
    type: typeof EXTENSION_EVENTS.TOKENS;
    /** The text content of the token. */
    text: string;
    /** The type of token. */
    tokenType?: 'content' | 'reasoning';
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals the start of a tool call. */
    type: typeof EXTENSION_EVENTS.TOOL_START;
    /** The ID of the tool call. */
    toolCallId: string;
    /** The name of the tool being called. */
    toolName: string;
    /** The human-readable description of the tool execution. */
    displayMessage?: string;
    /** The arguments passed to the tool. */
    args: string;
    /** Internal metadata to guide the frontend rendering. */
    uiOptions?: IToolUiOptions;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals streaming output from a tool call. */
    type: typeof EXTENSION_EVENTS.TOOL_OUTPUT;
    /** The ID of the tool call. */
    toolCallId: string;
    /** The output text. */
    output: string;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals the end of a tool call. */
    type: typeof EXTENSION_EVENTS.TOOL_END;
    /** The ID of the tool call. */
    toolCallId: string;
    /** The name of the tool. */
    toolName: string;
    /** The result of the tool execution. */
    result: string;
    /** Whether the tool execution was successful. */
    success: boolean;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals that a tool has officially started executing. */
    type: typeof EXTENSION_EVENTS.TOOL_STARTED;
    /** The ID of the tool call. */
    toolCallId: string;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals a request for user confirmation before executing a tool. */
    type: typeof EXTENSION_EVENTS.REQUEST_CONFIRMATION;
    /** The ID of the tool call. */
    toolCallId: string;
    /** The name of the tool. */
    toolName: string;
    /** The message to display to the user. */
    message: string;
    /** Optional diff data for visual review. */
    diffData?: {
      oldContent: string;
      newContent: string;
      filePath: string;
    };
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals that the AI's response stream has finished. */
    type: typeof EXTENSION_EVENTS.COMPLETION;
    /** The final text of the completion (or empty if tokens were fully streamed). */
    text: string;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** A generic message, often used for error reporting or non-streaming info. */
    type: typeof EXTENSION_EVENTS.ERROR;
    /** The text content of the error. */
    text: string;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** Signals that the AI reached a logical limit and needs user permission to continue. */
    type: typeof EXTENSION_EVENTS.HALTED;
    /** The text content explaining the limit. */
    text: string;
  }
  | {
    /** Indicates the message comes from the AI assistant. */
    sender: typeof MESSAGE_SENDERS.ASSISTANT;
    /** A notification message that appears in chat but doesn't affect conversation history. */
    type: typeof EXTENSION_EVENTS.NOTIFICATION;
    /** The text content of the notification, or null to hide notification. */
    text: string | null;
  }
  | {
    /** Instructs the webview to initiate and display a new chat session. */
    command: typeof EXTENSION_COMMANDS.NEW_CHAT;
  }
  | {
    /** Instructs the webview to open the settings overlay. */
    command: typeof EXTENSION_COMMANDS.OPEN_SETTINGS;
  }
  | {
    /** Instructs the webview to open the history overlay. */
    command: typeof EXTENSION_COMMANDS.OPEN_HISTORY;
  }
  | {
    /** Updates the profile metadata displayed in settings overlay. */
    type: typeof EXTENSION_EVENTS.UPDATE_PROFILE_METADATA;
    /** Updated profile metadata. */
    metadata: ProfileMetadata[];
  }
  | {
    /** Instructs the webview to load a specific chat history. */
    type: typeof EXTENSION_EVENTS.CHAT_HISTORY_LOADED;
    /** The chat history to load. */
    history: IStoredChatMessage[];
  }
  | {
    /** Provides a list of saved chat sessions to the webview. */
    type: typeof EXTENSION_EVENTS.SESSIONS_LIST;
    /** The list of session summaries. */
    sessions: { id: string; title: string; timestamp: number }[];
  };

/**
 * Interface for calculating the entropy of a string.
 */
export interface IEntropyCalculator {
  /**
   * Calculates the normalized entropy of a string.
   * Normalized entropy ranges from 0 to 1.
   * Higher values often indicate random keys, passwords, or encrypted data.
   * @param str The string to calculate entropy for.
   * @returns The normalized entropy value between 0 and 1.
   */
  getEntropy(str: string): number;
}

/**
 * Local-only metadata for a message, used for UI state and extension logic.
 * This is persisted to history but NOT sent to the LLM.
 */
export interface IMessageMetadata {
  /** Whether the tool execution was successful (for role: 'tool'). */
  toolCallSuccess?: boolean;
}

/**
 * Represents a chat message as it is stored in the local history.
 */
export interface IStoredChatMessage extends IChatMessage {
  /** Extension-specific metadata that is persisted but NOT sent to the LLM. */
  metadata?: IMessageMetadata;
}

/**
 * The `IPrompt` interface defines a contract for objects responsible for generating
 * a `ChatHistory` (an array of `ChatMessage`s) that can be sent to an LLM.
 *
 * It encapsulates the logic for constructing a specific, LLM-ready prompt
 * by potentially selecting, formatting, and augmenting messages from the history
 * or other sources.
 */
export interface IPrompt {
  /**
   * Generates the chat history array to be sent to the LLM.
   * @returns The constructed chat history, sanitized of local metadata.
   */
  generateChatHistory(): IChatMessage[];

  /**
   * The additional context used when building the system prompt.
   */
  readonly context?: string;
}

/**
 * `IChatAgent` defines the interface for the backend logic that handles
 * interacting with the Language Model (LLM).
 *
 * This interface provides the core functionality for communicating with AI models,
 * including streaming responses and handling cancellation signals.
 */
export interface IChatAgent {
  /**
   * Sends a `userPrompt` to the LLM and receives the response as a stream of tokens.
   *
   * @param prompt The prompt object containing context and history.
   * @param signal Optional AbortSignal to cancel the request.
   * @returns A promise that resolves when the stream is finished.
   */
  run(prompt: IPrompt, signal?: AbortSignal): Promise<void>;
}

/**
 * Interface for deleting files from the file system.
 */
export interface IFileDeleter {
  /**
   * Deletes a file at the specified path.
   * @param filePath The absolute path to the file to delete.
   */
  delete(filePath: string): void;
}

/**
 * Interface for workspace-specific chat history storage.
 */
export interface IWorkspaceChatHistoryStorage {
  /**
   * Loads all saved chat sessions from the workspace storage.
   * @returns An array of chat sessions, sorted by timestamp (newest first).
   */
  loadSessions(): IChatSession[];

  /**
   * Saves a single chat session to the workspace storage.
   * @param session The chat session to save.
   */
  saveSession(session: IChatSession): void;
}

/**
 * Represents a single chat session for persistence.
 */
export interface IChatSession {
  id: string;
  title: string;
  timestamp: number;
  history: IStoredChatMessage[];
}

/**
 * `IChatHistoryManager` defines the interface for managing chat history.
 */
export interface IChatHistoryManager {
  /**
   * Clears the stored chat history.
   */
  clearHistory(): void;

  /**
   * Adds a new message to the chat history.
   * @param message The message to add.
   */
  addMessage(message: IStoredChatMessage): void;

  /**
   * Retrieves the current chat history.
   * @returns An array of chat messages.
   */
  getChatHistory(): IStoredChatMessage[];
}

/**
 * `IPersistentChatHistoryManager` extends `IChatHistoryManager` with persistence capabilities.
 */
export interface IPersistentChatHistoryManager extends IChatHistoryManager {
  /**
   * Retrieves all saved chat sessions.
   */
  getSessions(): Promise<IChatSession[]>;

  /**
   * Loads a specific chat session by its ID.
   * @param sessionId The ID of the session to load.
   */
  loadSession(sessionId: string): Promise<void>;

  /**
   * Starts a new chat session.
   */
  newSession(): void;

  /**
   * Manually persists the current active session to storage.
   */
  persistCurrentSession(): void;
}

/**
 * `ILlmProviderAccessor` defines the interface for accessing information about
 * the configured Language Model (LLM) providers.
 */
export interface ILlmProviderAccessor {
  /**
   * Returns a list of available profile identifiers.
   * @returns Array of profile ID strings.
   */
  getProfiles(): string[];

  /**
   * Returns the identifier of the currently active/selected profile.
   * @returns The active profile ID string.
   */
  getActiveProfile(): string;
  /**
   * Optional: returns the list of completion profiles (including those that may not
   * be eligible for tool calls). If omitted, callers should fall back to
   * `getProfiles()`.
   */
  getCompletionProfiles?: () => string[];
    /**
     * Optional: returns the identifier of the active profile to be used for
     * inline/completion-specific features. If omitted, callers should fall back
     * to the chat active profile.
     */
    getCompletionActiveProfile?: () => string;
}

/**
 * Interface for the profile metadata passed to the webview.
 */
export interface ProfileMetadata {
  id: string;
  model: string;
  needsApiKey: boolean;
  hasApiKey: boolean;
  apiKeyPlaceholder?: string;
  isActiveChat: boolean;
  isActiveCompletion: boolean;
}

/**
 * Interface for the initial state passed to the webview.
 */
export interface InitialState {
  profiles: string[];
  activeProfile: string;
  completionProfiles?: string[];
  activeCompletionProfile?: string;
  profileMetadata?: ProfileMetadata[];
  autoAcceptEdits?: boolean;
}

/**
 * `GetChatWebviewContent` is a function type responsible for generating the
 * complete HTML string that will be loaded into the webview.
 *
 * @param args Configuration arguments for generating the webview content.
 * @returns The complete HTML string.
 */
export type GetChatWebviewContent = (args: {
  /** The extension's base URI. */
  extensionUri: IUriLike;
  /** URI for the main JavaScript bundle of the webview (chat.js). */
  chatJsUri: IUriLike;
  /** URI for the markdown rendering bundle (renderMarkDown.js). */
  markdownJsUri: IUriLike;
  /** URI for the syntax highlighting CSS (highlight.css). */
  highlightCssUri: IUriLike;
  /** URI for the chat UI CSS (chat.css). */
  chatCssUri: IUriLike;
  /** Initial state for the webview. */
  initialState: InitialState;
  /** VS Code API abstraction. */
  vscodeApi: IVscodeApiLocal;
  /** File reader abstraction. */
  fileReader: IFileContentReader;
}) => string;

/**
 * `IActiveTextEditorProvider` provides access to the currently active editor.
 * This is a minimal abstraction over `vscode.window.activeTextEditor`
 * to enable dependency injection and testability.
 */
export interface IActiveTextEditorProvider {
  /**
   * The currently active text editor, or undefined if none is active.
   */
  activeTextEditor: {
    /** The document associated with the active editor. */
    document: {
      /** The URI of the document. */
      uri: IUriLike;
      /**
       * Retrieves the full text of the document.
       * @returns The document text.
       */
      getText(): string;
    };
  } | undefined;
}

/**
 * Options for building the context string.
 */
export interface IContextOptions {
  /**
   * Whether to include the content of the currently active text editor.
   * Defaults to false to avoid context bloat in agentic workflows.
   */
  includeActiveEditor?: boolean;
}

/**
 * Contract for building a context string to be used as additional information in a system prompt.
 * This context might be derived from the active editor, workspace, etc.
 */
export interface IContextBuilder {
  /**
   * Builds the context string based on the provided options.
   * @param options Options to control what context is included.
   * @returns A promise that resolves to the context string.
   */
  buildContext(options?: IContextOptions): Promise<string>;
}

/**
 * Manages ignore patterns from sources like .gitignore and .suggestioignore. */
export interface IIgnoreManager {
  /**
   * Checks if a file path should be ignored based on current patterns.
   * @param filePath The path to check.
   * @returns A promise that resolves to true if the file should be ignored, false otherwise.
   */
  shouldIgnore(filePath: string): Promise<boolean>;
}

/**
 * Provides access to the workspace root path and URI.
 */
export interface IWorkspaceProvider {
  /**
   * Returns the root path of the current workspace.
   * @returns The root path string, or undefined if no workspace is open.
   */
  rootPath(): string | undefined;

  /**
   * Returns the root URI of the current workspace.
   * @returns The root URI, or undefined if no workspace is open.
   */
  rootUri(): IUriLike | undefined;

  /**
   * Returns a persistent storage path for the current workspace.
   * This is managed by VS Code and is outside the workspace root.
   */
  storagePath(): string | undefined;
}

/**
 * Provides a way to open documents.
 */
export interface IDocumentOpener {
  /**
   * Opens a text document from the given path.
   * @param path The path of the file to open.
   */
  openTextDocument(path: string): Promise<any>;
}

/**
 * Provides low-level read-only access to the file system.
 * This allows for mocking the file system in tests without depending on the 'fs' module.
 */
export interface IFileReadProvider {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: any): string;
}

/**
 * Provides a way to read file contents from the file system.
 */
export interface IFileContentReader {

  /**
   * Reads the content of a file at the given path.
   * @param path The path of the file to read.
   * @param startLine Optional start line (1-indexed).
   * @param endLine Optional end line (1-indexed).
   * @returns The file content as a string, or undefined if the read failed.
   */
  read(path: string, startLine?: number, endLine?: number): string | undefined;
}

/**
 * Provides a way to write file contents to the file system.
 */
export interface IFileContentWriter {
  /**
   * Writes the content to a file at the given path.
   * @param path The path of the file to write.
   * @param content The content to write.
   */
  write(path: string, content: string): void;
}

/**
 * Provides path manipulation utilities, abstracting `path` module functions.
 */
export interface IPathResolver {
  /**
   * Joins path segments into a single path.
   * @param paths The path segments to join.
   * @returns The joined path.
   */
  join(...paths: string[]): string;

  /**
   * Solves the relative path from `from` to `to`.
   * @param from The start path.
   * @param to The destination path.
   * @returns The relative path string.
   */
  relative(from: string, to: string): string;

  /**
   * Returns the last portion of a path.
   * @param path The path to evaluate.
   * @returns The basename of the path.
   */
  basename(path: string): string;

  /**
   * Resolves a sequence of paths or path segments into an absolute path.
   * @param paths A sequence of paths or path segments.
   * @returns The absolute path.
   */
  resolve(...paths: string[]): string;

  /**
   * Returns the directory name of a path.
   * @param path The path to evaluate.
   */
  dirname(path: string): string;
}

/**
 * Provides access to directory contents and existence.
 */
export interface IDirectoryReader {
  /**
   * Reads the contents of a directory.
   * @param path The path of the directory to read.
   * @returns The list of file names in the directory, or undefined if the read failed.
   */
  readdir(path: string): string[] | undefined;

  /**
   * Checks if a path exists.
   * @param path The path to check.
   * @returns True if the path exists, false otherwise.
   */
  exists(path: string): boolean;

  /**
   * Checks if a path is a directory.
   * @param path The path to check.
   * @returns True if the path is a directory, false otherwise.
   */
  isDirectory(path: string): boolean;
}

/**
 * Provides a way to create directories.
 */
export interface IDirectoryCreator {
  /**
   * Creates a directory.
   * @param path The path to create.
   * @param options Options for directory creation.
   */
  mkdir(path: string, options?: { recursive: boolean }): void;
}

export interface IInputBoxOptions {
  prompt?: string;
  placeHolder?: string;
  password?: boolean;
  ignoreFocusOut?: boolean;
}

export interface IQuickPickOptions {
  placeHolder?: string;
}

/**
 * Minimal representation of a configuration change event.
 */
export interface IConfigChangeEvent {
  /**
   * Check if a configuration section has changed.
   */
  affectsConfiguration(section: string): boolean;
}

/**
 * Provides access to configuration settings and notifies of changes.
 */
export interface IConfigProvider {
  /**
   * Retrieves the log level.
   */
  getLogLevel(): string;

  /**
   * Retrieves the maximum number of agent iterations.
   */
  getMaxAgentIterations(): number;

  /**
   * Retrieves if anonymizer is enabled. Returns undefined if not set in VS Code settings.
   */
  getAnonymizerEnabled(): boolean | undefined;

  /**
   * Retrieves if inline completion is enabled.
   */
  getEnableInlineCompletion(): boolean;

  /**
   * Retrieves the maximum number of retries for LLM API calls.
   */
  getMaxRetries(): number;

  /**
   * Retrieves the initial delay for exponential backoff in ms.
   */
  getInitialDelay(): number;

  /**
   * Fired when the configuration changes.
   * @param listener The function to call when the configuration changes.
   * @returns A disposable to unsubscribe from the event.
   */
  onDidChangeConfiguration(listener: (event: IConfigChangeEvent) => void): IDisposable;
}

/**
 * The result of a command execution.
 */
export interface ICommandResult {
  /** The standard output of the command. */
  stdout: string;
  /** The standard error of the command. */
  stderr: string;
  /** The exit code of the command, or null if it was terminated by a signal. */
  exitCode: number | null;
}

/**
 * The result of a command validation.
 */
export interface IValidationResult {
  /** Whether the command is allowed to execute. */
  allowed: boolean;
  /** The reason why the command was blocked, if any. */
  reason?: string;
}

/**
 * Provides a way to validate shell commands before execution.
 */
export interface ICommandValidator {
  /**
   * Validates a shell command.
   * @param command The command to validate.
   * @returns A result indicating if the command is allowed and why.
   */
  validate(command: string): IValidationResult;
}

/**
 * Provides a way to execute shell commands.
 */
export interface ICommandExecutor {
  /**
   * Executes a shell command.
   * @param command The command to execute.
   * @param options Execution options including working directory, cancellation signal, and streaming callbacks.
   * @returns A promise that resolves to the command execution result.
   */
  execute(command: string, options?: { 
    cwd?: string; 
    signal?: AbortSignal;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  }): Promise<ICommandResult>;
}

/**
 * Interface for scanning the workspace for files.
 */
export interface IWorkspaceScanner {
  /**
   * Recursively scans a directory and returns all visible file paths relative to the workspace root.
   * @param dirPath The absolute path of the directory to start scanning from.
   * @param options Options for the scan.
   * @returns A promise that resolves to an array of relative file paths.
   */
  scan(dirPath: string, options: { recursive: boolean }): Promise<string[]>;
}

/**
 * Provides a way to show a side-by-side diff in the editor.
 */
export interface IDiffManager {
  /**
   * Opens the native VS Code diff editor for the given contents.
   * @param filePath The path of the file being diffed (for the tab title).
   * @param oldContent The original content.
   * @param newContent The proposed content.
   */
  showDiff(filePath: string, oldContent: string, newContent: string): Promise<void>;

  /**
   * Closes the diff editor for the given file path if it's currently open.
   * @param filePath The path of the file to close the diff for.
   */
  closeDiff(filePath: string): Promise<void>;
}

/**
 * `IWindowProvider` provides a way to show messages and interact with the user.
...
 * This is a minimal abstraction over `vscode.window`.
 */
export interface IWindowProvider {
  /**
   * Shows an error message to the user.
   * @param message The message to show.
   */
  showErrorMessage(message: string): void;

  /**
   * Shows an information message to the user.
   * @param message The message to show.
   */
  showInformationMessage(message: string): void;

  /**
   * Shows a text document in the editor.
   * @param doc The document to show.
   */
  showTextDocument(doc: any): Promise<void>;

  /**
   * Shows an input box to the user.
   * @param options Options for the input box.
   */
  showInputBox(options?: IInputBoxOptions): Promise<string | undefined>;

  /**
   * Shows a quick pick to the user.
   * @param items The items to pick from.
   * @param options Options for the quick pick.
   */
  showQuickPick(items: string[], options?: IQuickPickOptions): Promise<string | undefined>;
}

// Composition interfaces for convenience
export interface IFileContentProvider extends IFileContentReader, IFileContentWriter { }
export interface IDirectoryProvider extends IDirectoryReader, IDirectoryCreator { }
export interface IWorkspaceProviderFull extends IWorkspaceProvider, IDocumentOpener { }

/**
 * Interface for a stateful, streaming deanonymizer.
 *
 * It maintains an internal buffer to correctly handle and reassemble
 * deanonymization placeholders that might be split across multiple chunks.
 */
export interface IStreamingDeanonymizer {
  /**
   * Processes a new text chunk from the stream.
   *
   * The method buffers the input chunk and checks if the buffer contains any complete
   * deanonymization placeholders (or safe text that can be released).
   *
   * @param chunk The new piece of text received from the stream.
   * @returns An object containing:
   *  - `processed`: The text that is safe to emit to the user.
   *  - `buffer`: The content currently remaining in the internal buffer (debug info).
   */
  process(chunk: string): { processed: string; buffer: string };

  /**
   * Flushes any remaining text from the internal buffer.
   * This should be called when the stream is complete (e.g., on "[DONE]").
   *
   * @returns The remaining text in the buffer.
   */
  flush(): string;
}

/**
 * Interface for anonymizing and deanonymizing sensitive information in text.
 */
export interface IAnonymizer {
  /**
   * Replaces sensitive information in the text with placeholders.
   * @param text The input text containing sensitive info.
   * @returns The anonymized text.
   */
  anonymize(text: string): string;

  /**
   * Replaces placeholders in the text with the original sensitive information.
   * @param text The anonymized text.
   * @returns The original text (deanonymized).
   */
  deanonymize(text: string): string;

  /**
   * Creates a stateful deanonymizer for processing streaming text.
   * @returns An instance of `IStreamingDeanonymizer`.
   */
  createStreamingDeanonymizer(): IStreamingDeanonymizer;
}

/**
 * Interface for notifying about anonymization events.
 * This decouples the Anonymizer from the event bus or logging mechanism.
 */
export interface IAnonymizationNotifier {
  /**
   * Notifies that a piece of information has been anonymized.
   *
   * @param original The original sensitive text.
   * @param placeholder The placeholder used to replace it.
   * @param type The type of anonymization performed (e.g., 'word' or 'entropy').
   */
  notifyAnonymization(original: string, placeholder: string, type: 'word' | 'entropy'): void;
}

// --------------------------------------------------------------------------------
//  Events
// --------------------------------------------------------------------------------

export interface IAnonymizationEventPayload {
  original: string;
  placeholder: string;
  type: 'word' | 'entropy';
}

export interface ITokenEventPayload {
  token: string;
  type: 'content' | 'reasoning';
}

import { LogLevelString } from './log/logger.js';

export interface ILogEventPayload {
  level: LogLevelString;
  message: string;
  metadata?: Record<string, any>;
}

export interface IToolCallEventPayload {
  toolCallId: string;
  toolName: string;
  args: string;
}

export interface IToolResultEventPayload {
  toolCallId: string;
  toolName: string;
  result: string;
  success: boolean;
}

export interface IToolOutputEventPayload {
  toolCallId: string;
  output: string;
}

export interface IToolConfirmationPayload {
  toolCallId: string;
  toolName: string;
  message: string;
  diffData?: {
    oldContent: string;
    newContent: string;
    filePath: string;
  };
}

/**
 * Interface for a service that provides human-readable messages and UI options for tool calls.
 */
export interface IToolUiProvider {
  /**
   * Formats a descriptive message and provides UI options for a tool call.
   * @param toolName The name of the tool.
   * @param args The arguments passed to the tool as a JSON string.
   * @returns An object containing the display message and UI options.
   */
  getToolUI(toolName: string, args: string): { displayMessage?: string; uiOptions?: IToolUiOptions };

  /**
   * Enriches a chat history with tool display messages and UI options.
   * This is useful for preparing history for the webview without persisting UI data.
   * @param history The chat history to enrich.
   * @returns A new enriched chat history.
   */
  enrichHistory(history: IChatMessage[]): any[];
}

/**
 * Payload for the user's response to a tool confirmation request.
 * The 'decision' field is a string to allow for future options like 'allow_session'.
 */
export interface IUserConfirmationPayload {
  toolCallId: string;
  decision: 'allow' | 'deny' | string;
}
export interface IAppEvents {
  'inlineCompletionToggled': boolean;
  'autoAcceptEditsToggled': boolean;
  'chatProfileChanged': string;
  'completionProfileChanged': string;
  'agent:maxIterationsReached': { maxIterations: number };
  'anonymization': IAnonymizationEventPayload;
  'agent:token': ITokenEventPayload;
  'agent:toolStart': IToolCallEventPayload;
  'agent:toolExecutionStarted': { toolCallId: string };
  'agent:toolOutput': IToolOutputEventPayload;
  'agent:toolEnd': IToolResultEventPayload;
  /**
   * Fired when a tool requires explicit user confirmation before execution.
   */
  'agent:requestConfirmation': IToolConfirmationPayload;
  /**
   * Fired when the user responds (Allow/Deny) to a tool confirmation request.
   */
  'user:confirmationResponse': IUserConfirmationPayload;
  /**
   * Fired to show a notification message in the chat UI.
   */
  'agent:notification': { text: string | null };
  'log': ILogEventPayload;
}

// --------------------------------------------------------------------------------
//  Editor / Completion Abstractions
// --------------------------------------------------------------------------------

/**
 * Represents a line of text in a document.
 */
export interface ITextLine {
  /**
   * The text of this line without the terminating line break characters.
   */
  readonly text: string;
}

/**
 * Represents a position in a text document.
 */
export interface IPosition {
  /**
   * The zero-based line value.
   */
  readonly line: number;
  /**
   * The zero-based character value.
   */
  readonly character: number;
}

/**
 * A range represents the text between two positions.
 */
export interface IRange {
  /**
   * The start position. It is before or equal to [end](#IRange.end).
   */
  readonly start: IPosition;
  /**
   * The end position. It is after or equal to [start](#IRange.start).
   */
  readonly end: IPosition;
}

/**
 * Represents a text document, such as a source file.
 */
export interface ITextDocument {
  /**
   * The associated uri for this document.
   */
  readonly uri: IUriLike;

  /**
   * The identifier of the programming language associated with this document.
   */
  readonly languageId: string;

  /**
   * The number of lines in this document.
   */
  readonly lineCount: number;

  /**
   * Returns a text line denoted by the line number.
   *
   * @param line A line number in [0, lineCount).
   * @return A line of text.
   */
  lineAt(line: number): ITextLine;
}

/**
 * A cancellation token is passed to an asynchronous or long running operation to request cancellation.
 */
export interface ICancellationToken {
  /**
   * Is true when the token has been cancelled, false otherwise.
   */
  readonly isCancellationRequested: boolean;
}

/**
 * An inline completion item represents a text snippet that is proposed inline to the user.
 */
export interface IInlineCompletionItem {
  /**
   * The text to insert.
   */
  readonly insertText: string;
  /**
   * The range this completion item applies to.
   */
  readonly range?: IRange;
}

/**
 * Represents a list of inline completion items.
 */
export interface IInlineCompletionList {
  /**
   * The completion items.
   */
  readonly items: IInlineCompletionItem[];
}

/**
 * Defines a tool that can be called by the LLM.
 */
export interface IToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    /**
     * An array of property names that are mandatory for the LLM to provide.
     * This follows the JSON Schema can be easily seen in the tool definitions.
     */
    required?: string[];
  };
}

/**
 * The result of a tool execution.
 */
export interface IToolResult {
  /** The text content to be returned to the LLM. */
  content: string;
  /** Whether the execution was logically successful. */
  success: boolean;
}

/**
 * Provides information about whether tool edits should be automatically accepted.
 */
export interface IAutoAcceptProvider {
  readonly autoAcceptEdits: boolean;
}

/**
 * Manages the allow-list of commands that can be executed without user confirmation.
 */
export interface ICommandAutoAcceptManager {
  /**
   * Marks a specific command string as auto-acceptable for the current session.
   * @param command The exact command string to allow.
   */
  allowCommand(command: string): void;

  /**
   * Checks if the given command string is currently auto-acceptable.
   * @param command The command string to check.
   * @returns True if the command is allowed, false otherwise.
   */
  isAllowed(command: string): boolean;

  /**
   * Clears all auto-accepted commands. Typically called at the start of a new session.
   */
  clear(): void;
}

/**
 * Interface for a tool implementation.
 */
export interface IToolImplementation<T = unknown> {
  /** 
   * The definition sent to the LLM (name, description, parameters). 
   */
  definition: IToolDefinition;

  /**
   * Internal UI configuration for the Suggestio interface.
   * IMPORTANT: This is NOT sent to the LLM to keep the context clean.
   */
  uiOptions?: IToolUiOptions;

  /**
   * Zod type to validate the tool arguments at runtime.
   */
  schema: z.ZodType<T>;
  /**
   * Executes the tool logic.
   * @param args Validated tool arguments.
   * @param signal Optional AbortSignal for cancellation.
   * @param toolCallId The unique identifier of this tool call, used for confirmation handshakes.
   */
  execute(args: T, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult>;
  /**
   * Optional method to return a human-readable description of the tool execution.
   * @param args The arguments passed to the tool.
   * @returns A string describing what the tool is doing.
   */
  formatMessage?(args: T): string;
}

// --------------------------------------------------------------------------------
//  HTTP Client Abstractions
// --------------------------------------------------------------------------------

/**
 * Minimal abstraction for an HTTP response to support both Node.js and Web environments.
 */
export interface IHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: AsyncIterable<any> | null;
  json(): Promise<any>;
  text(): Promise<string>;
}

/**
 * Minimal abstraction for an HTTP client.
 */
export interface IHttpClient {
  post(
    url: string,
    options: {
      headers: Record<string, string>;
      body: string;
      signal?: AbortSignal;
    }
  ): Promise<IHttpResponse>;
}

// --------------------------------------------------------------------------------
//  LLM Provider Types
// --------------------------------------------------------------------------------
export interface ILlmProvider {
  query(prompt: IPrompt, tools?: IToolDefinition[], signal?: AbortSignal): Promise<IChatMessage | null>;
  queryStream(prompt: IPrompt, tools?: IToolDefinition[], signal?: AbortSignal): Promise<IChatMessage[]>;
}

// --------------------------------------------------------------------------------
//  LLM Profile Types
// --------------------------------------------------------------------------------

export interface IProfileConfig {
  endpoint?: string; // optional because Gemini doesn’t use it
  model: string;
  apiKey: string;             // raw value from config.json
  apiKeyPlaceholder?: string; // extracted placeholder, optional
  resolvedApiKey?: string;    // actual key used at runtime
  type?: "openai-compatible" | "gemini"; // defaults to openai-compatible
  /** Whether the model supports tool calling. If not specified, defaults to true. */
  supportsTools?: boolean;
}

export interface IAnonymizerConfig {
  enabled: boolean;
  words: string[];
  sensitiveData?: {
    allowedEntropy: number;
    minLength: number;
  };
}

export interface IAnonymizerConfigHolder {
  anonymizer: IAnonymizerConfig;
}

/**
 * Represents the structure of the project-specific configuration file (suggestio.config.json).
 */
export interface IProjectConfig extends IAnonymizerConfigHolder {
  $schema?: string;
  activeChatProfile: string;
  activeCompletionProfile?: string;
  profiles: {
    [key: string]: IProfileConfig;
  };
  anonymizer: IAnonymizerConfig;
}

/**
 * Represents the merged, runtime configuration used by the extension.
 */
export interface IConfig extends IProjectConfig {
  anonymizerInstance?: IAnonymizer;
  llmProviderForInlineCompletion?: ILlmProvider;
  llmProviderForChat?: ILlmProvider;
  maxAgentIterations: number;
  logLevel: string;
  enableInlineCompletion: boolean;
  autoAcceptEdits: boolean;
  /**
   * Maximum length for tool results in characters before they are truncated.
   */
  toolResultMaxLength: number;
  /**
   * Maximum number of retries for LLM API calls.
   */
  maxRetries: number;
  /**
   * Initial delay for exponential backoff in ms.
   */
  initialDelay: number;
}

export interface IConfigContainer {
  config: IConfig;
}

export interface ISecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecretContext {
  secrets: ISecretStorage;
}
export interface IWebviewViewResolveContext<T = any> {
  readonly state: T | undefined;
}
