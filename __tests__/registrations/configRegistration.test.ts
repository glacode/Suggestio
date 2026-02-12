import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { registerConfigHandler } from '../../src/registrations/configRegistration.js';
import { IConfigContainer, Config, IConfigChangeEvent, IConfigProvider } from '../../src/types.js';
import { defaultLogger, LogLevel } from '../../src/logger.js';
import { createDefaultConfig, createMockConfigProvider } from '../testUtils.js';

describe('registerConfigHandler', () => {
  let mockSubscriptions: { push: jest.Mock };
  let mockConfigProvider: jest.Mocked<IConfigProvider>;
  let configContainer: IConfigContainer;
  let onDidChangeConfigurationListener: (e: IConfigChangeEvent) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptions = {
      push: jest.fn()
    };
    
    mockConfigProvider = createMockConfigProvider();
    
    const config: Config = createDefaultConfig();
    config.logLevel = 'Info';
    config.maxAgentIterations = 5;
    
    configContainer = { config };
    defaultLogger.setLogLevel(LogLevel.Info);

    mockConfigProvider.onDidChangeConfiguration.mockImplementation((listener: (e: IConfigChangeEvent) => void) => {
      onDidChangeConfigurationListener = listener;
      return { dispose: jest.fn() };
    });
  });

  it('should register a configuration change listener', () => {
    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer);
    expect(mockConfigProvider.onDidChangeConfiguration).toHaveBeenCalled();
    expect(mockSubscriptions.push).toHaveBeenCalled();
  });

  it('should update config and logger when suggestio configuration changes', () => {
    mockConfigProvider.getLogLevel.mockReturnValue('Debug');
    mockConfigProvider.getMaxAgentIterations.mockReturnValue(10);

    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer);

    // Trigger the listener
    const mockEvent: IConfigChangeEvent = {
      affectsConfiguration: (section: string) => section === 'suggestio'
    };
    onDidChangeConfigurationListener(mockEvent);

    expect(configContainer.config.logLevel).toBe('Debug');
    expect(configContainer.config.maxAgentIterations).toBe(10);
  });

  it('should not update config when other configuration changes', () => {
    registerConfigHandler(mockSubscriptions, mockConfigProvider, configContainer);

    // Trigger the listener for a different section
    const mockEvent: IConfigChangeEvent = {
      affectsConfiguration: (section: string) => section === 'other'
    };
    onDidChangeConfigurationListener(mockEvent);

    expect(configContainer.config.logLevel).toBe('Info');
    expect(configContainer.config.maxAgentIterations).toBe(5);
  });
});
