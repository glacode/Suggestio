import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { IChatMessage, IHttpClient, IHttpResponse, IPrompt, IEventBus } from "../../src/types.js";
import { createMockEventBus } from "../testUtils.js";

class TestPrompt implements IPrompt {
  constructor(private messages: IChatMessage[]) { }
  generateChatHistory(): IChatMessage[] { return this.messages; }
}

function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: AsyncIterable<any> | null;
}): IHttpResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    json: async () => ({}),
    text: async () => "",
    body: options.body ?? null,
  };
}

async function* createStream(chunks: string[]): AsyncIterable<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("Gemma4 Reasoning Support", () => {
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockEventBus: jest.Mocked<IEventBus>;
  const endpoint = "http://example.com";
  const apiKey = "test-key";
  const model = "gemma-4-31b-it";

  beforeEach(() => {
    mockHttpClient = {
      post: jest.fn<any>(),
    };
    mockEventBus = createMockEventBus();
  });

  it("should handle Gemma4 reasoning tags and extra_content in queryStream", async () => {
    // Data from the user's log dump
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"<thought>Okay, I understand. I need to find and fix a bug that","extra_content":{"google":{"thought":true}},"role":"assistant"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":" is causing a failing test in the codebase.\\n\\nFirst, I need to explore the codebase to identify the failing test and","extra_content":{"google":{"thought":true}},"role":"assistant"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":" the bug. I\'ll start by listing the files in the repository.","extra_content":{"google":{"thought":true}},"role":"assistant"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":"</thought>","role":"assistant","tool_calls":[{"extra_content":{"google":{"thought_signature":"EiYKJGUyNDgzMGE3LTVjZDYtNDJmZS05OThiLWVlNTM5ZTcyYjljMw=="}},"function":{"arguments":"{\\"recursive\\":true}","name":"list_files"},"id":"6eic0cwq","type":"function"}]},"index":0}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({
      httpClient: mockHttpClient,
      endpoint,
      apiKey,
      model,
      eventBus: mockEventBus,
      maxRetries: 0,
      initialDelay: 0
    });
    
    const response = await provider.queryStream(new TestPrompt([]));

    // Verify reasoning tokens were emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', expect.objectContaining({ 
        token: "Okay, I understand. I need to find and fix a bug that", 
        type: 'reasoning' 
    }));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', expect.objectContaining({ 
        token: " is causing a failing test in the codebase.\n\nFirst, I need to explore the codebase to identify the failing test and", 
        type: 'reasoning' 
    }));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', expect.objectContaining({ 
        token: " the bug. I'll start by listing the files in the repository.", 
        type: 'reasoning' 
    }));

    // Verify no content tokens were emitted (since they were all reasoning)
    const contentTokens = mockEventBus.emit.mock.calls
        .filter(call => call[0] === 'agent:token' && typeof call[1] === 'object' && call[1] !== null && 'type' in call[1] && call[1].type === 'content');
    expect(contentTokens).toHaveLength(0);

    // Verify tool call was captured
    expect(response).toHaveLength(2); // One for reasoning, one for tool calls
    expect(response[0].reasoning).toBeDefined();
    expect(response[1].tool_calls).toHaveLength(1);
    expect(response[1].tool_calls?.[0].function.name).toBe("list_files");
    expect(response[1].tool_calls?.[0].extra_content?.google?.thought_signature).toBeDefined();
  });

  it("should strip fragmented tags even if they leak into content", async () => {
    // Data from the user's latest report
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"<","role":"assistant"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":"thought>\\nIn `taskManager.test.ts`, there are 5","role":"assistant"},"index":0}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({
      httpClient: mockHttpClient,
      endpoint,
      apiKey,
      model,
      eventBus: mockEventBus,
      maxRetries: 0,
      initialDelay: 0
    });
    
    const response = await provider.queryStream(new TestPrompt([]));

    // Verify content tokens were emitted without tags
    const contentTokens = mockEventBus.emit.mock.calls
        .filter(call => {
            const isTokenEvent = call[0] === 'agent:token';
            const payload = call[1];
            return isTokenEvent && payload && typeof payload === 'object' && 'type' in payload && payload.type === 'content';
        })
        .map(call => {
            const payload = call[1];
            if (payload && typeof payload === 'object' && 'token' in payload && typeof payload.token === 'string') {
                return payload.token;
            }
            return "";
        });
    
    const combinedContent = contentTokens.join('');
    expect(combinedContent).toContain("In `taskManager.test.ts`,"); 
    expect(combinedContent).not.toContain("<thought>");
    expect(combinedContent).not.toContain("<"); 

    expect(response).toHaveLength(1);
    expect(response[0].content).toContain("In `taskManager.test.ts`,");
    expect(response[0].content).not.toContain("<thought>");
  });
});
