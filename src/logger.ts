// logger.ts
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
  console.log(`[Suggestio] ${message}`);
}

// 👇 Only used in tests to clear the singleton
export function __resetLogger() {
  outputChannel = undefined;
}
