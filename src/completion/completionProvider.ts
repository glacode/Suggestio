// completion/completionProvider.ts
import * as vscode from 'vscode';
import { buildPrompt } from '../promptBuilder/promptBuilder.js';
import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { fetchCompletion } from './completionHandler.js';
import { debounce } from './debounceManager.js';
import { handleCancellation } from './cancellation.js';
import { log } from '../logger.js';
import { Provider } from '../providers/providerFactory.js';
import { Config } from '../config/types.js';

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
    activeProvider: Provider,
    config: Config,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken | undefined,
    resolve: (items: vscode.InlineCompletionItem[]) => void
): () => void {
    return function performCompletion() {
        if (handleCancellation(token, resolve, 'before')) { return; }

        const prompt = buildPrompt(document, position);
        log(`Using provider: ${config.activeProvider} with model: ${activeProvider.model}`);
        log("Prompt: " + prompt);

        const anonymizer = getAnonymizer(config);

        fetchCompletion(
            activeProvider.endpoint,
            activeProvider.apiKey,
            activeProvider.model,
            prompt,
            position,
            anonymizer
        )
            .then(items => {
                if (handleCancellation(token, resolve, 'after')) { return; }
                log('✅ Suggestio: Returning completion to VS Code');
                resolve(items);
            })
            .catch(err => {
                log("Error fetching completion: " + err);
                resolve([]);
            });
    };
}

export function provideInlineCompletionItems(
    activeProvider: Provider,
    config: Config,
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token?: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[]> {
    return new Promise(resolve => {
        debounce(
            createDebounceCallback(activeProvider, config, document, position, token, resolve),
            DEBOUNCE_DELAY_MS
        );
    });
}
