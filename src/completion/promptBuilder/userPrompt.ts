import { IChatMessage, IPrompt } from "../../types.js";

export class UserPrompt implements IPrompt {
  constructor(private prompt: string) { }

  generateChatHistory(): IChatMessage[] {
    return [{ role: "user", content: this.prompt }];
  }
}
