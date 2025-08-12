import fetch from 'node-fetch';
import * as vscode from 'vscode';

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
  position: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
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
        { role: 'user', content: prompt }
      ],
      max_tokens: 300
    })
  });

  const json = (await response.json()) as OpenRouterResponse;
  console.log("Response:", JSON.stringify(json, null, 2));

  const content = json.choices?.[0]?.message?.content?.trim();
  console.log("Content:", content);

  if (!content) {
    return [];
  }

  return [
    new vscode.InlineCompletionItem(content, new vscode.Range(position, position))
  ];
}
