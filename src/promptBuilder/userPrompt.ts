import { ChatHistory } from "../chat/types.js";
import { IPrompt } from "./prompt.js";

export class UserPrompt implements IPrompt {
  constructor(private prompt: string) {}

  generate(): ChatHistory {
    return [{ role: "user", content: this.prompt }];
  }
}
