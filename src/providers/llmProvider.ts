import { IPrompt } from "../chat/types.js";

export interface llmProvider {
  query(prompt: IPrompt): Promise<string | null>;
  queryStream(prompt: IPrompt, onToken: (token: string) => void): Promise<void>;
}
