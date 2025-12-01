import { Conversation } from "./types.js";
import { Prompt } from "../promptBuilder/prompt.js";

export class ChatPrompt implements Prompt {
  constructor(private conversation: Conversation) {}

  generate(): Conversation {
    return this.conversation;
  }
}
