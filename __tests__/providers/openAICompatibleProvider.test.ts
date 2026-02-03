import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { ChatHistory, ChatMessage, IAnonymizer, IPrompt } from "../../src/types.js";
import * as http from "http";
import { AddressInfo } from "net";
import { SimpleWordAnonymizer } from "../../src/anonymizer/simpleWordAnonymizer.js";
import { ShannonEntropyCalculator } from "../../src/utils/shannonEntropyCalculator.js";
import { NodeFetchClient } from "../../src/utils/httpClient.js";

const entropyCalculator = new ShannonEntropyCalculator();
const httpClient = new NodeFetchClient();

class TestPrompt implements IPrompt {
  constructor(private messages: ChatMessage[]) {
  }
  generateChatHistory(): ChatHistory {
    return this.messages;
  }
}

describe("OpenAICompatibleProvider", () => {
  let server: http.Server;
  let endpoint: string;
  let lastRequestBody: any;
  let requestHandler: http.RequestListener;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      // Delegate to the specific handler for the test
      requestHandler(req, res);
    });

    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      endpoint = `http://localhost:${address.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    lastRequestBody = null;
    // Default request handler for successful responses
    requestHandler = (_req, res) => {
      let body = "";
      _req.on("data", (chunk) => {
        body += chunk.toString();
      });
      _req.on("end", () => {
        try {
          lastRequestBody = JSON.parse(body);
          if (lastRequestBody.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}');
            res.write('\n\n');
            res.write('data: {"choices":[{"delta":{"content":" World"}}]}');
            res.write('\n\n');
            res.write('data: [DONE]');
            res.write('\n\n');
            res.end();
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                choices: [{ message: { content: "  Hello World  " } }],
              })
            );
          }
        } catch (e) {
          res.writeHead(500);
          res.end("Error parsing body");
        }
      });
    };
  });

  it("should not get a trimmed response from the query method", async () => {
    const provider = new OpenAICompatibleProvider(
      httpClient,
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.query(prompt);
    expect(response).toEqual({ role: "assistant", content: "  Hello World  ", tool_calls: undefined });
  });

  it("should get a streamed response from the queryStream method", async () => {
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const tokens: string[] = [];
    const response = await provider.queryStream(prompt, (token: string) => {
      tokens.push(token);
    });
    expect(tokens).toEqual(["Hello", " World"]);
    expect(response).toEqual({ role: "assistant", content: "Hello World", tool_calls: undefined });
  });

  describe("with anonymizer", () => {
    let anonymizer: IAnonymizer;

    beforeEach(() => {
      anonymizer = new SimpleWordAnonymizer(["secret"], entropyCalculator);
    });

    it("should anonymize user messages before sending", async () => {
      const provider = new OpenAICompatibleProvider(httpClient, 
        endpoint,
        "test-key",
        "test-model",
        anonymizer
      );
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
        { role: "assistant", content: "I will not tell the secret" },
      ]);
      await provider.query(prompt);

      // This is a bit brittle as it depends on the placeholder format.
      // A better test might involve checking if deanonymization of the sent content works.
      const anonymizedContent = lastRequestBody.messages[0].content;
      expect(anonymizedContent).not.toContain("secret");
      expect(anonymizedContent).toContain("ANON_");
    });

    it("should deanonymize the response from query", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              { message: { content: "ok, I will keep the ANON_0 safe" } },
            ],
          })
        );
      };

      const provider = new OpenAICompatibleProvider(httpClient, 
        endpoint,
        "test-key",
        "test-model",
        anonymizer
      );
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
      ]);
      const response = await provider.query(prompt);
      expect(response).toEqual({ role: "assistant", content: "ok, I will keep the secret safe", tool_calls: undefined });
    });

    it("should deanonymize the streamed response from queryStream", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"ok, I will keep the "}}]}');
        res.write('\n\n');
        res.write('data: {"choices":[{"delta":{"content":"ANON_0 safe"}}]}');
        res.write('\n\n');
        res.write('data: [DONE]');
        res.write('\n\n');
        res.end();
      };

      const provider = new OpenAICompatibleProvider(httpClient, 
        endpoint,
        "test-key",
        "test-model",
        anonymizer
      );
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
      ]);
      const tokens: string[] = [];
      await provider.queryStream(prompt, (token: string) => {
        tokens.push(token);
      });
      expect(tokens.join("")).toBe("ok, I will keep the secret safe");
    });

    it("should handle tool calls in queryStream", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"test_tool"}}]}}]}');
        res.write('\n\n');
        res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"arg\\":\\"val\\"}"}}]}}]}');
        res.write('\n\n');
        res.write('data: [DONE]');
        res.write('\n\n');
        res.end();
      };

      const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
      const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
      const response = await provider.queryStream(prompt, () => { });
      expect(response?.tool_calls).toHaveLength(1);
      expect(response?.tool_calls?.[0].function.name).toBe("test_tool");
      expect(response?.tool_calls?.[0].function.arguments).toBe('{"arg":"val"}');
    });

    it("should skip malformed stream chunks", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"ok"}}]}');
        res.write('\n\n');
        res.write('data: { invalid json }');
        res.write('\n\n');
        res.write('data: {"choices":[{"delta":{"content":"!"}}]}');
        res.write('\n\n');
        res.write('data: [DONE]');
        res.write('\n\n');
        res.end();
      };

      const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
      const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
      const tokens: string[] = [];
      const response = await provider.queryStream(prompt, (token) => tokens.push(token));
      expect(tokens.join("")).toBe("ok!");
      expect(response?.content).toBe("ok!");
    });

    it("should handle malformed stream chunks that fail zod validation", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"ok"}}]}');
        res.write('\n\n');
        res.write('data: {"unexpected": "field"}');
        res.write('\n\n');
        res.write('data: {"choices":[{"delta":{"content":"!"}}]}');
        res.write('\n\n');
        res.write('data: [DONE]');
        res.write('\n\n');
        res.end();
      };

      const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
      const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
      const tokens: string[] = [];
      const response = await provider.queryStream(prompt, (token) => tokens.push(token));
      expect(tokens.join("")).toBe("ok!");
      expect(response?.content).toBe("ok!");
    });
  });

  it("should throw an error if response body is null in queryStream", async () => {
    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    // const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    
    // Use type assertion to call private method for testing purpose or mock the whole fetch
    // But since the task is 100% coverage, let's mock the Response object
    const mockResponse = {
      ok: true,
      body: null,
    } as any;
    
    await expect((provider as any).parseStream(mockResponse, () => {}))
      .rejects.toThrow("Response body is null");
  });

  it("should skip tool calls without index", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      // @ts-ignore
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1"}]}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.tool_calls).toBeUndefined();
  });

  it("should handle streaming deanonymization with buffered tokens", async () => {
    const anonymizer = {
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

    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"AN"}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"content":"ON_0"}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model", anonymizer as any);
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const tokens: string[] = [];
    const response = await provider.queryStream(prompt, (token) => tokens.push(token));
    expect(tokens.join("")).toBe("secret");
    expect(response?.content).toBe("secret");
  });

  it("should flush deanonymizer on [DONE]", async () => {
    const anonymizer = {
      anonymize: (text: string) => text.replace("secret", "ANON_0"),
      deanonymize: (text: string) => text.replace("ANON_0", "secret"),
      createStreamingDeanonymizer: () => ({
        process: (chunk: string) => ({ processed: "", buffer: chunk }),
        flush: () => "flushed"
      })
    };

    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"some"}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model", anonymizer as any);
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const tokens: string[] = [];
    const response = await provider.queryStream(prompt, (token) => tokens.push(token));
    expect(tokens).toContain("flushed");
    expect(response?.content).toBe("flushed");
  });

  it("should throw an error for query on API error (object)", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Internal Server Error", code: 500 } }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.query(prompt)).rejects.toThrow("OpenAI API error: Internal Server Error");
  });

  it("should throw an error for query on API error (string)", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.query(prompt)).rejects.toThrow("OpenAI API error: Internal Server Error");
  });

  it("should throw an error for query on invalid JSON", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("not json");
    };
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.query(prompt)).rejects.toThrow("Failed to parse response as JSON");
  });

  it("should throw an error for query on malformed response (missing choices)", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.query(prompt)).rejects.toThrow("Unexpected OpenAI API response: Missing 'choices' field.");
  });

  it("should return null if choice message is missing", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ }] }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.query(prompt);
    expect(response).toBeNull();
  });

  it("should handle incremental tool call updates in queryStream", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"test"}} ]}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1}"}} ]}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1_updated"} ]}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.tool_calls?.[0].id).toBe("call_1_updated");
  });

  it("should handle empty content in handleContentDelta", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"content":""}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.content).toBe("");
  });

  it("should handle chunks with missing data prefix or wrong data", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('some random line\n');
      res.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.content).toBe("ok");
  });

  it("should handle error object without message", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "some_code" } }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.query(prompt)).rejects.toThrow('OpenAI API error: {"code":"some_code"}');
  });

  it("should handle non-user messages and tool_call_id in prepareMessages", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    };
    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([
      { role: "system", content: "You are a bot" },
      { role: "tool", content: "result", tool_call_id: "123" }
    ]);
    const response = await provider.query(prompt);
    expect(response?.content).toBe("ok");
  });

  it("should handle chunk ending with newline in processChunk", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n');
      res.write('\n');
      res.write('data: [DONE]\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.content).toBe("ok");
  });

  it("should handle multiple tool call updates for the same index", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"tool"}}]}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1"}} ]}}]}');
      res.write('\n\n');
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"b\\":2}"}} ]}}]}');
      res.write('\n\n');
      res.write('data: [DONE]');
      res.write('\n\n');
      res.end();
    };

    const provider = new OpenAICompatibleProvider(httpClient, endpoint, "test-key", "test-model");
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.queryStream(prompt, () => { });
    expect(response?.tool_calls?.[0].function.arguments).toBe('{"a":1,"b":2}');
  });

  it("should throw an error for queryStream on API error", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500);
      res.end("Internal Server Error");
    };
    const provider = new OpenAICompatibleProvider(httpClient, 
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.queryStream(prompt, (token: string) => { token; })).rejects.toThrow(
      "OpenAI API error: 500 - Internal Server Error"
    );
  });
});
