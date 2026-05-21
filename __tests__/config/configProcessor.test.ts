import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { configProcessor, ISecretManager, getChatProfileIds } from '../../src/config/configProcessor.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';
import { IConfigContainer } from '../../src/types.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { NodeFetchClient } from '../../src/utils/httpClient.js';

const httpClient = new NodeFetchClient();

describe('ConfigProcessor', () => {
  let mockISecretManager: ISecretManager;
  let eventBus: EventBus;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TEST_KEY;
    eventBus = new EventBus();

    mockISecretManager = {
      getOrRequestAPIKey: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      getSecret: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      updateAPIKey: jest.fn(() => Promise.resolve()),
      deleteSecret: jest.fn(() => Promise.resolve())
    };
  });

describe('processConfig', () => {
    it('skips resolution if isApiKeyRequired is false', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', isApiKeyRequired: false }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe("");
    });

    it('preserves excludeFromChat property', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { model: 'gpt-4', apiKeyIdentifier: 'key', excludeFromChat: true },
          provider2: { model: 'gpt-4', apiKeyIdentifier: 'key', excludeFromChat: false }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

      expect(configContainer.config.profiles.provider1.excludeFromChat).toBe(true);
      expect(configContainer.config.profiles.provider2.excludeFromChat).toBe(false);
    });

    it('resolves a key from environment variable', async () => {
      process.env.TEST_KEY = 'env-secret';
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'TEST_KEY' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('env-secret');
    });

    it('resolves a key using secret manager (passive) if env var not set', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'TEST_KEY' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBe('secret-for-TEST_KEY');
      expect(mockISecretManager.getSecret).toHaveBeenCalledWith('TEST_KEY');
      expect(mockISecretManager.getOrRequestAPIKey).not.toHaveBeenCalled();
    });

    it('triggers prompt when updateProviders is called with forcePrompt=true', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'TEST_KEY' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      
      // Reset mocks to check subsequent call
      jest.clearAllMocks();
      
      await configProcessor.updateProviders(configContainer.config, eventBus, mockISecretManager, httpClient, true);

      expect(mockISecretManager.getOrRequestAPIKey).toHaveBeenCalledWith('TEST_KEY');
    });

    it('does not resolve anything if apiKeyIdentifier is missing and isApiKeyRequired is true (default)', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4' }
        },
        anonymizer: { enabled: false, words: [] }
      });

      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

      const provider = configContainer.config.profiles.provider1;
      expect(provider.resolvedApiKey).toBeUndefined();
      expect(mockISecretManager.getOrRequestAPIKey).not.toHaveBeenCalled();
    });

    it('handles missing anonymizer section by defaulting to enabled: false', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'key' }
        }
      });
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.anonymizer).toEqual({ 
        enabled: false, 
        words: [],
        sensitiveData: { 
          allowedEntropy: CONFIG_DEFAULTS.ANONYMIZER_ALLOWED_ENTROPY, 
          minLength: CONFIG_DEFAULTS.ANONYMIZER_MIN_LENGTH 
        }
      });
    });

    it('handles anonymizer section missing enabled flag', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'key' }
        },
        anonymizer: { words: ['test'] }
      });
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.anonymizer.enabled).toBe(false);
      expect(configContainer.config.anonymizer.words).toEqual(['test']);
    });

    it('applies overrides to the configuration', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const overrides = {
        maxAgentIterations: 50,
        anonymizer: { enabled: true }
      };
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient, overrides);
      expect(configContainer.config.maxAgentIterations).toBe(50);
      expect(configContainer.config.anonymizer.enabled).toBe(true);
    });

    it('resolves separate completion profile if provided', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'chatP',
        activeCompletionProfile: 'compP',
        profiles: {
          chatP: { endpoint: 'https://chat.example.com', model: 'chat-model', apiKeyIdentifier: 'chat-key' },
          compP: { endpoint: 'https://comp.example.com', model: 'comp-model', apiKeyIdentifier: 'comp-key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.chatP.resolvedApiKey).toBe('secret-for-chat-key');
      expect(configContainer.config.profiles.compP.resolvedApiKey).toBe('secret-for-comp-key');
    });

    it('handles non-string apiKeyIdentifier gracefully', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 123 }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.provider1.resolvedApiKey).toBeUndefined();
    });

    it('handles missing profiles or activeChatProfile', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'missing',
        profiles: {},
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.activeChatProfile).toBe('missing');
    });

    it('does not resolve completion profile if it is missing from profiles', async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'chatP',
        activeCompletionProfile: 'missingP',
        profiles: {
          chatP: { endpoint: 'https://chat.example.com', model: 'chat-model', apiKeyIdentifier: 'chat-key' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      const configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
      expect(configContainer.config.profiles.missingP).toBeUndefined();
    });
  });

  describe('getChatProfileIds', () => {
    it('should include profiles that have neither supportsTools nor excludeFromChat set', () => {
      const profiles: any = {
        'p1': { model: 'm1', apiKeyIdentifier: 'k1' }
      };
      const result = getChatProfileIds(profiles);
      expect(result).toContain('p1');
    });

    it('should exclude profiles where supportsTools is explicitly false', () => {
      const profiles: any = {
        'p1': { model: 'm1', apiKeyIdentifier: 'k1', supportsTools: false }
      };
      const result = getChatProfileIds(profiles);
      expect(result).not.toContain('p1');
    });

    it('should exclude profiles where excludeFromChat is explicitly true', () => {
      const profiles: any = {
        'p1': { model: 'm1', apiKeyIdentifier: 'k1', excludeFromChat: true }
      };
      const result = getChatProfileIds(profiles);
      expect(result).not.toContain('p1');
    });

    it('should include profiles where supportsTools is true and excludeFromChat is false', () => {
      const profiles: any = {
        'p1': { model: 'm1', apiKeyIdentifier: 'k1', supportsTools: true, excludeFromChat: false }
      };
      const result = getChatProfileIds(profiles);
      expect(result).toContain('p1');
    });

    it('should exclude if either condition is met', () => {
      const profiles: any = {
        'p1': { model: 'm1', apiKeyIdentifier: 'k1', supportsTools: false, excludeFromChat: false },
        'p2': { model: 'm2', apiKeyIdentifier: 'k2', supportsTools: true, excludeFromChat: true }
      };
      const result = getChatProfileIds(profiles);
      expect(result).toHaveLength(0);
    });
  });

  describe('Event Listeners', () => {
    let configContainer: IConfigContainer;

    beforeEach(async () => {
      const rawJson = JSON.stringify({
        activeChatProfile: 'provider1',
        profiles: {
          provider1: { endpoint: 'https://api.example.com', model: 'gpt-4', apiKeyIdentifier: 'key' },
          provider2: { endpoint: 'https://api2.example.com', model: 'gpt-4-2', apiKeyIdentifier: 'key2' }
        },
        anonymizer: { enabled: false, words: [] }
      });
      configContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);
    });

    it('updates active chat profile on chatProfileChanged event', async () => {
      eventBus.emit('chatProfileChanged', 'provider2');
      await new Promise(resolve => setTimeout(resolve, 50)); 
      expect(configContainer.config.activeChatProfile).toBe('provider2');
      expect(configContainer.config.profiles.provider2.resolvedApiKey).toBe('secret-for-key2');
    });

    it('does not update active chat profile if profileId does not exist', async () => {
      eventBus.emit('chatProfileChanged', 'non-existent');
      await new Promise(resolve => setTimeout(resolve, 50)); 
      expect(configContainer.config.activeChatProfile).toBe('provider1');
    });

    it('updates inlineCompletion.enabled on inlineCompletionToggled event', () => {
      eventBus.emit('inlineCompletionToggled', true);
      expect(configContainer.config.inlineCompletion.enabled).toBe(true);
      eventBus.emit('inlineCompletionToggled', false);
      expect(configContainer.config.inlineCompletion.enabled).toBe(false);
    });

    it('updates active completion profile on completionProfileChanged event', async () => {
      eventBus.emit('completionProfileChanged', 'provider2');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(configContainer.config.activeCompletionProfile).toBe('provider2');
      expect(configContainer.config.profiles.provider2.resolvedApiKey).toBe('secret-for-key2');
    });
  });
});
