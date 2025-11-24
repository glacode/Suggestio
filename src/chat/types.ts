// This file contains only type declarations so it remains runtime-free
// (no `vscode` runtime import). Use `import type` elsewhere when needed.

export interface UriLike {
  fsPath?: string;
  toString(): string;
}

export interface IExtensionContextMinimal {
  extensionUri: UriLike;
}

export interface IVscodeApiLocal {
  Uri: {
    joinPath(base: UriLike, ...paths: string[]): UriLike;
  };
}

export interface IWebviewOptions {
  enableScripts?: boolean;
  localResourceRoots?: readonly UriLike[];
}

export interface IDisposable {
  dispose(): void;
}

export interface IWebview {
  options?: IWebviewOptions;
  asWebviewUri(uri: UriLike): UriLike;
  onDidReceiveMessage<T = WebviewMessage>(listener: (message: T) => void): IDisposable;
  postMessage(message: WebviewResponseMessage): Promise<boolean> | Thenable<boolean>;
  html?: string;
}

export interface IWebviewView {
  title?: string;
  webview: IWebview;
}

export type WebviewMessage =
  | { command: 'sendMessage'; text: string }
  | { command: 'modelChanged'; model: string }
  | { command: 'clearHistory' };

/** Messages sent from extension to webview (response/output messages). */
export type WebviewResponseMessage =
  | { sender: 'assistant'; type: 'token'; text: string }
  | { sender: 'assistant'; type: 'completion'; text: string }
  | { sender: 'assistant'; text: string };

export interface IChatResponder {
  fetchStreamChatResponse(userPrompt: string, onToken: (token: string) => void): Promise<void>;
  clearHistory(): void;
}

export interface IProviderAccessor {
  getModels(): string[];
  getActiveModel(): string;
}

export type BuildContext = () => string;

export type GetChatWebviewContent = (args: {
  extensionUri: UriLike;
  scriptUri: UriLike;
  highlightCssUri: UriLike;
  models: string[];
  activeModel: string;
}) => string;
