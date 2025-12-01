import { Conversation } from "../chat/types.js";

export interface Prompt {
  generate(): Conversation;
}
