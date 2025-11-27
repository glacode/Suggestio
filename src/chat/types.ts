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
  postMessage(message: WebviewResponseMessage): Promise<boolean> | Thenable<boolean>;
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

/**
 * `WebviewResponseMessage` defines the types of messages that can be sent *from* the extension
 * (backend) to the webview (frontend). This is used for AI responses and status updates.
 *
 * `sender`: Always 'assistant' for these messages.
 * `type: 'token'`: Represents a partial piece of the AI's response (for streaming).
 *   Contains the `text` of the token.
 * `type: 'completion'`: Signals that the AI's response stream has finished.
 *   Contains the final (or empty if tokens were sent) `text` of the completion.
 * (No `type`): A generic message, often used for error reporting. Contains the `text` of the message.
 */
export type WebviewResponseMessage =
  | { sender: 'assistant'; type: 'token'; text: string }
  | { sender: 'assistant'; type: 'completion'; text: string }
  | { sender: 'assistant'; text: string }; // For general messages, e.g. errors

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
  fetchStreamChatResponse(userPrompt: string, onToken: (token: string) => void): Promise<void>;
  clearHistory(): void;
}

/**
 * `ILlmProviderAccessor` defines the interface for accessing information about
 * the configured Language Model (LLM) providers.
 *
 * `getModels()`: Returns a list of available model identifiers (strings).
 * `getActiveModel()`: Returns the identifier of the currently active/selected model.
 */
export interface IProviderAccessor {
  getModels(): string[];
  getActiveModel(): string;
}

/**
 * `BuildContext` is a function type that, when called, generates additional
 * contextual information (as a string) to be included in an AI prompt.
 * This context might be derived from the active editor, workspace, etc.
 */
export type BuildContext = () => string;

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
