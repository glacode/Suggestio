// This file contains only type declarations. It is designed to be "runtime-free"
// by avoiding direct `import * as vscode from 'vscode'` statements.
// This allows other modules to `import type` from this file without pulling in
// the entire `vscode` runtime, which is beneficial for testing and build processes.

// --------------------------------------------------------------------------------
//  VS Code API Type Mocks/Abstractions
// --------------------------------------------------------------------------------

/**
 * `UriLike` is a minimal type representing a Uniform Resource Identifier (URI).
 * It abstracts `vscode.Uri` to avoid runtime dependencies on the `vscode` module.
 */
export interface UriLike {
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
  extensionUri: UriLike;
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
    joinPath(base: UriLike, ...paths: string[]): UriLike;
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
  localResourceRoots?: readonly UriLike[];
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
  asWebviewUri(uri: UriLike): UriLike;

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
      command: 'sendMessage';
      /** The text of the message to send. */
      text: string;
    }
  | {
      /** User has selected a different language model. */
      command: 'modelChanged';
      /** The ID of the selected model. */
      model: string;
    }
  | {
      /** User wants to clear the chat history. */
      command: 'clearHistory';
    };

/**
 * Defines the role of a participant in the chat.
 * - `system`: Instructions for the AI behavior.
 * - `user`: The human interacting with the AI.
 * - `assistant`: The AI model itself.
 */
export type ChatRole = "system" | "user" | "assistant";

/**
 * Represents a single message in the chat history.
 */
export interface ChatMessage {
  /**
   * The role of the message sender.
   */
  role: ChatRole;

  /**
   * The text content of the message.
   */
  content: string;
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
      sender: 'assistant';
      /** Represents a partial piece of the AI's response (for streaming). */
      type: 'token';
      /** The text content of the token. */
      text: string;
    }
  | {
      /** Indicates the message comes from the AI assistant. */
      sender: 'assistant';
      /** Signals that the AI's response stream has finished. */
      type: 'completion';
      /** The final text of the completion (or empty if tokens were fully streamed). */
      text: string;
    }
  | {
      /** Indicates the message comes from the AI assistant. */
      sender: 'assistant';
      /** A generic message, often used for error reporting or non-streaming info. */
      text: string;
    }
  | {
      /** Instructs the webview to initiate and display a new chat session. */
      command: 'newChat';
    };

/**
 * Represents the full history of a chat conversation.
 */
export type ChatHistory = ChatMessage[];

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
   * @returns The constructed chat history.
   */
  generateChatHistory(): ChatHistory;
}

/**
 * `IChatResponder` defines the interface for the backend logic that handles
 * interacting with the Language Model (LLM).
 */
export interface IChatResponder {
  /**
   * Sends a `userPrompt` to the LLM and receives the response as a stream of tokens.
   *
   * @param prompt The prompt object containing context and history.
   * @param onToken A callback invoked for each received token from the stream.
   * @returns A promise that resolves when the stream is finished.
   */
  fetchStreamChatResponse(prompt: IPrompt, onToken: (token: string) => void): Promise<void>;
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
  addMessage(message: ChatMessage): void;

  /**
   * Retrieves the current chat history.
   * @returns An array of chat messages.
   */
  getChatHistory(): ChatHistory;
}

/**
 * `ILlmProviderAccessor` defines the interface for accessing information about
 * the configured Language Model (LLM) providers.
 */
export interface ILlmProviderAccessor {
  /**
   * Returns a list of available model identifiers.
   * @returns Array of model ID strings.
   */
  getModels(): string[];

  /**
   * Returns the identifier of the currently active/selected model.
   * @returns The active model ID string.
   */
  getActiveModel(): string;
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
  extensionUri: UriLike;
  /** URI for the main JavaScript bundle of the webview. */
  scriptUri: UriLike;
  /** URI for the syntax highlighting CSS. */
  highlightCssUri: UriLike;
  /** List of available models. */
  models: string[];
  /** The currently active model. */
  activeModel: string;
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
      uri: UriLike;
      /**
       * Retrieves the full text of the document.
       * @returns The document text.
       */
      getText(): string;
    };
  } | undefined;
}

/**
 * Contract for building a context string to be used as additional information in a system prompt.
 * This context might be derived from the active editor, workspace, etc.
 */
export interface IContextBuilder {
  /**
   * Builds the context string.
   * @returns A promise that resolves to the context string.
   */
  buildContext(): Promise<string>;
}

/**
 * Manages ignore patterns from sources like .gitignore and .vscodeignore.
 */
export interface IIgnoreManager {
  /**
   * Checks if a file path should be ignored based on current patterns.
   * @param filePath The path to check.
   * @returns A promise that resolves to true if the file should be ignored, false otherwise.
   */
  shouldIgnore(filePath: string): Promise<boolean>;
}

/**
 * Provides access to the workspace root path.
 */
export interface IWorkspaceProvider {
  /**
   * Returns the root path of the current workspace.
   * @returns The root path string, or undefined if no workspace is open.
   */
  rootPath(): string | undefined;
}

/**
 * Provides a way to read file contents from the file system.
 */
export interface IFileContentProvider {
  /**
   * Reads the content of a file at the given path.
   * @param path The path of the file to read.
   * @returns The file content as a string, or undefined if the read failed.
   */
  read(path: string): string | undefined;
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
}

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
  readonly uri: UriLike;

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

// --------------------------------------------------------------------------------
//  LLM Provider Types
// --------------------------------------------------------------------------------
export interface ILlmProvider {
  query(prompt: IPrompt): Promise<string | null>;
  queryStream(prompt: IPrompt, onToken: (token: string) => void): Promise<void>;
}

// --------------------------------------------------------------------------------
//  Config Types
// --------------------------------------------------------------------------------

export interface ProviderConfig {
  endpoint?: string; // optional because Gemini doesn’t use it
  model: string;
  apiKey: string;             // raw value from config.json
  apiKeyPlaceholder?: string; // extracted placeholder, optional
  resolvedApiKey?: string;    // actual key used at runtime
  type?: "openai-compatible" | "gemini"; // defaults to openai-compatible
}

export interface Config {
  activeProvider: string;
  enableInlineCompletion?: boolean;
  providers: {
    [key: string]: ProviderConfig;
  };
  anonymizer: {
    enabled: boolean;
    words: string[];
    sensitiveData?: {
      allowedEntropy: number;
      minLength: number;
    };
  };
  anonymizerInstance?: IAnonymizer;
  llmProviderForInlineCompletion?: ILlmProvider;
  llmProviderForChat?: ILlmProvider;
}

export interface ConfigContainer {
  config: Config;
}

interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecretContext {
  secrets: SecretStorage;
}