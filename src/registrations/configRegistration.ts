import { IConfigContainer, IConfigProvider, IDisposable, IEventBus, IHttpClient } from '../types.js';
import { defaultLogger, parseLogLevel } from '../log/logger.js';
import { CONFIG_LOGS } from '../constants/messages.js';
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
        const newEnableInlineCompletion = configProvider.getEnableInlineCompletion();
        const newMaxRetries = configProvider.getMaxRetries();
        const newInitialDelay = configProvider.getInitialDelay();
        const newMaxSavedChatSessions = configProvider.getMaxSavedChatSessions();

        eventBus.emit('log', { 
            level: 'info', 
            message: CONFIG_LOGS.CONFIGURATION_CHANGED(newLogLevel, newMaxAgentIterations, !!newAnonymizerEnabled, newEnableInlineCompletion) 
        });

        // Update logger live
        defaultLogger.setLogLevel(parseLogLevel(newLogLevel));
        
        // Update the shared config object by reference
        if (configContainer.config) {
          configContainer.config.logLevel = newLogLevel;
          configContainer.config.maxAgentIterations = newMaxAgentIterations;
          configContainer.config.enableInlineCompletion = newEnableInlineCompletion;
          configContainer.config.maxRetries = newMaxRetries;
          configContainer.config.initialDelay = newInitialDelay;
          configContainer.config.maxSavedChatSessions = newMaxSavedChatSessions;
          if (newAnonymizerEnabled !== undefined) {
            configContainer.config.anonymizer.enabled = newAnonymizerEnabled;
          }
          if (newAnonymizerWords !== undefined) {
            configContainer.config.anonymizer.words = newAnonymizerWords;
          }
          if (newAnonymizerEntropy !== undefined || newAnonymizerMinLength !== undefined) {
            configContainer.config.anonymizer.sensitiveData = {
              ...configContainer.config.anonymizer.sensitiveData,
              allowedEntropy: newAnonymizerEntropy ?? configContainer.config.anonymizer.sensitiveData?.allowedEntropy ?? 0.85,
              minLength: newAnonymizerMinLength ?? configContainer.config.anonymizer.sensitiveData?.minLength ?? 10
            };
          }

          // Refresh provider instances with new settings
          await configProcessor.updateProviders(configContainer.config, eventBus, secretManager, httpClient);
        }
      }
    })
  );
}
