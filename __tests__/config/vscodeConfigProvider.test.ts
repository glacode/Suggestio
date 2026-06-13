import { VScodeConfigProvider } from '../../src/config/vscodeConfigProvider.js';
import { 
  createMockVscodeApi, 
  createMockWorkspaceProvider, 
  createMockUri, 
  IMockVscodeApiLocal 
} from '../testUtils.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';
import { 
  ConfigTarget, 
  IVscodeWorkspaceConfiguration, 
  IWorkspaceProvider 
} from '../../src/types.js';
import { expect, jest } from '@jest/globals';

describe('VScodeConfigProvider', () => {
  let mockVscodeApi: IMockVscodeApiLocal;
  let mockWorkspaceProvider: jest.Mocked<IWorkspaceProvider>;
  let mockConfig: jest.Mocked<IVscodeWorkspaceConfiguration>;
  let provider: VScodeConfigProvider;
  const packageJsonLanguages = ['javascript', 'typescript'];

  beforeEach(() => {
    mockVscodeApi = createMockVscodeApi();
    mockWorkspaceProvider = createMockWorkspaceProvider();
    mockConfig = mockVscodeApi.mockConfig;
    
    provider = new VScodeConfigProvider(
      mockVscodeApi,
      mockWorkspaceProvider,
      packageJsonLanguages
    );
  });

  it('should use the workspace root URI when getting configuration', () => {
    const rootUri = createMockUri('/test/workspace');
    mockWorkspaceProvider.rootUri.mockReturnValue(rootUri);
    
    provider.getLogLevel();
    
    expect(mockVscodeApi.workspace.getConfiguration).toHaveBeenCalledWith('suggestio', rootUri);
  });

  it('should return correct log level', () => {
    mockConfig.get.mockReturnValue('Debug');
    expect(provider.getLogLevel()).toBe('Debug');
  });

  it('should return default log level if not set', () => {
    mockConfig.get.mockReturnValue(undefined);
    expect(provider.getLogLevel()).toBe(CONFIG_DEFAULTS.LOG_LEVEL);
  });

  it('should return default max agent iterations if not set', () => {
    mockConfig.get.mockReturnValue(undefined);
    expect(provider.getMaxAgentIterations()).toBe(CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS);
  });

  it('should return anonymizer settings', () => {
    mockConfig.get.mockReturnValueOnce(true); // enabled
    mockConfig.get.mockReturnValueOnce(['secret']); // words
    mockConfig.get.mockReturnValueOnce(0.5); // entropy
    mockConfig.get.mockReturnValueOnce(5); // minLength

    expect(provider.getAnonymizerEnabled()).toBe(true);
    expect(provider.getAnonymizerWords()).toEqual(['secret']);
    expect(provider.getAnonymizerEntropy()).toBe(0.5);
    expect(provider.getAnonymizerMinLength()).toBe(5);
  });

  it('should return inline completion settings', () => {
    mockConfig.get.mockReturnValueOnce(false); // enabled
    mockConfig.get.mockReturnValueOnce(['python']); // languages
    mockConfig.get.mockReturnValueOnce(true); // untitled

    expect(provider.getInlineCompletionEnabled()).toBe(false);
    expect(provider.getInlineCompletionSupportedLanguages()).toEqual(['python']);
    expect(provider.getInlineCompletionEnableInUntitledEditors()).toBe(true);
  });

  it('should use package.json languages if supportedLanguages is not configured', () => {
    mockConfig.get.mockReturnValue(undefined);
    expect(provider.getInlineCompletionSupportedLanguages()).toEqual(packageJsonLanguages);
  });

  it('should delete a profile globally', async () => {
    mockConfig.inspect.mockReturnValue({
      globalValue: { 'old-profile': {} }
    });
    
    await provider.deleteProfile('old-profile');
    
    expect(mockConfig.update).toHaveBeenCalledWith('profiles', {}, ConfigTarget.Global);
  });

  it('should not update if profile to delete does not exist', async () => {
    mockConfig.inspect.mockReturnValue({
      globalValue: { 'other-profile': {} }
    });
    
    await provider.deleteProfile('old-profile');
    
    expect(mockConfig.update).not.toHaveBeenCalled();
  });

  it('should update configuration globally or locally', async () => {
    await provider.updateConfig('someKey', 'someValue', true);
    expect(mockConfig.update).toHaveBeenCalledWith('someKey', 'someValue', ConfigTarget.Global);

    await provider.updateConfig('otherKey', 'otherValue', false);
    expect(mockConfig.update).toHaveBeenCalledWith('otherKey', 'otherValue', ConfigTarget.Workspace);
  });

  it('should register for configuration changes', () => {
    const listener = () => {};
    provider.onDidChangeConfiguration(listener);
    expect(mockVscodeApi.workspace.onDidChangeConfiguration).toHaveBeenCalledWith(listener);
  });
});
