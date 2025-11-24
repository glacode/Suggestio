import * as vscode from 'vscode';

export interface IChatResponder {
  fetchStreamChatResponse(userPrompt: string, onToken: (token: string) => void): Promise<void>;
  clearHistory(): void;
}

export type BuildContext = () => string;

export type GetChatWebviewContent = (args: {
  extensionUri: vscode.Uri;
  scriptUri: vscode.Uri;
  highlightCssUri: vscode.Uri;
  models: string[];
  activeModel: string;
}) => string;

export interface IProviderAccessor {
  getModels(): string[];
  getActiveModel(): string;
}
