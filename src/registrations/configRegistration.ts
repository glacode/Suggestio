import { IConfigContainer, IConfigProvider, IDisposable, IEventBus, IHttpClient } from '../types.js';
import { defaultLogger, parseLogLevel } from '../log/logger.js';
import { CONFIG_LOGS } from '../constants/messages.js';
import { CONFIG_DEFAULTS } from '../constants/config.js';
import { configProcessor, ISecretManager } from '../config/configProcessor.js';

/**
 * Registers a listener for configuration changes.
 * When the user updates 'suggestio' settings, this will update the shared config object
 * and the global logger live.
 */
export function registerConfigHandler(
  subscriptions: { push(disposable: IDisposable): void },
  configProvider: IConfigProvider,
  configContainer: IConfigContainer,
  eventBus: IEventBus,
  secretManager: ISecretManager,
  httpClient: IHttpClient
) {
  subscriptions.push(
    configProvider.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('suggestio')) {
        const newLogLevel = configProvider.getLogLevel();
        const newMaxAgentIterations = configProvider.getMaxAgentIterations();
        const newAnonymizerEnabled = configProvider.getAnonymizerEnabled();
        const newAnonymizerWords = configProvider.getAnonymizerWords();
        const newAnonymizerEntropy = configProvider.getAnonymizerEntropy();
        const newAnonymizerMinLength = configProvider.getAnonymizerMinLength();
        const newInlineCompletionEnabled = configProvider.getInlineCompletionEnabled();
        const newInlineCompletionSupportedLanguages = configProvider.getInlineCompletionSupportedLanguages();
        const newInlineCompletionEnableInUntitledEditors = configProvider.getInlineCompletionEnableInUntitledEditors();
        const newMaxRetries = configProvider.getMaxRetries();
        const newInitialDelay = configProvider.getInitialDelay();
        const newMaxSavedChatSessions = configProvider.getMaxSavedChatSessions();

        const newProfiles = configProvider.getProfiles();
        const newActiveChatProfile = configProvider.getActiveChatProfile();
        const newActiveCompletionProfile = configProvider.getActiveCompletionProfile();

        eventBus.emit('log', { 
            level: 'info', 
            message: CONFIG_LOGS.CONFIGURATION_CHANGED(newLogLevel, newMaxAgentIterations, !!newAnonymizerEnabled, newInlineCompletionEnabled) 
        });

        // Update logger live
        defaultLogger.setLogLevel(parseLogLevel(newLogLevel));
        
        // Update the shared config object by reference
        if (configContainer.config) {
          const oldInlineEnabled = configContainer.config.inlineCompletion.enabled;
          configContainer.config.logLevel = newLogLevel;
          configContainer.config.maxAgentIterations = newMaxAgentIterations;
          configContainer.config.inlineCompletion.enabled = newInlineCompletionEnabled;
          configContainer.config.inlineCompletion.supportedLanguages = newInlineCompletionSupportedLanguages;
          configContainer.config.inlineCompletion.enableInUntitledEditors = newInlineCompletionEnableInUntitledEditors;
          configContainer.config.maxRetries = newMaxRetries;
          configContainer.config.initialDelay = newInitialDelay;
          configContainer.config.maxSavedChatSessions = newMaxSavedChatSessions;

          if (newInlineCompletionEnabled !== oldInlineEnabled) {
            eventBus.emit('inlineCompletionToggled', newInlineCompletionEnabled);
          }

          if (newProfiles) {
            // Update profiles list. We keep the base ones and apply overrides.
            configContainer.config.profiles = { ...configContainer.config.profiles, ...newProfiles };
          }
          if (newActiveChatProfile) {
            configContainer.config.activeChatProfile = newActiveChatProfile;
          }
          if (newActiveCompletionProfile) {
            configContainer.config.activeCompletionProfile = newActiveCompletionProfile;
          }

          if (newAnonymizerEnabled !== undefined) {
            configContainer.config.anonymizer.enabled = newAnonymizerEnabled;
          }
          if (newAnonymizerWords !== undefined) {
            configContainer.config.anonymizer.words = newAnonymizerWords;
          }
          if (newAnonymizerEntropy !== undefined || newAnonymizerMinLength !== undefined) {
            configContainer.config.anonymizer.sensitiveData = {
              ...configContainer.config.anonymizer.sensitiveData,
              allowedEntropy: newAnonymizerEntropy ?? configContainer.config.anonymizer.sensitiveData?.allowedEntropy ?? CONFIG_DEFAULTS.ANONYMIZER_ALLOWED_ENTROPY,
              minLength: newAnonymizerMinLength ?? configContainer.config.anonymizer.sensitiveData?.minLength ?? CONFIG_DEFAULTS.ANONYMIZER_MIN_LENGTH
            };
          }

          // Refresh provider instances with new settings
          await configProcessor.updateProviders(configContainer.config, eventBus, secretManager, httpClient);
        }
      }
    })
  );
}
