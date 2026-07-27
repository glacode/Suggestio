import { IConfig } from "../types.js";

/**
 * Scans all profiles in the config and collects the API key identifiers
 * declared in profiles that require an API key.
 *
 * Returns an array of unique identifier names for use in secret management commands.
 */
export function extractApiKeyIdentifiers(config: IConfig): string[] {
  const apiKeyIdentifiers = new Set<string>();

  for (const profileKey of Object.keys(config.profiles)) {
    const profile = config.profiles[profileKey];
    
    if (profile.isApiKeyRequired !== false && profile.apiKeyIdentifier) {
      apiKeyIdentifiers.add(profile.apiKeyIdentifier);
    }
  }

  return Array.from(apiKeyIdentifiers);
}