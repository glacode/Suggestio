export interface ProviderConfig {
  endpoint: string;
  model: string;
  apiKey: string;             // raw value from config.json
  apiKeyPlaceholder?: string; // extracted placeholder, optional
  resolvedApiKey?: string;    // actual key used at runtime
}

export interface Config {
  activeProvider: string;
  providers: {
    [key: string]: ProviderConfig;
  };
  anonymizer: {
    enabled: boolean;
    words: string[];
  };
}

interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecretContext {
  secrets: SecretStorage;
}