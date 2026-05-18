import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { configProcessor, ISecretManager } from '../../src/config/configProcessor.js';
import { IConfigContainer } from '../../src/types.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { NodeFetchClient } from '../../src/utils/httpClient.js';
import { CONFIG_DEFAULTS } from '../../src/constants/config.js';

const httpClient = new NodeFetchClient();

describe('Config Hierarchy', () => {
  let mockISecretManager: ISecretManager;
  let eventBus: EventBus;

  beforeEach(() => {
    jest.resetAllMocks();
    eventBus = new EventBus();

    mockISecretManager = {
      getOrRequestAPIKey: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      getSecret: jest.fn((key: string) => Promise.resolve(`secret-for-${key}`)),
      updateAPIKey: jest.fn(() => Promise.resolve()),
      deleteSecret: jest.fn(() => Promise.resolve())
    };
  });

  it('should ignore behavioral settings in JSON and use CONFIG_DEFAULTS if no overrides provided', async () => {
    // maxAgentIterations and inlineCompletion.enabled are provided in JSON but should be ignored by the new processConfig
    const rawJson = JSON.stringify({
      activeChatProfile: 'provider1',
      maxAgentIterations: 10,
      inlineCompletion: {
        enabled: false
      },
      profiles: {
        provider1: { model: 'gpt-4', apiKey: 'key' }
      },
      anonymizer: { enabled: false, words: [] }
    });

    const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient);

    // It should NOT be 10 or false, but the defaults
    expect(configContainer.config.maxAgentIterations).toBe(CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS);
    expect(configContainer.config.inlineCompletion.enabled).toBe(true);
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

    const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient, overrides);

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

    const configContainer: IConfigContainer = await configProcessor.processConfig({ default: rawJson }, mockISecretManager, eventBus, httpClient, overrides);

    expect(configContainer.config.anonymizer.enabled).toBe(true);
    expect(configContainer.config.anonymizer.words).toEqual(['json-word']); // Words from JSON preserved
  });

  it('should correctly merge two layers of configuration', async () => {
    const defaultRaw = JSON.stringify({
      activeChatProfile: 'defaultP',
      profiles: {
        'defaultP': { model: 'm-default', apiKey: 'k-default' },
        'sharedP': { model: 'm-default-shared', apiKey: 'k-default-shared' }
      },
      anonymizer: { enabled: false, words: ['nonsense'] }
    });

    const workspaceRaw = JSON.stringify({
      activeChatProfile: 'workspaceP',
      profiles: {
        'workspaceP': { model: 'm-workspace', apiKey: 'k-workspace' },
        'sharedP': { model: 'm-workspace-shared', apiKey: 'k-workspace-shared' }
      },
      anonymizer: { words: ['workspace-word'] }
    });

    const configs = {
      default: defaultRaw,
      workspaceJsonConfigFile: workspaceRaw
    };

    const configContainer = await configProcessor.processConfig(configs, mockISecretManager, eventBus, httpClient);
    const config = configContainer.config;

    // Profiles merge
    expect(config.profiles['defaultP']).toBeDefined();
    expect(config.profiles['workspaceP']).toBeDefined();
    expect(config.profiles['sharedP'].model).toBe('m-workspace-shared'); // Workspace overwrites default

    // activeChatProfile merge (Workspace wins)
    expect(config.activeChatProfile).toBe('workspaceP');

    // Anonymizer words merge (Workspace replaces default)
    expect(config.anonymizer.words).toEqual(['workspace-word']);
    expect(config.anonymizer.words).not.toContain('nonsense');
  });
});
