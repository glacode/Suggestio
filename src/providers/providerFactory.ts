import { IConfig, IProfileConfig, ILlmProvider, IAnonymizer, IHttpClient, IEventBus } from "../types.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import * as vscode from "vscode";
import { PROVIDER_MESSAGES } from "../constants/messages.js";

/**
 * Factory function to create and initialize an LLM provider instance based on the application configuration.
 * 
 * This function handles the logic of looking up a specific profile configuration, resolving its API keys,
 * and instantiating the appropriate concrete provider class (e.g., OpenAICompatibleProvider or GeminiProvider).
 *
 * @param config - The global application configuration object.
 * @param httpClient - An instance of IHttpClient for making network requests.
 * @param eventBus - The global event bus for internal communication and logging.
 * @param anonymizer - (Optional) An instance of IAnonymizer to handle PII protection.
 * @param profileId - (Optional) The unique identifier of the profile to instantiate. 
 *                    If omitted, defaults to the `activeChatProfile` defined in the config.
 * @returns A fully initialized ILlmProvider instance, or `null` if the configuration is invalid.
 */
export function getLlmProvider(
  config: IConfig,
  httpClient: IHttpClient,
  eventBus: IEventBus,
  anonymizer?: IAnonymizer,
  profileId?: string
): ILlmProvider | null {
  // 1. Determine which profile ID to use (requested or default chat profile)
  const targetProfileId = profileId ?? config.activeChatProfile;
  
  // 2. Look up the specific profile configuration
  const profileConfig: IProfileConfig | undefined =
    config.profiles?.[targetProfileId];

  // 3. Handle missing configuration errors
  if (!profileConfig) {
    vscode.window.showErrorMessage(
      PROVIDER_MESSAGES.NOT_FOUND(targetProfileId)
    );
    return null;
  }

  // 4. Determine the API key (prefer runtime-resolved keys from SecretStorage over literal values)
  const apiKey = profileConfig.resolvedApiKey ?? profileConfig.apiKey;

  // 5. Instantiate the provider based on the configured 'type'
  //    If 'type' is missing, we default to OpenAI-compatible logic.
  if (!profileConfig.type) {
    if (!profileConfig.endpoint) {
      vscode.window.showErrorMessage(
        PROVIDER_MESSAGES.MISSING_ENDPOINT(targetProfileId)
      );
      return null;
    }
    
    return new OpenAICompatibleProvider({
      httpClient,
      endpoint: profileConfig.endpoint,
      apiKey,
      model: profileConfig.model,
      eventBus,
      anonymizer,
      maxRetries: config.maxRetries,
      initialDelay: config.initialDelay,
    });
  }

  // 6. Handle explicit provider types
  switch (profileConfig.type) {
    /** 
     * Native Gemini Provider
     * Note: Gemini also supports an OpenAI-compatible API, which is preferred 
     * for most use cases due to standardized tooling.
     */
    case "gemini":
      return new GeminiProvider(apiKey, eventBus, profileConfig.model);

    default:
      // Report unsupported profile types defined in config.json
      vscode.window.showErrorMessage(
        PROVIDER_MESSAGES.UNKNOWN_TYPE(profileConfig.type)
      );
      return null;
  }
}
