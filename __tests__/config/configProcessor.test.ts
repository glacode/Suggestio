import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { configProcessor, SecretManager } from '../../src/config/configProcessor.js';
import { ConfigContainer } from '../../src/config/types.js';

describe('processConfig', () => {
  let mockSecretManager: SecretManager;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TEST_KEY;

    mockSecretManager = {
      getOrRequestAPIKey: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`))
    };
  });

  it('resolves a plain string API key', async () => {
    const rawJson = JSON.stringify({
      activeProvider: 'provider1',
      providers: {
        provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'my-key' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: ConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager);

    const provider = configContainer.config.providers.provider1;
    expect(provider.resolvedApiKey).toBe('my-key');
    expect(provider.apiKeyPlaceholder).toBeUndefined();
  });

  it('resolves a placeholder from environment variable', async () => {
    process.env.TEST_KEY = 'env-secret';
    const rawJson = JSON.stringify({
      activeProvider: 'provider1',
      providers: {
        provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '${TEST_KEY}' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: ConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager);

    const provider = configContainer.config.providers.provider1;
    expect(provider.resolvedApiKey).toBe('env-secret');
    expect(provider.apiKeyPlaceholder).toBe('TEST_KEY');
  });

  it('resolves a placeholder using secret manager if env var not set', async () => {
    const rawJson = JSON.stringify({
      activeProvider: 'provider1',
      providers: {
        provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '${TEST_KEY}' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: ConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager);

    const provider = configContainer.config.providers.provider1;
    expect(provider.resolvedApiKey).toBe('secret-for-TEST_KEY');
    expect(provider.apiKeyPlaceholder).toBe('TEST_KEY');
    expect(mockSecretManager.getOrRequestAPIKey).toHaveBeenCalledWith('TEST_KEY');
  });

  it('resolves an empty apiKey using secret manager', async () => {
    const rawJson = JSON.stringify({
      activeProvider: 'provider1',
      providers: {
        provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: ConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager);

    const provider = configContainer.config.providers.provider1;
    expect(provider.resolvedApiKey).toBe('');
    expect(provider.apiKeyPlaceholder).toBeUndefined();
    expect(mockSecretManager.getOrRequestAPIKey).not.toHaveBeenCalled();
  });
});