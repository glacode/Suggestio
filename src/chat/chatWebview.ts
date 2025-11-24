import * as vscode from 'vscode';
import * as fs from 'fs';
import type { GetChatWebviewContent } from './types.js';

export interface IChatWebviewContentArgs {
    extensionUri: vscode.Uri;
    scriptUri: vscode.Uri;
    highlightCssUri: vscode.Uri;
    models: string[];
    activeModel: string;
}

export const getChatWebviewContent: GetChatWebviewContent = (args) => {
    // 1. Get the path to the chat.html file on disk
    const htmlPath = vscode.Uri.joinPath(args.extensionUri, 'media', 'chat.html');
    
    // 2. Read the file content
    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // 3. Replace placeholders with the actual URIs
    htmlContent = htmlContent
        .replace('{{scriptUri}}', args.scriptUri.toString())
        .replace('{{highlightCssUri}}', args.highlightCssUri.toString())
        .replace('{{models}}', JSON.stringify(args.models))
        .replace('{{activeModel}}', args.activeModel);

    return htmlContent;
}