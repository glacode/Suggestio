import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { IHttpClient, IHttpResponse, IEventBus, IPrompt } from "../../src/types.js";
import { createMockHttpClient, createMockEventBus } from "../testUtils.js";

describe("OpenAICompatibleProvider Retry", () => {
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockEventBus: jest.Mocked<IEventBus>;
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    mockEventBus = createMockEventBus();

    provider = new OpenAICompatibleProvider({
      httpClient: mockHttpClient,
      endpoint: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4",
      eventBus: mockEventBus,
      maxRetries: 2,
      initialDelay: 1, // Fast tests
    });
  });

  it("should retry on 500 error and eventually succeed", async () => {
    const mockResponseFail: IHttpResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Error",
      json: async () => ({ error: "Error" }),
      body: null,
    };
    const mockResponseSuccess: IHttpResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ choices: [{ message: { content: "Hello" } }] }),
      json: async () => ({ choices: [{ message: { content: "Hello" } }] }),
      body: null,
    };

    mockHttpClient.post
      .mockResolvedValueOnce(mockResponseFail)
      .mockResolvedValueOnce(mockResponseSuccess);

    const mockPrompt: IPrompt = {
      generateChatHistory: () => [],
    };

    const result = await provider.query(mockPrompt);

    expect(result?.content).toBe("Hello");
    expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    expect(mockEventBus.emit).toHaveBeenCalledWith("agent:notification", expect.objectContaining({
      text: expect.stringMatching(/Error: OpenAI API error: 500 - Error\n\nRetrying \(attempt 1 of 2\)/)
    }));
    expect(mockEventBus.emit).toHaveBeenLastCalledWith("agent:notification", { text: null });
  });

  it("should not retry on 401 error", async () => {
    const mockResponseFail: IHttpResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Unauthorized",
      json: async () => ({ error: "Unauthorized" }),
      body: null,
    };

    mockHttpClient.post.mockResolvedValue(mockResponseFail);

    const mockPrompt: IPrompt = {
      generateChatHistory: () => [],
    };

    await expect(provider.query(mockPrompt)).rejects.toThrow("OpenAI API error: 401");
    expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
  });

  it("should not retry if aborted", async () => {
    const mockResponseFail: IHttpResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Error",
      json: async () => ({ error: "Error" }),
      body: null,
    };

    // Make the post take some time so we can abort it
    mockHttpClient.post.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return mockResponseFail;
    });

    const controller = new AbortController();
    const mockPrompt: IPrompt = {
      generateChatHistory: () => [],
    };

    // Abort after a small delay (during the first call)
    setTimeout(() => controller.abort(), 20);

    const promise = provider.query(mockPrompt, undefined, controller.signal);

    await expect(promise).rejects.toThrow();
    // Should have tried only once (the first call which was aborted)
    expect(mockHttpClient.post.mock.calls.length).toBe(1);
    expect(mockEventBus.emit).not.toHaveBeenCalledWith("agent:notification", expect.objectContaining({
      text: expect.stringContaining("Retrying")
    }));
  });
});
