import * as vscode from 'vscode';
import * as fs from 'fs';

export function getChatWebviewContent(
    extensionUri: vscode.Uri, 
    scriptUri: vscode.Uri, 
    highlightCssUri: vscode.Uri
): string {
    // 1. Get the path to the chat.html file on disk
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'media', 'chat.html');
    
    // 2. Read the file content
    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // 3. Replace placeholders with the actual URIs
    htmlContent = htmlContent
        .replace('{{scriptUri}}', scriptUri.toString())
        .replace('{{highlightCssUri}}', highlightCssUri.toString());

    return htmlContent;
}