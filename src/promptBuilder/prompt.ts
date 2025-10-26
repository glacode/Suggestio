import { Conversation } from "../chat/conversation.js";

export interface Prompt {
  generate(): Conversation;
}
