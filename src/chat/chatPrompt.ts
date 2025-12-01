import { ChatHistory } from "./types.js";
import { Prompt } from "../promptBuilder/prompt.js";

export class ChatPrompt implements Prompt {
  constructor(private conversation: ChatHistory) {}

  generate(): ChatHistory {
    return this.conversation;
  }
}
