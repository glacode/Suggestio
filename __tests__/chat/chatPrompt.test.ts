import { ChatPrompt } from '../../src/chat/chatPrompt.js';
import { ChatHistory, IChatMessage } from '../../src/types.js';

describe('ChatPrompt', () => {
  const SYSTEM_PROMPT_CONTENT = "You are a code assistant. You can use tools to interact with the workspace.";
  const INITIAL_SYSTEM_MESSAGE: IChatMessage = { role: "system", content: SYSTEM_PROMPT_CONTENT };

  it('should create a system prompt if conversation is empty', () => {
    const chatHistory: ChatHistory = [];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generateChatHistory()).toEqual([INITIAL_SYSTEM_MESSAGE]);
  });

  it('should add a system prompt if conversation does not start with one', () => {
    const chatHistory: ChatHistory = [{ role: "user", content: "Hello" }];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generateChatHistory()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hello" }]);
  });

  it('should replace the system prompt if conversation already starts with one', () => {
    const chatHistory: ChatHistory = [
      { role: "system", content: "some other system message" },
      { role: "user", content: "Hello" }
    ];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generateChatHistory()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hello" }]);
  });

  it('should add context to the system prompt', () => {
    const chatHistory: ChatHistory = [];
    const context = "some context";
    const chatPrompt = new ChatPrompt(chatHistory, context);
    const expectedSystemMessage: IChatMessage = {
      role: "system",
      content: `${SYSTEM_PROMPT_CONTENT}\n${context}`
    };
    expect(chatPrompt.generateChatHistory()).toEqual([expectedSystemMessage]);
  });

  it('should merge context with an existing system prompt', () => {
    const oldContext = "old context";
    const chatHistory: ChatHistory = [{ role: "system", content: oldContext }, { role: "user", content: "Hi" }];
    const newContext = "new context";
    const chatPrompt = new ChatPrompt(chatHistory, newContext);
    const expectedSystemMessage: IChatMessage = {
      role: "system",
      content: `${SYSTEM_PROMPT_CONTENT}\n${newContext}`
    };
    expect(chatPrompt.generateChatHistory()).toEqual([expectedSystemMessage, { role: "user", content: "Hi" }]);
  });
  
  it('should remove all system prompts and create a new one', () => {
    const chatHistory: ChatHistory = [
        { role: "system", content: "first system message" },
        { role: "user", content: "Hello" },
        { role: "system", content: "second system message" },
        { role: "assistant", content: "Hi there" },
    ];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generateChatHistory()).toEqual([
        INITIAL_SYSTEM_MESSAGE,
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
    ]);
  });

  it('should handle multiple user messages with context', () => {
    const chatHistory: ChatHistory = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ];
    const context = "multi message context";
    const chatPrompt = new ChatPrompt(chatHistory, context);
    const expectedSystemMessage: IChatMessage = {
      role: "system",
      content: `${SYSTEM_PROMPT_CONTENT}\n${context}`
    };
    expect(chatPrompt.generateChatHistory()).toEqual([
      expectedSystemMessage,
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ]);
  });
});