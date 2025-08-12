import * as vscode from 'vscode';
import { extractPrefix } from './extractPrefix.js';

/**
 * Builds the prompt for the AI completion request.
 * @param document The active text document.
 * @param position The position of the cursor.
 */
export function buildPrompt(document: vscode.TextDocument, position: vscode.Position): string {
  const prefix = extractPrefix(document, position);

  return `
You are an autocomplete engine inside a code editor.
Continue the given JavaScript code exactly from where it stops.
Do not repeat the already provided text.
Do not explain, comment, or add extra text — output only the continuation of the code.
Here is the code so far:
${prefix}
`;
}
