import { describe, it, expect, jest } from '@jest/globals';
import { ChatWebviewViewManager } from '../../src/chat/chatWebviewViewManager.js';
import {
    createMockConfigContainer,
    createMockPersistentHistoryManager,
    createMockVscodeApi,
    createMockWebview,
    createMockWebviewView,
    createMockSecretManager,
    createMockFileContentReader,
    createMockExtensionContextMinimal
} from '../testUtils.js';
import { ProfileMetadataProvider } from '../../src/chat/profileMetadataProvider.js';
import { EXTENSION_COMMANDS } from '../../src/constants/protocol.js';
import type { GetChatWebviewContent } from '../../src/types.js';

describe('ChatWebviewViewManager', () => {
    const createDependencies = () => {
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const secretManager = createMockSecretManager();
        const profileMetadataProvider = new ProfileMetadataProvider({ getChatProfiles: () => [], getActiveChatProfile: () => '' }, configContainer, secretManager);
        const getChatWebviewContent = jest.fn<GetChatWebviewContent>().mockReturnValue('<html></html>');
        const vscodeApi = createMockVscodeApi();
        const fileReader = createMockFileContentReader();
        const chatHistoryManager = createMockPersistentHistoryManager();
        const extensionContext = createMockExtensionContextMinimal();

        const manager = new ChatWebviewViewManager(
            extensionContext,
            profileMetadataProvider,
            getChatWebviewContent,
            vscodeApi,
            fileReader,
            configContainer,
            chatHistoryManager
        );

        return { manager, getChatWebviewContent, webview: createMockWebview(), webviewView: createMockWebviewView(createMockWebview()) };
    };

    it('updates webview html when updateState is called', async () => {
        const { manager, getChatWebviewContent } = createDependencies();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        manager.setView(webviewView);
        await manager.updateState();

        expect(webview.html).toBe('<html></html>');
        expect(getChatWebviewContent).toHaveBeenCalled();
    });

    it('posts NEW_CHAT message when newChat is called', () => {
        const { manager } = createDependencies();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        manager.setView(webviewView);
        manager.newChat();

        expect(posted).toContainEqual({ command: EXTENSION_COMMANDS.NEW_CHAT });
    });
});
