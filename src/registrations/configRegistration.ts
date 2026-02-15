import { IConfigContainer, IConfigProvider, IDisposable, IEventBus } from '../types.js';
import { defaultLogger, parseLogLevel } from '../log/logger.js';

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
        const newLogLevel = configProvider.getLogLevel();
        const newMaxAgentIterations = configProvider.getMaxAgentIterations();

        eventBus.emit('log', { level: 'info', message: `Configuration changed. New log level: ${newLogLevel}, Max iterations: ${newMaxAgentIterations}` });

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
