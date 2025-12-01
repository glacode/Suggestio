import { ChatHistory } from "../chat/types.js";

export interface Prompt {
  generate(): ChatHistory;
}
