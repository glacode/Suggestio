import fetch from 'node-fetch';
import { Anonymizer } from '../anonymizer/anonymizer.js';
import { log } from '../logger.js';

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
};

/**
 * Generic utility to send a prompt (or AST string) to the LLM provider
 * and return the raw text response.
 */
export async function queryLlm(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  anonymizer?: Anonymizer
): Promise<string | null> {
  const processedPrompt = anonymizer ? anonymizer.anonymize(prompt) : prompt;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: processedPrompt },
      ],
      max_tokens: 300,
    }),
  });

  const json = (await response.json()) as OpenRouterResponse;
  log('Response:' + JSON.stringify(json, null, 2));

  let content = json.choices?.[0]?.message?.content?.trim() || null;
  console.log('Content:', content);

  if (!content) {
    return null;
  }

  // Deanonymize if needed
  if (anonymizer) {
    content = anonymizer.deanonymize(content);
  }

  return content;
}
