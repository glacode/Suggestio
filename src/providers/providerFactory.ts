import { Config, ProviderConfig, llmProvider, IAnonymizer } from "../types.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import * as vscode from "vscode";

export function getActiveProvider(
  config: Config,
  anonymizer?: IAnonymizer
): llmProvider | null {
  const activeProviderName = config.activeProvider;
  const providerConfig: ProviderConfig | undefined =
    config.providers?.[activeProviderName];

  if (!providerConfig) {
    vscode.window.showErrorMessage(
      `Provider "${activeProviderName}" not found in config.json`
    );
    return null;
  }

  const apiKey = providerConfig.resolvedApiKey ?? providerConfig.apiKey;

  // If type is undefined, treat it as OpenAI-compatible
  if (!providerConfig.type) {
    if (!providerConfig.endpoint) {
      vscode.window.showErrorMessage(
        `Provider "${activeProviderName}" missing endpoint`
      );
      return null;
    }
    return new OpenAICompatibleProvider(
      providerConfig.endpoint,
      apiKey,
      providerConfig.model,
      anonymizer
    );
  }

  // Otherwise switch on type
  switch (providerConfig.type) {
    //TODO remove this case after confirming Gemini usage via OpenAI compatible API works fine
    /** This case should be deprecated, because now even Gemini supports an OpenAi compatible API */
    case "gemini":
      return new GeminiProvider(apiKey, providerConfig.model);

    default:
      vscode.window.showErrorMessage(
        `Unknown provider type: ${providerConfig.type}`
      );
      return null;
  }
}
