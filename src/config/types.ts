import { llmProvider } from "../providers/llmProvider.js";
import { IAnonymizer } from "../types.js";

export interface ProviderConfig {
  endpoint?: string; // optional because Gemini doesn’t use it
  model: string;
  apiKey: string;             // raw value from config.json
  apiKeyPlaceholder?: string; // extracted placeholder, optional
  resolvedApiKey?: string;    // actual key used at runtime
  type?: "openai-compatible" | "gemini"; // defaults to openai-compatible
}

export interface Config {
  activeProvider: string;
  providers: {
    [key: string]: ProviderConfig;
  };
  anonymizer: {
    enabled: boolean;
    words: string[];
    sensitiveData?: {
      allowedEntropy: number;
      minLength: number;
    };
  };
  anonymizerInstance?: IAnonymizer;
  llmProviderForInlineCompletion?: llmProvider;
  llmProviderForChat?: llmProvider;
}

export interface ConfigContainer {
  config: Config;
}

interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecretContext {
  secrets: SecretStorage;
}