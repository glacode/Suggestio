import { IConfig } from "../types.js";

/**
 * Scans all providers in the config and collects API key placeholders.
 * A placeholder is defined as a string in the form "${VARNAME}".
 * 
 * Example:
 *   "apiKey": "${OPENROUTER_API_KEY}" → yields "OPENROUTER_API_KEY"
 *
 * Returns an array of unique placeholder names for use in secret management commands.
 */
export function extractApiKeyPlaceholders(config: IConfig): string[] {
  const placeholders = new Set<string>();

  for (const providerKey of Object.keys(config.providers)) {
    const apiKeyValue = config.providers[providerKey].apiKey;

    const match = typeof apiKeyValue === "string"
      ? apiKeyValue.match(/^\$\{(\w+)\}$/)
      : null;

    if (match) {
      placeholders.add(match[1]);
    }
  }

  return Array.from(placeholders);
}