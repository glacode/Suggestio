import { 
  IConfigProvider, 
  IVscodeApiLocal, 
  IWorkspaceProvider, 
  IConfigChangeEvent, 
  IDisposable,
  ConfigTarget
} from '../types.js';
import { CONFIG_DEFAULTS } from '../constants/config.js';

/**
 * Implementation of IConfigProvider that uses the VS Code Workspace Configuration API.
 */
export class VScodeConfigProvider implements IConfigProvider {
  constructor(
    private readonly vscodeApi: IVscodeApiLocal,
    private readonly workspaceProvider: IWorkspaceProvider,
    private readonly packageJsonLanguages: string[]
  ) {}

  private getConfiguration() {
    return this.vscodeApi.workspace.getConfiguration('suggestio', this.workspaceProvider.rootUri());
  }

  getSanitizerDisabled(): boolean {
    return this.getConfiguration().get<boolean>('debug.security.disableSanitizer', false) ?? false;
  }

  getLogLevel(): string {
    return this.getConfiguration().get<string>('logLevel', CONFIG_DEFAULTS.LOG_LEVEL) ?? CONFIG_DEFAULTS.LOG_LEVEL;
  }

  getMaxAgentIterations(): number {
    return this.getConfiguration().get<number>('maxAgentIterations', CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS) ?? CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS;
  }

  getAnonymizerEnabled(): boolean | undefined {
    return this.getConfiguration().get<boolean | undefined>('experimental.anonymizer.enabled');
  }

  getAnonymizerWords(): string[] | undefined {
    return this.getConfiguration().get<string[]>('experimental.anonymizer.words');
  }

  getAnonymizerEntropy(): number | undefined {
    return this.getConfiguration().get<number>('experimental.anonymizer.sensitiveData.allowedEntropy');
  }

  getAnonymizerMinLength(): number | undefined {
    return this.getConfiguration().get<number>('experimental.anonymizer.sensitiveData.minLength');
  }

  getInlineCompletionEnabled(): boolean {
    return this.getConfiguration().get<boolean>('inlineCompletion.enabled', true) ?? true;
  }

  getInlineCompletionSupportedLanguages(): string[] {
    return this.getConfiguration().get<string[]>('inlineCompletion.supportedLanguages', this.packageJsonLanguages) ?? this.packageJsonLanguages;
  }

  getInlineCompletionEnableInUntitledEditors(): boolean {
    return this.getConfiguration().get<boolean>('inlineCompletion.enableInUntitledEditors', false) ?? false;
  }

  getMaxRetries(): number {
    return this.getConfiguration().get<number>('llm.maxRetries', CONFIG_DEFAULTS.MAX_RETRIES) ?? CONFIG_DEFAULTS.MAX_RETRIES;
  }

  getInitialDelay(): number {
    return this.getConfiguration().get<number>('llm.initialDelay', CONFIG_DEFAULTS.INITIAL_DELAY) ?? CONFIG_DEFAULTS.INITIAL_DELAY;
  }

  getMaxSavedChatSessions(): number {
    return this.getConfiguration().get<number>('maxSavedChatSessions', CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS) ?? CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS;
  }

  getProfiles(): Record<string, any> {
    return this.getConfiguration().get<Record<string, any>>('profiles') || {};
  }

  getActiveChatProfile(): string | undefined {
    return this.getConfiguration().get<string>('activeChatProfile');
  }

  getActiveCompletionProfile(): string | undefined {
    return this.getConfiguration().get<string>('activeCompletionProfile');
  }

  async deleteProfile(profileId: string): Promise<void> {
    const config = this.getConfiguration();
    const inspect = config.inspect<Record<string, any>>('profiles');
    
    // Update Global (User) settings
    const globalProfiles = { ...(inspect?.globalValue || {}) };
    if (globalProfiles[profileId]) {
      delete globalProfiles[profileId];
      await config.update('profiles', globalProfiles, ConfigTarget.Global);
    }
  }

  async updateConfig(key: string, value: any, global: boolean): Promise<void> {
    const config = this.getConfiguration();
    await config.update(
      key, 
      value, 
      global ? ConfigTarget.Global : ConfigTarget.Workspace
    );
  }

  onDidChangeConfiguration(listener: (event: IConfigChangeEvent) => void): IDisposable {
    return this.vscodeApi.workspace.onDidChangeConfiguration(listener);
  }
}
