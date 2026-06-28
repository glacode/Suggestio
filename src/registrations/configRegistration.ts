import { IConfigContainer, IConfigProvider, IDisposable, IEventBus, IHttpClient, IVSCodeSettings } from '../types.js';
import { APP_EVENTS } from '../constants/protocol.js';
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
        const newInlineCompletionEnabled = configProvider.getInlineCompletionEnabled();

        eventBus.emit(APP_EVENTS.LOG, { 
            level: 'info', 
            message: CONFIG_LOGS.CONFIGURATION_CHANGED(newLogLevel, newMaxAgentIterations, !!newAnonymizerEnabled, newInlineCompletionEnabled) 
        });

        // Update logger live
        defaultLogger.setLogLevel(parseLogLevel(newLogLevel));
        
        // Authority: Sync the configuration stack
        const vsCodeSettings: IVSCodeSettings = {
            logLevel: newLogLevel,
            maxAgentIterations: newMaxAgentIterations,
            anonymizer: {
                enabled: newAnonymizerEnabled,
                words: configProvider.getAnonymizerWords(),
                sensitiveData: {
                    allowedEntropy: configProvider.getAnonymizerEntropy(),
                    minLength: configProvider.getAnonymizerMinLength()
                }
            },
            inlineCompletion: {
                enabled: newInlineCompletionEnabled,
                supportedLanguages: configProvider.getInlineCompletionSupportedLanguages(),
                enableInUntitledEditors: configProvider.getInlineCompletionEnableInUntitledEditors()
            },
            maxRetries: configProvider.getMaxRetries(),
            initialDelay: configProvider.getInitialDelay(),
            maxSavedChatSessions: configProvider.getMaxSavedChatSessions(),
            profiles: configProvider.getProfiles(),
            activeChatProfile: configProvider.getActiveChatProfile(),
            activeCompletionProfile: configProvider.getActiveCompletionProfile()
        };

        const oldInlineEnabled = configContainer.config?.inlineCompletion?.enabled;

        await configProcessor.syncConfig(configContainer, vsCodeSettings, eventBus, secretManager, httpClient);

        if (configContainer.config.inlineCompletion.enabled !== oldInlineEnabled) {
          eventBus.emit(APP_EVENTS.INLINE_COMPLETION_TOGGLED, configContainer.config.inlineCompletion.enabled);
        }

        // Notify listeners that configuration has changed
        eventBus.emit(APP_EVENTS.CONFIG_CHANGED, undefined);
      }
    })
  );
}
