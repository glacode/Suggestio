import { ChatPrompt } from '../../src/chat/chatPrompt.js';
import { ChatHistory, ChatMessage } from '../../src/chat/types.js';

describe('ChatPrompt', () => {
  const SYSTEM_PROMPT_CONTENT = "You are a code assistant";
  const INITIAL_SYSTEM_MESSAGE: ChatMessage = { role: "system", content: SYSTEM_PROMPT_CONTENT };

  it('should prepend system prompt if conversation is empty', () => {
    const chatHistory: ChatHistory = [];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE]);
  });

  it('should prepend system prompt if conversation does not start with it', () => {
    const chatHistory: ChatHistory = [{ role: "user", content: "Hello" }];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hello" }]);
  });

  it('should not prepend system prompt if conversation already starts with it', () => {
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hello" }];
    const chatPrompt = new ChatPrompt(chatHistory);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hello" }]);
  });

  it('should add context if not present and provided', () => {
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE];
    const context = "some context";
    const chatPrompt = new ChatPrompt(chatHistory, context);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "system", content: context }]);
  });

  it('should update context if present and new context is provided', () => {
    const oldContext = "old context";
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE, { role: "system", content: oldContext }];
    const newContext = "new context";
    const chatPrompt = new ChatPrompt(chatHistory, newContext);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "system", content: newContext }]);
  });

  it('should remove context if present and no new context is provided', () => {
    const oldContext = "old context";
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE, { role: "system", content: oldContext }, { role: "user", content: "Hi" }];
    const chatPrompt = new ChatPrompt(chatHistory, undefined);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hi" }]);
  });

  it('should not modify conversation if no context and no new context is provided', () => {
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hi" }];
    const chatPrompt = new ChatPrompt(chatHistory, undefined);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "user", content: "Hi" }]);
  });

  it('should handle null context as undefined', () => {
    const chatHistory: ChatHistory = [INITIAL_SYSTEM_MESSAGE];
    const chatPrompt = new ChatPrompt(chatHistory, null as any);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE]);
  });

  it('should handle context with user messages only', () => {
    const chatHistory: ChatHistory = [{ role: "user", content: "Hello" }];
    const context = "test context";
    const chatPrompt = new ChatPrompt(chatHistory, context);
    expect(chatPrompt.generate()).toEqual([INITIAL_SYSTEM_MESSAGE, { role: "system", content: context }, { role: "user", content: "Hello" }]);
  });

  it('should handle multiple user messages', () => {
    const chatHistory: ChatHistory = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ];
    const context = "multi message context";
    const chatPrompt = new ChatPrompt(chatHistory, context);
    expect(chatPrompt.generate()).toEqual([
      INITIAL_SYSTEM_MESSAGE,
      { role: "system", content: context },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ]);
  });
});
