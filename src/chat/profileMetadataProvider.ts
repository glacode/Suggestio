import type {
    ILlmProviderAccessor,
    IConfigContainer,
    ProfileMetadata,
    IProfileMetadataProvider
} from '../types.js';
import type { ISecretManager } from '../config/configProcessor.js';

/**
 * `ProfileMetadataProvider` handles the logic for gathering, filtering, and sorting
 * LLM profile information to be used by the chat UI.
 */
export class ProfileMetadataProvider implements IProfileMetadataProvider {
    private readonly _profileAccessor: ILlmProviderAccessor;
    private readonly _configContainer: IConfigContainer;
    private readonly _secretManager: ISecretManager;

    constructor(
        profileAccessor: ILlmProviderAccessor,
        configContainer: IConfigContainer,
        secretManager: ISecretManager
    ) {
        this._profileAccessor = profileAccessor;
        this._configContainer = configContainer;
        this._secretManager = secretManager;
    }

    /**
     * Consolidates gathering of LLM profile information, applying sorting by origin priority
     * to both the full metadata list and the chat-eligible profiles list.
     */
    public async getStateData() {
        const eligibleChatProfileIds = this._profileAccessor.getChatProfiles();
        const activeChatProfileId = this._profileAccessor.getActiveChatProfile();

        // allProfileIds should include all models (not only tool-enabled).
        const allProfileIds = typeof this._profileAccessor.getCompletionProfiles === 'function'
            ? this._profileAccessor.getCompletionProfiles()!
            : eligibleChatProfileIds;

        const activeCompletionProfileId = typeof this._profileAccessor.getCompletionActiveProfile === 'function'
            ? this._profileAccessor.getCompletionActiveProfile!()
            : (this._configContainer.config.activeCompletionProfile || activeChatProfileId);

        const profileMetadata = await this._getProfileMetadata(allProfileIds, activeChatProfileId, activeCompletionProfileId);

        // Ensure the chat dropdown (chatProfileIds) follows the same sorted order as the metadata
        const sortedChatProfileIds = profileMetadata
            .filter(m => eligibleChatProfileIds.includes(m.id))
            .map(m => m.id);

        return {
            chatProfileIds: sortedChatProfileIds,
            activeChatProfileId,
            allProfileIds,
            activeCompletionProfileId,
            profileMetadata
        };
    }

    private async _getProfileMetadata(completionProfiles: string[], activeProfile: string, activeCompletionProfile: string) {
        const metadata = await Promise.all(completionProfiles.map(async (id) => {
            const profile = this._configContainer.config.profiles[id];
            const isApiKeyRequired = profile?.isApiKeyRequired !== false;
            const identifier = profile?.apiKeyIdentifier;
            
            const hasApiKey = (isApiKeyRequired && identifier) ? !!(await this._secretManager.getSecret(identifier)) : false;

            return {
                id,
                model: profile?.model || '',
                endpoint: profile?.endpoint || '',
                needsApiKey: isApiKeyRequired,
                hasApiKey,
                apiKeyIdentifier: identifier,
                origin: profile?.origin || 'bundled',
                supportsTools: profile?.supportsTools !== false,
                excludeFromChat: profile?.excludeFromChat === true,
                isActiveChat: id === activeProfile,
                isActiveCompletion: id === activeCompletionProfile
            };
        }));

        return this._sortProfileMetadata(metadata);
    }

    private _sortProfileMetadata(metadata: ProfileMetadata[]): ProfileMetadata[] {
        // Sort by origin priority: project (0) > user (1) > bundled (2)
        const originPriority: Record<string, number> = { 'project': 0, 'user': 1, 'bundled': 2 };

        return metadata.sort((a, b) => {
            const priorityA = originPriority[a.origin] ?? 3;
            const priorityB = originPriority[b.origin] ?? 3;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Secondary sort: alphabetical by ID
            return a.id.localeCompare(b.id);
        });
    }
}
