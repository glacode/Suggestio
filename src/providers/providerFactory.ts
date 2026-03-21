import { IConfig, IProfileConfig, ILlmProvider, IAnonymizer, IHttpClient, IEventBus } from "../types.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import * as vscode from "vscode";
import { PROVIDER_MESSAGES } from "../constants/messages.js";

export function getLlmProvider(
  config: IConfig,
  httpClient: IHttpClient,
  eventBus: IEventBus,
  anonymizer?: IAnonymizer,
  profileId?: string
): ILlmProvider | null {
  const targetProfileId = profileId ?? config.activeChatProfile;
  const profileConfig: IProfileConfig | undefined =
    config.profiles?.[targetProfileId];

  if (!profileConfig) {
    vscode.window.showErrorMessage(
      PROVIDER_MESSAGES.NOT_FOUND(targetProfileId)
    );
    return null;
  }

  const apiKey = profileConfig.resolvedApiKey ?? profileConfig.apiKey;

  // If type is undefined, treat it as OpenAI-compatible
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
    });
  }

  // Otherwise switch on type
  switch (profileConfig.type) {
    //TODO remove this case after confirming Gemini usage via OpenAI compatible API works fine
    /** This case should be deprecated, because now even Gemini supports an OpenAi compatible API */
    case "gemini":
      return new GeminiProvider(apiKey, eventBus, profileConfig.model);

    default:
      vscode.window.showErrorMessage(
        PROVIDER_MESSAGES.UNKNOWN_TYPE(profileConfig.type)
      );
      return null;
  }
}
