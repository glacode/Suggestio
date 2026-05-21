import { describe, it, expect } from '@jest/globals';
import { IConfig } from "../../src/types.js";
import { extractApiKeyPlaceholders } from "../../src/config/apiKeyPlaceholders.js";
import { createDefaultConfig } from "../testUtils.js";

describe("extractApiKeyPlaceholders", () => {
  it("should extract identifiers from profiles with apiKeyIdentifier", () => {
    const config: IConfig = createDefaultConfig({
      activeChatProfile: "openrouter",
      profiles: {
        openrouter: {
          endpoint: "https://api.openrouter.ai",
          model: "gpt-4",
          apiKeyIdentifier: "OPENROUTER_API_KEY"
        },
        anthropic: {
          endpoint: "https://api.anthropic.com",
          model: "claude-3",
          apiKeyIdentifier: "ANTHROPIC_API_KEY"
        }
      }
    });

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual(["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]);
  });

  it("should return empty array if no apiKeyIdentifier is present", () => {
    const config: IConfig = createDefaultConfig({
      activeChatProfile: "no-key",
      profiles: {
        "no-key": {
          endpoint: "https://local",
          model: "test",
          isApiKeyRequired: false
        }
      }
    });

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual([]);
  });

  it("should return empty array if no profiles are present", () => {
    const config: IConfig = createDefaultConfig({
      activeChatProfile: "",
      profiles: {}
    });

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual([]);
  });

  it("should handle duplicate identifiers gracefully", () => {
    const config: IConfig = createDefaultConfig({
      activeChatProfile: "dup",
      profiles: {
        a: {
          endpoint: "x",
          model: "y",
          apiKeyIdentifier: "DUPLICATE_API_KEY"
        },
        b: {
          endpoint: "x",
          model: "y",
          apiKeyIdentifier: "DUPLICATE_API_KEY"
        }
      }
    });

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual(["DUPLICATE_API_KEY"]);
  });
});
