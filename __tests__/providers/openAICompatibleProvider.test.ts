import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { ChatHistory, IChatMessage, IAnonymizer, IPrompt, IHttpClient, IHttpResponse, ToolDefinition, IEventBus } from "../../src/types.js";
import { SimpleWordAnonymizer } from "../../src/anonymizer/simpleWordAnonymizer.js";
import { ShannonEntropyCalculator } from "../../src/utils/shannonEntropyCalculator.js";
import { jest } from "@jest/globals";
import { createMockEventBus } from "../testUtils.js";

const entropyCalculator = new ShannonEntropyCalculator();

class TestPrompt implements IPrompt {
  constructor(private messages: IChatMessage[]) { }
  generateChatHistory(): ChatHistory { return this.messages; }
}

function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: any;
  text?: string;
  body?: AsyncIterable<any> | null;
  shouldThrowJson?: boolean;
}): IHttpResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    json: async () => {
      if (options.shouldThrowJson) {
        throw new Error("JSON parse error");
      }
      return options.json;
    },
    text: async () => options.text ?? JSON.stringify(options.json),
    body: options.body ?? null,
  };
}

async function* createStream(chunks: string[]): AsyncIterable<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("OpenAICompatibleProvider (Mocked)", () => {
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockEventBus: jest.Mocked<IEventBus>;
  const endpoint = "http://example.com";
  const apiKey = "test-key";
  const model = "test-model";

  beforeEach(() => {
    mockHttpClient = {
      post: jest.fn<any>(),
    };
    mockEventBus = createMockEventBus();
  });

  it("should not get a trimmed response from the query method", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { choices: [{ message: { content: "  Hello World  " } }] }
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.query(prompt);

    expect(response).toEqual({ role: "assistant", content: "  Hello World  ", tool_calls: undefined, reasoning: undefined });
    expect(mockHttpClient.post).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${apiKey}` })
    }));
  });

  it("should get a streamed response from the queryStream method", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt);

    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "Hello", type: "content" });
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: " World", type: "content" });
    expect(response).toEqual({ role: "assistant", content: "Hello World", tool_calls: undefined, reasoning: undefined });
  });

  it("should handle tools in query", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { choices: [{ message: { content: "ok" } }] }
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const tools: ToolDefinition[] = [{ name: "test_tool", description: "test", parameters: { type: "object", properties: {} } }];
    await provider.query(prompt, tools);

    const callArgs = mockHttpClient.post.mock.calls[0][1];
    if (!callArgs) { throw new Error("post not called"); }
    const body = JSON.parse(callArgs.body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe("test_tool");
  });

  describe("with anonymizer", () => {
    let anonymizer: IAnonymizer;

    beforeEach(() => {
      anonymizer = new SimpleWordAnonymizer({ wordsToAnonymize: ["secret"], entropyCalculator });
    });

    it("should anonymize user messages before sending", async () => {
      mockHttpClient.post.mockResolvedValue(createMockResponse({
        json: { choices: [{ message: { content: "ok" } }] }
      }));

      const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
      ]);
      await provider.query(prompt);

      const callArgs = mockHttpClient.post.mock.calls[0][1];
      if (!callArgs) { throw new Error("post not called"); }
      const body = JSON.parse(callArgs.body);
      expect(body.messages[0].content).not.toContain("secret");
      expect(body.messages[0].content).toContain("ANON_");
    });

    it("should deanonymize the response from query", async () => {
      mockHttpClient.post.mockResolvedValue(createMockResponse({
        json: { choices: [{ message: { content: "ok, I will keep the ANON_0 safe" } }] }
      }));

      const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
      const prompt = new TestPrompt([{ role: "user", content: "this is a secret" }]);
      const response = await provider.query(prompt);
      expect(response?.content).toBe("ok, I will keep the secret safe");
    });

    it("should deanonymize the streamed response from queryStream", async () => {
      mockHttpClient.post.mockResolvedValue(createMockResponse({
        body: createStream([
          'data: {"choices":[{"delta":{"content":"ok, I will keep the "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"ANON_0 safe"}}]}\n\n',
          'data: [DONE]\n\n'
        ])
      }));

      const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
      const prompt = new TestPrompt([{ role: "user", content: "this is a secret" }]);
      await provider.queryStream(prompt);
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "ok, I will keep the ", type: "content" });
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "secret safe", type: "content" });
    });
  });

  it("should handle tool calls in queryStream", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"test_tool"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"arg\\":\\"val\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt);
    expect(response?.tool_calls).toHaveLength(1);
    expect(response?.tool_calls?.[0].function.name).toBe("test_tool");
    expect(response?.tool_calls?.[0].function.arguments).toBe('{"arg":"val"}');
  });

  it("should skip malformed stream chunks", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: { invalid json }\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "ok", type: "content" });
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "!", type: "content" });
  });

  it("should handle malformed stream chunks that fail zod validation (choices not an array)", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices": "not-an-array"}\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "ok", type: "content" });
  });

  it("should handle chunks with missing delta", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"something":"else"}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "ok", type: "content" });
  });

  it("should throw an error if response body is null in queryStream", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({ body: null }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.queryStream(new TestPrompt([])))
      .rejects.toThrow("Response body is null");
  });

  it("should skip tool calls without index", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1"}]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.tool_calls).toBeUndefined();
  });

  it("should reset tool call when a new ID arrives for the same index", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"list_files","arguments":"{\\"directory\\":\\"A\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_2","function":{"name":"list_files","arguments":"{\\"directory\\":\\"B\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    
    // It should have the content of the LAST tool call for that index, not merged
    expect(response?.tool_calls).toHaveLength(1);
    expect(response?.tool_calls?.[0].id).toBe("call_2");
    expect(response?.tool_calls?.[0].function.name).toBe("list_files");
    expect(response?.tool_calls?.[0].function.arguments).toBe('{"directory":"B"}');
  });

  it("should handle streaming deanonymization with buffered tokens", async () => {
    const anonymizer: IAnonymizer = {
      anonymize: (text: string) => text.replace("secret", "ANON_0"),
      deanonymize: (text: string) => text.replace("ANON_0", "secret"),
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => {
          if (chunk === "AN") { return { processed: "", buffer: "AN" }; }
          if (chunk === "ON_0") { return { processed: "secret", buffer: "" }; }
          return { processed: chunk, buffer: "" };
        },
        flush: () => ""
      })
    };

    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"AN"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ON_0"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "secret", type: "content" });
  });

  it("should flush deanonymizer on [DONE]", async () => {
    const anonymizer: IAnonymizer = {
      anonymize: jest.fn<any>(),
      deanonymize: jest.fn<any>(),
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => ({ processed: "", buffer: chunk }),
        flush: () => "flushed"
      })
    };

    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"some"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "flushed", type: "content" });
  });

  it("should handle deanonymizer flush returning empty", async () => {
    const anonymizer: IAnonymizer = {
      anonymize: jest.fn<any>(),
      deanonymize: jest.fn<any>(),
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => ({ processed: chunk, buffer: "" }),
        flush: () => ""
      })
    };

    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, anonymizer, eventBus: mockEventBus });
    await provider.queryStream(new TestPrompt([]));
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "ok", type: "content" });
  });

  it("should throw an error for query on API error (object)", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      status: 500,
      json: { error: { message: "Internal Server Error", code: 500 } }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow("OpenAI API error: Internal Server Error");
  });

  it("should throw an error for query on API error (string)", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      status: 500,
      json: { error: "Internal Server Error" }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow("OpenAI API error: Internal Server Error");
  });

  it("should throw an error for query on invalid JSON", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      shouldThrowJson: true,
      status: 200,
      statusText: "OK"
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow("Failed to parse response as JSON: 200 OK");
  });

  it("should throw an error for query on malformed response (missing choices)", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow("Unexpected OpenAI API response: Missing 'choices' field.");
  });

  it("should throw an error for query on response that fails zod validation", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { choices: [{ message: { content: 123 } }] } // content should be string
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow("Malformed OpenAI API response");
  });

  it("should return null if choice message is missing", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { choices: [{ }] }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.query(new TestPrompt([]));
    expect(response).toBeNull();
  });

  it("should handle incremental tool call updates in queryStream", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"test"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1_updated"}]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.tool_calls?.[0].id).toBe("call_1_updated");
  });

  it("should handle multiple tool call updates for the same index", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"tool"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1"}} ]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"b\\":2}"}} ]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.tool_calls?.[0].function.arguments).toBe('{"a":1,"b":2}');
  });

  it("should handle empty content in handleContentDelta", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":""}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.content).toBe("");
  });

  it("should throw an error for queryStream on API error", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      ok: false,
      status: 500,
      text: "Internal Server Error"
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.queryStream(new TestPrompt([]))).rejects.toThrow("OpenAI API error: 500 - Internal Server Error");
  });

  it("should finish parseStream even if [DONE] is missing", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.content).toBe("ok");
  });

  it("should handle non-user messages and tool_call_id in prepareMessages", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      json: { choices: [{ message: { content: "ok" } }] }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const prompt = new TestPrompt([
      { role: "system", content: "You are a bot" },
      { role: "tool", content: "result", tool_call_id: "123" }
    ]);
    await provider.query(prompt);
    
    const callArgs = mockHttpClient.post.mock.calls[0][1];
    if (!callArgs) { throw new Error("post not called"); }
    const body = JSON.parse(callArgs.body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].tool_call_id).toBe("123");
  });

  it("should handle chunk ending with newline in processChunk", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
        '\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.content).toBe("ok");
  });
  
  it("should skip chunks with wrong data prefix", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'some random line\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.content).toBe("ok");
  });

  it("should handle error object without message or code", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      status: 500,
      json: { error: {} }
    }));
    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    await expect(provider.query(new TestPrompt([]))).rejects.toThrow('OpenAI API error: {}');
  });

  it("should handle tool calls with missing function name or arguments", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{}}]}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));
    expect(response?.tool_calls?.[0].function.name).toBe("");
    expect(response?.tool_calls?.[0].function.arguments).toBe("");
  });

  it("should handle reasoning tokens in queryStream", async () => {
    mockHttpClient.post.mockResolvedValue(createMockResponse({
      body: createStream([
        'data: {"choices":[{"delta":{"reasoning":"I am thinking"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    }));

    const provider = new OpenAICompatibleProvider({ httpClient: mockHttpClient, endpoint, apiKey, model, eventBus: mockEventBus });
    const response = await provider.queryStream(new TestPrompt([]));

    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "I am thinking", type: "reasoning" });
    expect(mockEventBus.emit).toHaveBeenCalledWith('agent:token', { token: "Hello", type: "content" });
    expect(response?.reasoning).toBe("I am thinking");
    expect(response?.content).toBe("Hello");
  });
});