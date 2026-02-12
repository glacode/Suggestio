import { IConfigContainer, IConfigProvider, IDisposable } from '../types.js';
import { defaultLogger, parseLogLevel } from '../logger.js';

/**
 * Registers a listener for configuration changes.
 * When the user updates 'suggestio' settings, this will update the shared config object
 * and the global logger live.
 */
export function registerConfigHandler(
  subscriptions: { push(disposable: IDisposable): void },
  configProvider: IConfigProvider,
  configContainer: IConfigContainer
) {
  subscriptions.push(
    configProvider.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('suggestio')) {
        const newLogLevel = configProvider.getLogLevel();
        const newMaxAgentIterations = configProvider.getMaxAgentIterations();

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
