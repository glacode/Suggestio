import { jest } from "@jest/globals";
import * as vscode from "vscode";
import { PROVIDER_MESSAGES } from "../../src/constants/messages.js";
import { createMockEventBus, createDefaultConfig } from "../testUtils.js";

// Mock profiles BEFORE importing getLlmProvider
const mockOpenAICompatibleProvider = jest.fn();
const mockGeminiProvider = jest.fn();

jest.unstable_mockModule("../../src/providers/openAICompatibleProvider.js", () => ({
    OpenAICompatibleProvider: mockOpenAICompatibleProvider,
}));

jest.unstable_mockModule("../../src/providers/geminiProvider.js", () => ({
    GeminiProvider: mockGeminiProvider,
}));

// Now import the module under test
const { getLlmProvider } = await import("../../src/providers/providerFactory.js");
const { OpenAICompatibleProvider } = await import("../../src/providers/openAICompatibleProvider.js");
const { GeminiProvider } = await import("../../src/providers/geminiProvider.js");

describe("providerFactory", () => {
  let mockHttpClient: any;
  let mockEventBus: any;
  let mockAnonymizer: any;

  beforeEach(() => {
    mockHttpClient = { post: jest.fn() };
    mockEventBus = createMockEventBus();
    mockAnonymizer = {
        anonymize: jest.fn(),
        deanonymize: jest.fn(),
        createStreamingDeanonymizer: jest.fn()
    };
    jest.clearAllMocks();
  });

  it("should return null and show error if provider config is missing", () => {
    const config = createDefaultConfig({
        activeChatProfile: "non-existent",
        profiles: {}
    });
    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getLlmProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.NOT_FOUND("non-existent"));
  });

  it("should return OpenAICompatibleProvider if type is undefined and endpoint is present", () => {
    const config = createDefaultConfig({
        activeChatProfile: "openai",
        profiles: {
            openai: {
                endpoint: "http://api.openai.com",
                apiKeyIdentifier: "test-identifier",
                resolvedApiKey: "test-key",
                model: "gpt-4"
            }
        }
    });

    const provider = getLlmProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeDefined();
    expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: "http://api.openai.com",
        apiKey: "test-key",
        model: "gpt-4",
        maxRetries: config.maxRetries,
        initialDelay: config.initialDelay,
    }));
  });

  it("should use empty string if resolvedApiKey is missing", () => {
      const config = createDefaultConfig({
          activeChatProfile: "openai",
          profiles: {
              openai: {
                  endpoint: "http://api.openai.com",
                  apiKeyIdentifier: "old-key",
                  model: "gpt-4"
              }
          }
      });

      getLlmProvider(config, mockHttpClient, mockEventBus);

      expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
          apiKey: "",
      }));
  });

  it("should return null and show error if OpenAI provider is missing endpoint", () => {
    const config = createDefaultConfig({
        activeChatProfile: "openai",
        profiles: {
            openai: {
                apiKeyIdentifier: "test-key",
                resolvedApiKey: "resolved-key",
                model: "gpt-4"
            }
        }
    });
    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getLlmProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.MISSING_ENDPOINT("openai"));
  });

  it("should pass anonymizer to OpenAICompatibleProvider", () => {
    const config = createDefaultConfig({
        activeChatProfile: "openai",
        profiles: {
            openai: {
                endpoint: "http://api.openai.com",
                apiKeyIdentifier: "test-key",
                resolvedApiKey: "resolved-key",
                model: "gpt-4"
            }
        }
    });

    getLlmProvider(config, mockHttpClient, mockEventBus, mockAnonymizer);

    expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
        anonymizer: mockAnonymizer,
        maxRetries: config.maxRetries,
        initialDelay: config.initialDelay,
    }));
  });

  it("should return GeminiProvider if type is 'gemini'", () => {
    const config = createDefaultConfig({
        activeChatProfile: "gemini",
        profiles: {
            gemini: {
                type: "gemini",
                apiKeyIdentifier: "gemini-identifier",
                resolvedApiKey: "gemini-key",
                model: "gemini-pro"
            }
        }
    });

    const provider = getLlmProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeDefined();
    expect(GeminiProvider).toHaveBeenCalledWith("gemini-key", mockEventBus, "gemini-pro");
  });

  it("should return null and show error if type is unknown", () => {
    // Force an unknown type by manipulating the config object without type assertion
    const config = createDefaultConfig({
        activeChatProfile: "unknown",
        profiles: {
            unknown: {
                endpoint: "http://endpoint.com",
                apiKeyIdentifier: "test-key",
                resolvedApiKey: "resolved-key",
                model: "test-model"
            }
        }
    });
    
    const providerConfig = config.profiles!["unknown"];
    // Set type to something invalid
    Object.defineProperty(providerConfig, 'type', { value: 'invalid' });

    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getLlmProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.UNKNOWN_TYPE("invalid"));
  });
});
