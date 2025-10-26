import { Conversation } from "./conversation.js";
import { Prompt } from "../promptBuilder/prompt.js";

export class ChatPrompt implements Prompt {
  constructor(private conversation: Conversation) {}

  generate(): Conversation {
    return this.conversation;
  }
}
