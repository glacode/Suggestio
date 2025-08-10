import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const { join, dirname } = require('path');
const { fileURLToPath } = require('url');

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const apiKey = process.env.OPENROUTER_API_KEY;

type OpenRouterChoice = {
  message?: {
    content?: string;
  }
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
};

function extractPrefix(document: vscode.TextDocument, position: vscode.Position, maxLines = 10): string {
  const startLine = Math.max(0, position.line - maxLines);
  const lines: string[] = [];

  for (let i = startLine; i <= position.line; i++) {
    const lineText = document.lineAt(i).text;

    if (i === position.line) {
      // Only include text up to the cursor for the current line
      lines.push(lineText.substring(0, position.character));
    } else {
      lines.push(lineText);
    }
  }

  return lines.join('\n').trim();
}

let debounceTimer: NodeJS.Timeout | undefined;
let pendingResolve: ((items: vscode.InlineCompletionItem[]) => void) | null = null;
const DEBOUNCE_DELAY_MS = 1000; // Adjust as needed

export function activate(context: vscode.ExtensionContext) {
  console.log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, ctx, token) {
      // Cancel any previous debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Return a Promise now, but resolve it later when the debounce expires
      return new Promise<vscode.InlineCompletionItem[]>((resolve) => {
        pendingResolve = resolve;

        debounceTimer = setTimeout(async () => {
          const prefix = extractPrefix(document, position);
          const prompt = `
You are an autocomplete engine inside a code editor.
Continue the given JavaScript code exactly from where it stops.
Do not repeat the already provided text.
Do not explain, comment, or add extra text — output only the continuation of the code.
Here is the code so far:
${prefix}
`;


          const now = Date.now();
          console.log(`Seconds: ${Math.floor(now / 1000)}, Milliseconds: ${now % 1000}`);
          console.log("Prompt:", prompt);
          // console.log(`Bearer ${apiKey}`);

          try {
            // const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            const response = await fetch('https://api.llm7.io/v1/chat/completions', {
              method: 'POST',
              // method: 'GET',
              headers: {
                // 'Authorization': `Bearer ${apiKey}`,
                'Authorization': `Bearer unused`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                // model: 'deepseek/deepseek-chat-v3-0324:free',
                model: 'qwen2.5-coder-32b-instruct',
                messages: [
                  { role: 'system', content: 'You are a helpful coding assistant.' },
                  { role: 'user', content: prompt }
                ],
                max_tokens: 300
              })
            });

            console.log(`After fetch`);
            const json = (await response.json()) as OpenRouterResponse;
            console.log("Response:", JSON.stringify(json, null, 2));

            const content = json.choices?.[0]?.message?.content?.trim();
            console.log("Content:", content);
            if (!content) {
              pendingResolve?.([]);
              return;
            }

            pendingResolve?.([
              new vscode.InlineCompletionItem(content, new vscode.Range(position, position))
            ]);
          } catch (err) {
            console.error("Error fetching completion:", err);
            pendingResolve?.([]);
          } finally {
            pendingResolve = null;
          }
        }, DEBOUNCE_DELAY_MS);
      });
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ language: 'javascript' }, { language: 'typescript' }],
      provider
    )
  );
}


export function deactivate() { }