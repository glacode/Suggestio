// completion/cancellation.ts
import * as vscode from 'vscode';
import { log } from '../logger.js';

export function handleCancellation(
  token: vscode.CancellationToken | undefined,
  resolve: (items: vscode.InlineCompletionItem[]) => void,
  stage: 'before' | 'after'
): boolean {
  if (token?.isCancellationRequested) {
    log(`❌ Suggestio: Request cancelled ${stage} LLM call`);
    resolve([]);
    return true;
  }
  return false;
}
