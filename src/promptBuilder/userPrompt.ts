import { ChatHistory, IPrompt } from "../chat/types.js";

export class UserPrompt implements IPrompt {
  constructor(private prompt: string) { }

  generateChatHistory(): ChatHistory {
    return [{ role: "user", content: this.prompt }];
  }
}
