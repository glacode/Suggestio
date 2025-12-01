import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { Prompt } from "../../src/promptBuilder/prompt.js";
import { ChatHistory } from "../../src/chat/types.js";
import * as http from "http";
import { AddressInfo } from "net";
import { Anonymizer } from "../../src/anonymizer/anonymizer.js";
import { SimpleWordAnonymizer } from "../../src/anonymizer/simpleWordAnonymizer.js";
import { ChatMessage } from "../../src/chat/types.js";

class TestPrompt implements Prompt {
  constructor(private messages: ChatMessage[]) {
  }
  generate(): ChatHistory {
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
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.query(prompt);
    expect(response).toBe("  Hello World  ");
  });

  it("should get a streamed response from the queryStream method", async () => {
    const provider = new OpenAICompatibleProvider(
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const tokens: string[] = [];
    await provider.queryStream(prompt, (token: string) => {
      tokens.push(token);
    });
    expect(tokens).toEqual(["Hello", " World"]);
  });

  describe("with anonymizer", () => {
    let anonymizer: Anonymizer;

    beforeEach(() => {
      anonymizer = new SimpleWordAnonymizer(["secret"]);
    });

    it("should anonymize user messages before sending", async () => {
      const provider = new OpenAICompatibleProvider(
        endpoint,
        "test-key",
        "test-model",
        anonymizer
      );
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
        { role: "model", content: "I will not tell the secret" },
      ]);
      await provider.query(prompt);

      // This is a bit brittle as it depends on the placeholder format.
      // A better test might involve checking if deanonymization of the sent content works.
      const anonymizedContent = lastRequestBody.messages[1].content;
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

      const provider = new OpenAICompatibleProvider(
        endpoint,
        "test-key",
        "test-model",
        anonymizer
      );
      const prompt = new TestPrompt([
        { role: "user", content: "this is a secret" },
      ]);
      const response = await provider.query(prompt);
      expect(response).toBe("ok, I will keep the secret safe");
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

      const provider = new OpenAICompatibleProvider(
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
  });

  it("should return null for query on API error", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    };
    const provider = new OpenAICompatibleProvider(
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    const response = await provider.query(prompt);
    expect(response).toBeNull();
  });

  it("should throw an error for queryStream on API error", async () => {
    requestHandler = (_req, res) => {
      res.writeHead(500);
      res.end("Internal Server Error");
    };
    const provider = new OpenAICompatibleProvider(
      endpoint,
      "test-key",
      "test-model"
    );
    const prompt = new TestPrompt([{ role: "user", content: "Hi" }]);
    await expect(provider.queryStream(prompt, (token: string) => {token;})).rejects.toThrow(
      "OpenAI API error: 500 - Internal Server Error"
    );
  });
});
