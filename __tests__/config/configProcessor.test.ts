import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { configProcessor, SecretManager } from '../../src/config/configProcessor.js';
import { IConfigContainer } from '../../src/types.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { NodeFetchClient } from '../../src/utils/httpClient.js';

const httpClient = new NodeFetchClient();

describe('ConfigProcessor', () => {
  let mockSecretManager: SecretManager;
  let eventBus: EventBus;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TEST_KEY;
    eventBus = new EventBus();

    mockSecretManager = {
      getOrRequestAPIKey: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      getSecret: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`))
    };
  });

  describe('processConfig', () => {
    it('resolves a plain string API key', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'my-key' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('my-key');
      expect(provider.apiKeyPlaceholder).toBeUndefined();
    });

    it('resolves a placeholder from environment variable', async () => {
      process.env.TEST_KEY = 'env-secret';
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '${TEST_KEY}' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('env-secret');
      expect(provider.apiKeyPlaceholder).toBe('TEST_KEY');
    });

    it('resolves a placeholder using secret manager (passive) if env var not set', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '${TEST_KEY}' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('secret-for-TEST_KEY');
      expect(provider.apiKeyPlaceholder).toBe('TEST_KEY');
      expect(mockSecretManager.getSecret).toHaveBeenCalledWith('TEST_KEY');
      expect(mockSecretManager.getOrRequestAPIKey).not.toHaveBeenCalled();
    });

    it('triggers prompt when updateProviders is called with forcePrompt=true', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '${TEST_KEY}' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      
      // Reset mocks to check subsequent call
      jest.clearAllMocks();
      
      await configProcessor.updateProviders(configContainer.config, eventBus, mockSecretManager, httpClient, true);

      expect(mockSecretManager.getOrRequestAPIKey).toHaveBeenCalledWith('TEST_KEY');
    });

    it('resolves an empty apiKey using secret manager', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: '' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('');
      expect(provider.apiKeyPlaceholder).toBeUndefined();
      expect(mockSecretManager.getOrRequestAPIKey).not.toHaveBeenCalled();
    });

    it('handles missing anonymizer section by defaulting to enabled: false', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' }
        }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.anonymizer).toEqual({ enabled: false, words: [] });
    });

    it('handles anonymizer section missing enabled flag', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' }
        },
        anonymizer: { words: ['test'] }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.anonymizer.enabled).toBe(false);
      expect(configContainer.config.anonymizer.words).toEqual(['test']);
    });

    it('applies overrides to the configuration', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const overrides = {
        maxAgentIterations: 50,
        anonymizer: { enabled: true }
      };
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient, overrides);
      expect(configContainer.config.maxAgentIterations).toBe(50);
      expect(configContainer.config.anonymizer.enabled).toBe(true);
    });

    it('resolves separate completion profile if provided', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'chatP',
        activeCompletionProfile: 'compP',
        profiles: {
          chatP: { endpoint: 'https://chat.example.com', model: 'chat-model', apiKey: 'chat-key' },
          compP: { endpoint: 'https://comp.example.com', model: 'comp-model', apiKey: 'comp-key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.chatP.resolvedApiKey).toBe('chat-key');
      expect(configContainer.config.profiles.compP.resolvedApiKey).toBe('comp-key');
    });

    it('handles non-string apiKey gracefully', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 123 }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.provider1.resolvedApiKey).toBeUndefined();
    });

    it('handles missing profiles or activeChatProfile', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'missing',
        profiles: {},
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.activeChatProfile).toBe('missing');
    });

    it('does not resolve completion profile if it is missing from profiles', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'chatP',
        activeCompletionProfile: 'missingP',
        profiles: {
          chatP: { endpoint: 'https://chat.example.com', model: 'chat-model', apiKey: 'chat-key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.missingP).toBeUndefined();
    });
  });

  describe('Event Listeners', () => {
    let configContainer: IConfigContainer;

    beforeEach(async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' },
          provider2: { endpoint: 'https://api2.example.com', model: 'gpt-4-2', apiKey: 'key2' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      configContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);
    });

    it('updates active chat profile on chatProfileChanged event', async () => {
      eventBus.emit('chatProfileChanged', 'provider2');
      await new Promise(resolve => setTimeout(resolve, 50)); 
      expect(configContainer.config.activeChatProfile).toBe('provider2');
      expect(configContainer.config.profiles.provider2.resolvedApiKey).toBe('key2');
    });

    it('does not update active chat profile if profileId does not exist', async () => {
      eventBus.emit('chatProfileChanged', 'non-existent');
      await new Promise(resolve => setTimeout(resolve, 50)); 
      expect(configContainer.config.activeChatProfile).toBe('provider1');
    });

    it('updates enableInlineCompletion on inlineCompletionToggled event', () => {
      eventBus.emit('inlineCompletionToggled', true);
      expect(configContainer.config.enableInlineCompletion).toBe(true);
      eventBus.emit('inlineCompletionToggled', false);
      expect(configContainer.config.enableInlineCompletion).toBe(false);
    });

    it('updates active completion profile on completionProfileChanged event', async () => {
      eventBus.emit('completionProfileChanged', 'provider2');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(configContainer.config.activeCompletionProfile).toBe('provider2');
      expect(configContainer.config.profiles.provider2.resolvedApiKey).toBe('key2');
    });
  });
});
