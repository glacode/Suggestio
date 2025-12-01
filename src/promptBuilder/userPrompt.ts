import { ChatHistory } from "../chat/types.js";
import { Prompt } from "./prompt.js";

export class UserPrompt implements Prompt {
  constructor(private prompt: string) {}

  generate(): ChatHistory {
    return [{ role: "user", content: this.prompt }];
  }
}
