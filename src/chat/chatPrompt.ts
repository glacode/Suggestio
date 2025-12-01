import { ChatHistory } from "./types.js";
import { IPrompt } from "../promptBuilder/prompt.js";

export class ChatPrompt implements IPrompt {
  constructor(private conversation: ChatHistory) {}

  generate(): ChatHistory {
    return this.conversation;
  }
}
