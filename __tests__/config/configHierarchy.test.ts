import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { configProcessor, SecretManager } from '../../src/config/configProcessor.js';
import { IConfigContainer } from '../../src/types.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { NodeFetchClient } from '../../src/utils/httpClient.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';

const httpClient = new NodeFetchClient();

describe('Config Hierarchy', () => {
  let mockSecretManager: SecretManager;
  let eventBus: EventBus;

  beforeEach(() => {
    jest.resetAllMocks();
    eventBus = new EventBus();

    mockSecretManager = {
      getOrRequestAPIKey: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      getSecret: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`))
    };
  });

  it('should ignore behavioral settings in JSON and use CONFIG_DEFAULTS if no overrides provided', async () => {
    // maxAgentIterations and enableInlineCompletion are provided in JSON but should be ignored by the new processConfig
    const rawJson = JSON.stringify({
      activeChatProfile: 'provider1',
      maxAgentIterations: 10,
      enableInlineCompletion: false,
      profiles: {
        provider1: { model: 'gpt-4', apiKey: 'key' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient);

    // It should NOT be 10 or false, but the defaults
    expect(configContainer.config.maxAgentIterations).toBe(CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS);
    expect(configContainer.config.enableInlineCompletion).toBe(true);
  });

  it('should correctly apply overrides over JSON and defaults', async () => {
    const rawJson = JSON.stringify({
      activeChatProfile: 'provider1',
      profiles: {
        provider1: { model: 'gpt-4', apiKey: 'key' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const overrides = {
      maxAgentIterations: 50,
      logLevel: 'Debug'
    };

    const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient, overrides);

    expect(configContainer.config.maxAgentIterations).toBe(50);
    expect(configContainer.config.logLevel).toBe('Debug');
  });

  it('should allow anonymizer overrides', async () => {
    const rawJson = JSON.stringify({
      activeChatProfile: 'provider1',
      profiles: {
        provider1: { model: 'gpt-4', apiKey: 'key' }
      },
      anonymizer: { enabled: false, words: ['json-word'] }
    });

    const overrides = {
      anonymizer: { enabled: true }
    };

    const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, mockSecretManager, eventBus, httpClient, overrides);

    expect(configContainer.config.anonymizer.enabled).toBe(true);
    expect(configContainer.config.anonymizer.words).toEqual(['json-word']); // Words from JSON preserved
  });
});
