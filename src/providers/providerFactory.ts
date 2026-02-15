import { Config, IProviderConfig, ILlmProvider, IAnonymizer, IHttpClient, IEventBus } from "../types.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import * as vscode from "vscode";
import { PROVIDER_MESSAGES } from "../constants/messages.js";

export function getActiveProvider(
  config: Config,
  httpClient: IHttpClient,
  eventBus: IEventBus,
  anonymizer?: IAnonymizer
): ILlmProvider | null {
  const activeProviderName = config.activeProvider;
  const providerConfig: IProviderConfig | undefined =
    config.providers?.[activeProviderName];

  if (!providerConfig) {
    vscode.window.showErrorMessage(
      PROVIDER_MESSAGES.NOT_FOUND(activeProviderName)
    );
    return null;
  }

  const apiKey = providerConfig.resolvedApiKey ?? providerConfig.apiKey;

  // If type is undefined, treat it as OpenAI-compatible
  if (!providerConfig.type) {
    if (!providerConfig.endpoint) {
      vscode.window.showErrorMessage(
        PROVIDER_MESSAGES.MISSING_ENDPOINT(activeProviderName)
      );
      return null;
    }
    return new OpenAICompatibleProvider({
      httpClient,
      endpoint: providerConfig.endpoint,
      apiKey,
      model: providerConfig.model,
      eventBus,
      anonymizer,
    });
  }

  // Otherwise switch on type
  switch (providerConfig.type) {
    //TODO remove this case after confirming Gemini usage via OpenAI compatible API works fine
    /** This case should be deprecated, because now even Gemini supports an OpenAi compatible API */
    case "gemini":
      return new GeminiProvider(apiKey, eventBus, providerConfig.model);

    default:
      vscode.window.showErrorMessage(
        PROVIDER_MESSAGES.UNKNOWN_TYPE(providerConfig.type)
      );
      return null;
  }
}
