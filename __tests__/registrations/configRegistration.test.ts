import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { registerConfigHandler } from '../../src/registrations/configRegistration.js';
import { IConfigContainer, IConfig, IConfigChangeEvent, IConfigProvider, IEventBus, IHttpClient } from '../../src/types.js';
import { defaultLogger, LogLevel } from '../../src/log/logger.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';
import { createDefaultConfig, createMockConfigProvider, createMockEventBus, createMockHttpClient } from '../testUtils.js';
import { ISecretManager } from '../../src/config/configProcessor.js';

describe('registerConfigHandler', () => {
  let mockSubscriptions: { push: jest.Mock };
  let mockConfigProvider: jest.Mocked<IConfigProvider>;
  let mockEventBus: jest.Mocked<IEventBus>;
  let mockSecretManager: jest.Mocked<ISecretManager>;
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let configContainer: IConfigContainer;
  let onDidChangeConfigurationListener: (e: IConfigChangeEvent) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptions = {
      push: jest.fn()
    };
    
    mockConfigProvider = createMockConfigProvider();
    mockEventBus = createMockEventBus();
    mockSecretManager = {
      getOrRequestAPIKey: jest.fn<() => Promise<string>>(),
      getSecret: jest.fn<() => Promise<string | undefined>>(),
      updateAPIKey: jest.fn<() => Promise<void>>(),
      deleteSecret: jest.fn<() => Promise<void>>()
    };
    mockHttpClient = createMockHttpClient();
    
    const config: IConfig = createDefaultConfig();
    config.logLevel = CONFIG_DEFAULTS.LOG_LEVEL;
    config.maxAgentIterations = CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS;
    config.maxRetries = CONFIG_DEFAULTS.MAX_RETRIES;
    config.initialDelay = CONFIG_DEFAULTS.INITIAL_DELAY;
    
    configContainer = { config };
    defaultLogger.setLogLevel(LogLevel.Info);

    mockConfigProvider.onDidChangeConfiguration.mockImplementation((listener: (e: IConfigChangeEvent) => void) => {
      onDidChangeConfigurationListener = listener;
      return { dispose: jest.fn() };
    });

    mockConfigProvider.getLogLevel.mockReturnValue('Info');
    mockConfigProvider.getMaxAgentIterations.mockReturnValue(30);
    mockConfigProvider.getAnonymizerEnabled.mockReturnValue(false);
    mockConfigProvider.getEnableInlineCompletion.mockReturnValue(true);
    mockConfigProvider.getMaxRetries.mockReturnValue(5);
    mockConfigProvider.getInitialDelay.mockReturnValue(1000);
  });

  it('should register a configuration change listener', () => {
    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer, mockEventBus, mockSecretManager, mockHttpClient);
    expect(mockConfigProvider.onDidChangeConfiguration).toHaveBeenCalled();
    expect(mockSubscriptions.push).toHaveBeenCalled();
  });

  it('should update config and logger when suggestio configuration changes', async () => {
    mockConfigProvider.getLogLevel.mockReturnValue('Debug');
    mockConfigProvider.getMaxAgentIterations.mockReturnValue(10);
    mockConfigProvider.getMaxRetries.mockReturnValue(3);
    mockConfigProvider.getInitialDelay.mockReturnValue(500);

    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer, mockEventBus, mockSecretManager, mockHttpClient);

    // Trigger the listener
    const mockEvent: IConfigChangeEvent = {
      affectsConfiguration: (section: string) => section === 'suggestio'
    };
    await onDidChangeConfigurationListener(mockEvent);

    expect(configContainer.config.logLevel).toBe('Debug');
    expect(configContainer.config.maxAgentIterations).toBe(10);
    expect(configContainer.config.maxRetries).toBe(3);
    expect(configContainer.config.initialDelay).toBe(500);
    expect(mockEventBus.emit).toHaveBeenCalledWith('log', expect.objectContaining({
      level: 'info',
      message: expect.stringContaining('Configuration changed')
    }));
  });

  it('should not update config when other configuration changes', async () => {
    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer, mockEventBus, mockSecretManager, mockHttpClient);

    // Trigger the listener for a different section
    const mockEvent: IConfigChangeEvent = {
      affectsConfiguration: (section: string) => section === 'other'
    };
    await onDidChangeConfigurationListener(mockEvent);

    expect(configContainer.config.logLevel).toBe('Info');
    expect(configContainer.config.maxAgentIterations).toBe(30);
  });
});
