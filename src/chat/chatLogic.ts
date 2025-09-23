import { queryLlm } from '../llm/queryLlm.js';
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

            const response: string | null = await queryLlm(
                this.activeProvider.endpoint,
                this.activeProvider.resolvedApiKey || '',
                this.activeProvider.model,
                prompt,
                this.anonymizer
            );

            if (response) {
                log("Chat response: " + response);
                return response;
            } else {
                return 'No response received from LLM';
            }
        } catch (error) {
            return 'Error processing message: ' + error;
        }
    }
}