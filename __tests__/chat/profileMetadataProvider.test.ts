import { describe, it, expect } from '@jest/globals';
import { ProfileMetadataProvider } from '../../src/chat/profileMetadataProvider.js';
import type { ILlmProviderAccessor } from '../../src/types.js';
import type { ISecretManager } from '../../src/config/configProcessor.js';
import { createMockConfigContainer } from '../testUtils.js';

describe('ProfileMetadataProvider', () => {
    const createMockAccessor = (overrides: Partial<ILlmProviderAccessor> = {}): ILlmProviderAccessor => ({
        getChatProfiles: () => ['chat-1', 'chat-2'],
        getActiveChatProfile: () => 'chat-1',
        getCompletionProfiles: () => ['chat-1', 'chat-2', 'comp-1'],
        getCompletionActiveProfile: () => 'chat-1',
        ...overrides
    });

    const createMockSecretManager = (): ISecretManager => ({
        getSecret: async (id) => id === 'key-1' ? 'secret-1' : undefined,
        getOrRequestAPIKey: async () => '',
        updateAPIKey: async () => { },
        deleteSecret: async () => { }
    });

    it('returns sorted and enriched state data', async () => {
        const accessor = createMockAccessor();
        const configContainer = createMockConfigContainer({
            profiles: {
                'chat-1': { model: 'm1', origin: 'bundled', apiKeyIdentifier: 'key-1' },
                'chat-2': { model: 'm2', origin: 'project' },
                'comp-1': { model: 'm3', origin: 'user' }
            },
            activeChatProfile: 'chat-1'
        });
        const secretManager = createMockSecretManager();

        const provider = new ProfileMetadataProvider(accessor, configContainer, secretManager);
        const data = await provider.getStateData();

        expect(data.activeChatProfileId).toBe('chat-1');
        expect(data.chatProfileIds).toEqual(['chat-2', 'chat-1']); // project > bundled
        expect(data.profileMetadata).toHaveLength(3);
        
        const m1 = data.profileMetadata.find(m => m.id === 'chat-1');
        expect(m1?.hasApiKey).toBe(true);
        expect(m1?.origin).toBe('bundled');
        expect(m1?.isActiveChat).toBe(true);

        const m2 = data.profileMetadata.find(m => m.id === 'chat-2');
        expect(m2?.origin).toBe('project');
        expect(m2?.isActiveChat).toBe(false);
    });

    it('handles missing completion profiles accessor methods', async () => {
        const accessor: ILlmProviderAccessor = {
            getChatProfiles: () => ['chat-1'],
            getActiveChatProfile: () => 'chat-1'
        };
        const configContainer = createMockConfigContainer({
            profiles: {
                'chat-1': { model: 'm1', origin: 'bundled' }
            }
        });
        const secretManager = createMockSecretManager();

        const provider = new ProfileMetadataProvider(accessor, configContainer, secretManager);
        const data = await provider.getStateData();

        expect(data.allProfileIds).toEqual(['chat-1']);
        expect(data.activeCompletionProfileId).toBe('chat-1');
    });

    it('sorts alphabetically within same origin', async () => {
        const accessor = createMockAccessor({
            getChatProfiles: () => ['b', 'a'],
            getCompletionProfiles: () => ['b', 'a']
        });
        const configContainer = createMockConfigContainer({
            profiles: {
                'a': { origin: 'project', model: 'ma' },
                'b': { origin: 'project', model: 'mb' }
            }
        });
        const secretManager = createMockSecretManager();

        const provider = new ProfileMetadataProvider(accessor, configContainer, secretManager);
        const data = await provider.getStateData();

        expect(data.chatProfileIds).toEqual(['a', 'b']);
    });
});
