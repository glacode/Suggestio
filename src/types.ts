// This file contains only type declarations. It is designed to be "runtime-free"
// by avoiding direct `import * as vscode from 'vscode'` statements.
// This allows other modules to `import type` from this file without pulling in
// the entire `vscode` runtime, which is beneficial for testing and build processes.

// --------------------------------------------------------------------------------
//  VS Code API Type Mocks/Abstractions
// --------------------------------------------------------------------------------

/**
 * `UriLike` is a minimal type representing a Uniform Resource Identifier (URI).
 * It abstracts `vscode.Uri`.
 *
 * `fsPath`: A file system path, like '/Users/name/project/file.txt'. (Optional because some URIs don't have one).
 * `toString()`: Returns the string representation of the URI.
 */
export interface UriLike {
  fsPath?: string;
  toString(): string;
}

/**
 * `IExtensionContextMinimal` is a minimal representation of `vscode.ExtensionContext`.
 * It provides access to the `extensionUri`, which is crucial for locating resources
 * within the extension's installation directory.
 */
export interface IExtensionContextMinimal {
  extensionUri: UriLike; // The URI of the directory where the extension is installed.
}

/**
 * `IVscodeApiLocal` is a local abstraction of parts of the `vscode` API.
 * This is used to avoid direct dependency on the `vscode` module in certain contexts (like tests).
 *
 * `Uri`: Contains utility methods for working with URIs.
 *   `joinPath(base, ...paths)`: Analogous to `vscode.Uri.joinPath`, it creates a new URI
 *     by joining path segments to a base URI.
 */
export interface IVscodeApiLocal {
  Uri: {
    joinPath(base: UriLike, ...paths: string[]): UriLike;
  };
}

/**
 * `IWebviewOptions` reflects a subset of `vscode.WebviewOptions`.
 * These options configure the behavior and security of the webview panel.
 *
 * `enableScripts`: If `true`, scripts (JavaScript) are allowed to run in the webview.
 * `localResourceRoots`: An array of URIs that define which local directories
 *   the webview is allowed to load resources (like images, scripts, stylesheets) from.
 *   This is a crucial security feature.
 */
export interface IWebviewOptions {
  enableScripts?: boolean;
  localResourceRoots?: readonly UriLike[];
}

/**
 * `IDisposable` is an interface used for objects that can be "cleaned up" or
 * have resources released when they are no longer needed. It's equivalent to
 * `vscode.Disposable`.
 *
 * `dispose()`: A method that performs the necessary cleanup.
 */
export interface IDisposable {
  dispose(): void;
}

/**
 * `IWebview` is a minimal type representing the `vscode.Webview` object.
 * This is the actual HTML content surface within a `WebviewView`.
 *
 * `options`: The configuration options for the webview.
 * `asWebviewUri(uri)`: Analogous to `vscode.Webview.asWebviewUri`, this method converts
 *   a local `UriLike` into a special `https://webview.vscode-cdn.net/` URI that
 *   the webview can safely load. This is a security measure.
 * `onDidReceiveMessage(listener)`: Equivalent to `vscode.Webview.onDidReceiveMessage`,
 *   this event fires when the webview (frontend) sends a message to the extension (backend).
 *   The `listener` function will be called with the message.
 * `postMessage(message)`: Equivalent to `vscode.Webview.postMessage`, this method sends
 *   a message from the extension (backend) to the webview (frontend).
 * `html`: The HTML content displayed inside the webview. Equivalent to `vscode.Webview.html`.
 */
export interface IWebview {
  options?: IWebviewOptions;
  asWebviewUri(uri: UriLike): UriLike;
  onDidReceiveMessage<T = WebviewMessage>(listener: (message: T) => void): IDisposable;
  postMessage(message: MessageFromTheExtensionToTheWebview): Promise<boolean> | Thenable<boolean>;
  html?: string;
}

/**
 * `IWebviewView` is a minimal type representing `vscode.WebviewView`.
 * This is the container for a webview within a VS Code sidebar panel.
 *
 * `title`: The title displayed in the header of the webview view panel.
 * `webview`: The actual `IWebview` object that holds the HTML content.
 */
export interface IWebviewView {
  title?: string;
  webview: IWebview;
}

// --------------------------------------------------------------------------------
//  Custom Chat-Specific Types
// --------------------------------------------------------------------------------

/**
 * `WebviewMessage` defines the types of messages that can be sent *from* the webview
 * (frontend) to the extension (backend). This is used for user interactions.
 *
 * `sendMessage`: User wants to send a chat message. Contains the `text` of the message.
 * `modelChanged`: User has selected a different language model. Contains the `model` ID.
 * `clearHistory`: User wants to clear the chat history.
 */
export type WebviewMessage =
  | { command: 'sendMessage'; text: string }
  | { command: 'modelChanged'; model: string }
  | { command: 'clearHistory' };


