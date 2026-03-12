import { jest } from "@jest/globals";
import * as vscode from "vscode";
import { PROVIDER_MESSAGES } from "../../src/constants/messages.js";
import { createMockEventBus, createDefaultConfig } from "../testUtils.js";

// Mock providers BEFORE importing getActiveProvider
const mockOpenAICompatibleProvider = jest.fn();
const mockGeminiProvider = jest.fn();

jest.unstable_mockModule("../../src/providers/openAICompatibleProvider.js", () => ({
    OpenAICompatibleProvider: mockOpenAICompatibleProvider,
}));

jest.unstable_mockModule("../../src/providers/geminiProvider.js", () => ({
    GeminiProvider: mockGeminiProvider,
}));

// Now import the module under test
const { getActiveProvider } = await import("../../src/providers/providerFactory.js");
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
        activeProvider: "non-existent",
        providers: {}
    });
    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getActiveProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.NOT_FOUND("non-existent"));
  });

  it("should return OpenAICompatibleProvider if type is undefined and endpoint is present", () => {
    const config = createDefaultConfig({
        activeProvider: "openai",
        providers: {
            openai: {
                endpoint: "http://api.openai.com",
                apiKey: "test-key",
                model: "gpt-4"
            }
        }
    });

    const provider = getActiveProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeDefined();
    expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: "http://api.openai.com",
        apiKey: "test-key",
        model: "gpt-4",
    }));
  });

  it("should prefer resolvedApiKey over apiKey", () => {
      const config = createDefaultConfig({
          activeProvider: "openai",
          providers: {
              openai: {
                  endpoint: "http://api.openai.com",
                  apiKey: "old-key",
                  resolvedApiKey: "resolved-key",
                  model: "gpt-4"
              }
          }
      });

      getActiveProvider(config, mockHttpClient, mockEventBus);

      expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
          apiKey: "resolved-key",
      }));
  });

  it("should return null and show error if OpenAI provider is missing endpoint", () => {
    const config = createDefaultConfig({
        activeProvider: "openai",
        providers: {
            openai: {
                apiKey: "test-key",
                model: "gpt-4"
            }
        }
    });
    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getActiveProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.MISSING_ENDPOINT("openai"));
  });

  it("should pass anonymizer to OpenAICompatibleProvider", () => {
    const config = createDefaultConfig({
        activeProvider: "openai",
        providers: {
            openai: {
                endpoint: "http://api.openai.com",
                apiKey: "test-key",
                model: "gpt-4"
            }
        }
    });

    getActiveProvider(config, mockHttpClient, mockEventBus, mockAnonymizer);

    expect(OpenAICompatibleProvider).toHaveBeenCalledWith(expect.objectContaining({
        anonymizer: mockAnonymizer,
    }));
  });

  it("should return GeminiProvider if type is 'gemini'", () => {
    const config = createDefaultConfig({
        activeProvider: "gemini",
        providers: {
            gemini: {
                type: "gemini",
                apiKey: "gemini-key",
                model: "gemini-pro"
            }
        }
    });

    const provider = getActiveProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeDefined();
    expect(GeminiProvider).toHaveBeenCalledWith("gemini-key", mockEventBus, "gemini-pro");
  });

  it("should return null and show error if type is unknown", () => {
    // Force an unknown type by manipulating the config object without type assertion
    const config = createDefaultConfig({
        activeProvider: "unknown",
        providers: {
            unknown: {
                endpoint: "http://endpoint.com",
                apiKey: "test-key",
                model: "test-model"
            }
        }
    });
    
    const providerConfig = config.providers!["unknown"];
    // Set type to something invalid
    Object.defineProperty(providerConfig, 'type', { value: 'invalid' });

    const showErrorMessageSpy = jest.spyOn(vscode.window, "showErrorMessage");

    const provider = getActiveProvider(config, mockHttpClient, mockEventBus);

    expect(provider).toBeNull();
    expect(showErrorMessageSpy).toHaveBeenCalledWith(PROVIDER_MESSAGES.UNKNOWN_TYPE("invalid"));
  });
});
