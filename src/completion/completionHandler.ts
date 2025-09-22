import * as vscode from 'vscode';
import { Anonymizer } from '../anonymizer/anonymizer.js';
import { queryLlm } from '../llm/queryLlm.js';

/**
 * Calls the LLM provider endpoint and returns inline completion items.
 */
export async function fetchCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  position: vscode.Position,
  anonymizer?: Anonymizer // Add optional anonymizer parameter
): Promise<vscode.InlineCompletionItem[]> {
  const content = await queryLlm(endpoint, apiKey, model, prompt, anonymizer);
  if (!content) {
    return [];
  }
  return [
    new vscode.InlineCompletionItem(content, new vscode.Range(position, position))
  ];
}