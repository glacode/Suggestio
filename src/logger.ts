import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Suggestio");
    outputChannel.appendLine("Logger initialized");
  }
}

export function log(message: string) {
  const timestamp = new Date().toISOString();
  if (outputChannel) {
    outputChannel.appendLine(`[${timestamp}] ${message}`);
  }
  // keep console.log too if you like
  console.log(`[Suggestio] ${message}`);
}
