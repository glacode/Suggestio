import { describe, it, expect, jest } from '@jest/globals';
import { ProfileCommandHandler } from '../../../src/chat/commands/profileCommandHandler.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS } from '../../../src/constants/protocol.js';
import { createMockConfigProvider, createMockSecretManager, createMockHttpClient, createMockConfigContainer } from '../../testUtils.js';

describe('ProfileCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const configProvider = createMockConfigProvider();
        const secretManager = createMockSecretManager();
        const httpClient = createMockHttpClient();
        const configContainer = createMockConfigContainer();

        const handler = new ProfileCommandHandler({
            configProvider,
            secretManager,
            httpClient,
            configContainer,
            eventBus
        });

        return { handler, configProvider, secretManager, httpClient, configContainer, eventBus };
    };



    describe('canHandle', () => {
        it('should return true for profile-related commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle(WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.EDIT_API_KEY)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.DELETE_API_KEY)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.ADD_PROFILE)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.DELETE_PROFILE)).toBe(true);
        });

        it('should return false for non-profile commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle('unknownCommand')).toBe(false);
            expect(handler.canHandle(WEBVIEW_COMMANDS.SEND_MESSAGE)).toBe(false);
        });
    });

    describe('CHAT_PROFILE_CHANGED', () => {
        it('should update active chat profile and emit event', async () => {
            const { handler, configProvider, eventBus } = createDependencies();
            
            const emitSpy = jest.spyOn(eventBus, 'emit');
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED,
                model: 'test-profile'
            });

            expect(configProvider.updateConfig).toHaveBeenCalledWith('activeChatProfile', 'test-profile', true);
            expect(emitSpy).toHaveBeenCalledWith('chatProfileChanged', 'test-profile');
        });
    });

    describe('EDIT_API_KEY', () => {
        it('should update API key and refresh providers', async () => {
            const { handler, secretManager } = createDependencies();
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                identifier: 'test-key'
            });

            expect(secretManager.updateAPIKey).toHaveBeenCalledWith('test-key');
        });
    });

    describe('DELETE_API_KEY', () => {
        it('should delete API key and refresh providers', async () => {
            const { handler, secretManager } = createDependencies();
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.DELETE_API_KEY,
                identifier: 'test-key'
            });

            expect(secretManager.deleteSecret).toHaveBeenCalledWith('test-key');
        });
    });

    describe('ADD_PROFILE', () => {
        it('should add new profile to configuration', async () => {
            const { handler, configProvider } = createDependencies();
            
            configProvider.getProfiles.mockReturnValue({});
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.ADD_PROFILE,
                profile: {
                    id: 'new-profile',
                    model: 'test-model',
                    apiKeyIdentifier: 'test-key'
                }
            });

            expect(configProvider.updateConfig).toHaveBeenCalledWith('profiles', {
                'new-profile': {
                    model: 'test-model',
                    apiKeyIdentifier: 'test-key'
                }
            }, true);
        });
    });

    describe('DELETE_PROFILE', () => {
        it('should delete profile from configuration', async () => {
            const { handler, configProvider } = createDependencies();
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.DELETE_PROFILE,
                profileId: 'profile-to-delete'
            });

            expect(configProvider.deleteProfile).toHaveBeenCalledWith('profile-to-delete');
        });
    });
});