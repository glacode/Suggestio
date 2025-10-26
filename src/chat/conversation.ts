export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export type Conversation = ChatMessage[];
