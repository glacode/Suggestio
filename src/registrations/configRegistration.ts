import { IConfigContainer, IConfigProvider, IDisposable, IEventBus } from '../types.js';
import { defaultLogger, parseLogLevel } from '../log/logger.js';
import { CONFIG_LOGS } from '../constants/messages.js';

/**
 * Registers a listener for configuration changes.
 * When the user updates 'suggestio' settings, this will update the shared config object
 * and the global logger live.
 */
export function registerConfigHandler(
  subscriptions: { push(disposable: IDisposable): void },
  configProvider: IConfigProvider,
  configContainer: IConfigContainer,
  eventBus: IEventBus
) {
  subscriptions.push(
    configProvider.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('suggestio')) {
        const newLogLevel = configProvider.getLogLevel() ?? 'info';
        const newMaxAgentIterations = configProvider.getMaxAgentIterations() ?? 5;

        eventBus.emit('log', { level: 'info', message: CONFIG_LOGS.CONFIGURATION_CHANGED(newLogLevel, newMaxAgentIterations) });

        // Update logger live
        defaultLogger.setLogLevel(parseLogLevel(newLogLevel));
        
        // Update the shared config object by reference
        if (configContainer.config) {
          configContainer.config.logLevel = newLogLevel;
          configContainer.config.maxAgentIterations = newMaxAgentIterations;
        }
      }
    })
  );
}
