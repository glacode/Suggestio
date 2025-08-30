import fetch from 'node-fetch';
import * as vscode from 'vscode';
import { Anonymizer } from '../anonymizer/anonymizer.js';
import { log } from '../logger.js';

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
};

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
  // Anonymize the prompt if an anonymizer is provided
  const processedPrompt = anonymizer ? anonymizer.anonymize(prompt) : prompt;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: processedPrompt }
      ],
      max_tokens: 300
    })
  });

  const json = (await response.json()) as OpenRouterResponse;
  log("Response:" + JSON.stringify(json, null, 2));

  let content = json.choices?.[0]?.message?.content?.trim();
  console.log("Content:", content);

  if (!content) {
    return [];
  }

  // Deanonymize the content if an anonymizer is provided
  if (anonymizer) {
    content = anonymizer.deanonymize(content);
  }

  return [
    new vscode.InlineCompletionItem(content, new vscode.Range(position, position))
  ];
}