export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * `MessageFromTheExtensionToTheWebview` defines the types of messages that can be sent *from* the extension
 * (backend) to the webview (frontend). This type was previously named `ResponseMessageFromTheExtensionToTheWebview`
 * but was renamed to accommodate commands that are not direct responses, such as initiating a new chat.
 *
 * Messages generally fall into two categories:
 *
 * 1. **AI Responses and Status Updates (from 'assistant'):**
 *    These messages carry AI-generated content or status information related to the AI's processing.
 *    - `{ sender: 'assistant'; type: 'token'; text: string }`: Represents a partial piece of the AI's response (for streaming).
 *      Contains the `text` of the token.
 *    - `{ sender: 'assistant'; type: 'completion'; text: string }`: Signals that the AI's response stream has finished.
 *      Contains the final (or empty if tokens were sent) `text` of the completion.
 *    - `{ sender: 'assistant'; text: string }`: A generic message from the assistant, often used for error reporting
 *      or other non-streaming information.
 *
 * 2. **Extension Commands:**
 *    These messages instruct the webview to perform a specific action, independent of AI responses.
 *    - `{ command: 'newChat' }`: Instructs the webview to initiate and display a new chat session.
 */
export type MessageFromTheExtensionToTheWebview =
  | { sender: 'assistant'; type: 'token'; text: string }
  | { sender: 'assistant'; type: 'completion'; text: string }
  | { sender: 'assistant'; text: string } // For general messages, e.g. errors
  | { command: 'newChat' };


export type ChatHistory = ChatMessage[];

/**
 * The `Prompt` interface defines a contract for objects responsible for generating
 * a `ChatHistory` (an array of `ChatMessage`s) that can be sent to an LLM.
 *
 * It serves a higher-level purpose than just storing messages (like `ChatHistoryManager`).
 * While `ChatHistoryManager` *stores* the complete ongoing conversation, `Prompt`
 * encapsulates the *logic* for constructing a specific, LLM-ready prompt
 * by potentially selecting, formatting, and augmenting messages from the history
 * or other sources (e.g., system instructions, current user input, code context).
 * 
 * For example when it's time to generate a *new* response from the LLM, the `Prompt`
 * implementation takes the current user input, possibly some selected *parts* of the
 * `ChatHistoryManager`'s stored history (e.g., the last N turns), and any
 * system-level instructions, then combines them into a single, cohesive `ChatHistory`
 * object that is *optimized* for the LLM.
 *
 * This abstraction allows for flexible and extensible strategies for building
 * different types of prompts without duplicating logic or tightly coupling
 * prompt creation to specific LLM providers or chat contexts.
 */
export interface IPrompt {
  generateChatHistory(): ChatHistory;
}

/**
 * `IChatResponder` defines the interface for the backend logic that handles
 * interacting with the Language Model (LLM).
 *
 * `fetchStreamChatResponse(userPrompt, onToken)`: Sends a `userPrompt` to the LLM
 *   and receives the response as a stream of `token`s, invoking the `onToken`
 *   callback for each received token.
 * `clearHistory()`: Clears the chat history maintained by the responder.
 */
export interface IChatResponder {
  fetchStreamChatResponse(prompt: IPrompt, onToken: (token: string) => void): Promise<void>;
}

/**
 * `IChatHistoryManager` defines the interface for managing chat history.
 *
 * `clearHistory()`: Clears the chat history.
 * `addMessage(message: ChatMessage): void;`
 * `getChatHistory(): ChatMessage[];`
 */
export interface IChatHistoryManager {
  clearHistory(): void;
  addMessage(message: ChatMessage): void;
  getChatHistory(): ChatHistory;
}

/**
 * `ILlmProviderAccessor` defines the interface for accessing information about
 * the configured Language Model (LLM) providers.
 *
 * `getModels()`: Returns a list of available model identifiers (strings).
 * `getActiveModel()`: Returns the identifier of the currently active/selected model.
 */
export interface ILlmProviderAccessor {
  getModels(): string[];
  getActiveModel(): string;
}

/**
 * `GetChatWebviewContent` is a function type responsible for generating the
 * complete HTML string that will be loaded into the webview.
 * It takes various URIs and model information as arguments to dynamically
 * create the webview's frontend.
 */
export type GetChatWebviewContent = (args: {
  extensionUri: UriLike; // The extension's base URI.
  scriptUri: UriLike; // URI for the main JavaScript bundle of the webview.
  highlightCssUri: UriLike; // URI for the syntax highlighting CSS.
  models: string[]; // List of available models.
  activeModel: string; // The currently active model.
}) => string;

/**
 * `IActiveTextEditorProvider` provides access to the currently active editor.
 * This is a minimal abstraction over `vscode.window.activeTextEditor`
 * to enable dependency injection and testability.
 */
export interface IActiveTextEditorProvider {
  activeTextEditor: {
    document: {
      uri: UriLike;
      getText(): string;
    };
  } | undefined;
}

/**
 * Contract for building a context string to be used as additional information in a system prompt.
 * This context might be derived from the active editor, workspace, etc.
 */
export interface IContextBuilder {
    buildContext(): Promise<string>;
}

/**
 * Manages ignore patterns from sources like .gitignore and .vscodeignore.
 */
export interface IIgnoreManager {
  shouldIgnore(filePath: string): Promise<boolean>;
}

/**
 * Provides access to the workspace root path.
 */
export interface IWorkspaceProvider {
  rootPath(): string | undefined;
}

/**
 * Provides a way to read file contents.
 */
export interface IFileContentProvider {
  read(path: string): string | undefined;
}

/**
 * Provides path manipulation utilities.
 */
export interface IPathResolver {
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  basename(path: string): string;
}

export interface IAnonymizer {
    anonymize(text: string): string;
    deanonymize(text: string): string;
}