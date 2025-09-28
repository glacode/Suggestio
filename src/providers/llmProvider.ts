export interface llmProvider {
  query(prompt: string): Promise<string | null>;
}
