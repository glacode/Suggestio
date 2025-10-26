import { Conversation } from "../chat/conversation.js";
import { Prompt } from "./prompt.js";

export class UserPrompt implements Prompt {
  constructor(private prompt: string) {}

  generate(): Conversation {
    return [{ role: "user", content: this.prompt }];
  }
}
