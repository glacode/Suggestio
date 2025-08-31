import { Config } from "../config/types.js";
import { extractApiKeyPlaceholders } from "../config/apiKeyPlaceholders.js";

describe("extractApiKeyPlaceholders", () => {
  it("should extract placeholders from providers with ${VARNAME}", () => {
    const config: Config = {
      activeProvider: "openrouter",
      providers: {
        openrouter: {
          endpoint: "https://api.openrouter.ai",
          model: "gpt-4",
          apiKey: "${OPENROUTER_API_KEY}"
        },
        anthropic: {
          endpoint: "https://api.anthropic.com",
          model: "claude-3",
          apiKey: "${ANTHROPIC_API_KEY}"
        }
      },
      anonymizer: {
        enabled: false,
        words: []
      }
    };

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual(["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]);
  });

  it("should ignore hardcoded API keys", () => {
    const config: Config = {
      activeProvider: "hardcoded",
      providers: {
        hardcoded: {
          endpoint: "https://local",
          model: "test",
          apiKey: "fixed-key"
        }
      },
      anonymizer: {
        enabled: false,
        words: []
      }
    };

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual([]);
  });

  it("should return empty array if no providers are present", () => {
    const config: Config = {
      activeProvider: "",
      providers: {},
      anonymizer: {
        enabled: false,
        words: []
      }
    };

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual([]);
  });

  it("should handle duplicate placeholders gracefully", () => {
    const config: Config = {
      activeProvider: "dup",
      providers: {
        a: {
          endpoint: "x",
          model: "y",
          apiKey: "${DUPLICATE_API_KEY}"
        },
        b: {
          endpoint: "x",
          model: "y",
          apiKey: "${DUPLICATE_API_KEY}"
        }
      },
      anonymizer: {
        enabled: false,
        words: []
      }
    };

    const result = extractApiKeyPlaceholders(config);
    expect(result).toEqual(["DUPLICATE_API_KEY"]);
  });
});
