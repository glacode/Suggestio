import { Prompt } from "../promptBuilder/prompt.js";

export interface llmProvider {
  query(prompt: Prompt): Promise<string | null>;
  queryStream(prompt: Prompt, onToken: (token: string) => void): Promise<void>;
}
