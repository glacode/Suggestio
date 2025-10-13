export interface llmProvider {
  query(prompt: string): Promise<string | null>;
  queryStream(prompt: string, onToken: (token: string) => void): Promise<void>;
}
