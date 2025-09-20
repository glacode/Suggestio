import * as vscode from 'vscode';
import { fetchCompletion } from '../completion/completionHandler.js';
import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { ProviderConfig, Config } from '../config/types.js';
import { log } from '../logger.js';
import { getActiveProvider } from '../providers/providerFactory.js';

export class ChatLogicHandler {
    private activeProvider: ProviderConfig;
    private config: Config;
    private anonymizer: ReturnType<typeof getAnonymizer>;

    constructor(config: Config) {
        this.activeProvider = getActiveProvider(config)!;
        this.config = config;
        this.anonymizer = getAnonymizer(config);
    }

    public async processMessage(prompt: string): Promise<string> {
        try {
            log(`Chat: Using provider ${this.config.activeProvider} with model ${this.activeProvider.model}`);
            log("Chat prompt: " + prompt);

            const items = await fetchCompletion(
                this.activeProvider.endpoint,
                this.activeProvider.resolvedApiKey || '',
                this.activeProvider.model,
                prompt,
                new vscode.Position(0, 0), // Position is not relevant for chat
                this.anonymizer
            );

            if (items && items.length > 0) {
                return items[0].insertText.toString();
            }

            throw new Error('No response received from LLM');

        } catch (error) {
            log("Error in chat processing: " + error);
            throw new Error('Failed to process message: ' + error);
        }
    }
}