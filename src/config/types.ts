// config/types.ts
export interface Config {
  activeProvider: string;
  providers: {
    [key: string]: {
      endpoint: string;
      model: string;
      apiKey: string;
    }
  };
  anonymizer: {
    enabled: boolean;
    words: string[];
  };
}
