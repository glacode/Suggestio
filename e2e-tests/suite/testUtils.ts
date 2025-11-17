import * as vscode from 'vscode';

export async function simulateTyping(text: string, delay: number = 150) {
    for (const ch of text) {
        await vscode.commands.executeCommand('type', { text: ch });
        await new Promise(r => setTimeout(r, delay));
    }
}
