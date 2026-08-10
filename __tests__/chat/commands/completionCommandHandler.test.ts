import { describe, it, expect } from '@jest/globals';
import { CompletionCommandHandler } from '../../../src/chat/commands/completionCommandHandler.js';
import { WEBVIEW_COMMANDS } from '../../../src/constants/protocol.js';
import { APP_EVENTS } from '../../../src/constants/protocol.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { createMockConfigProvider } from '../../testUtils.js';

describe('CompletionCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const configProvider = createMockConfigProvider();
        
        const handler = new CompletionCommandHandler({
            configProvider,
            eventBus
        });

        return { handler, eventBus, configProvider };
    };

    it('can handle COMPLETION_PROFILE_CHANGED command', () => {
        const { handler } = createDependencies();
        
        expect(handler.canHandle(WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED)).toBe(true);
        expect(handler.canHandle(WEBVIEW_COMMANDS.SEND_MESSAGE)).toBe(false);
    });

    it('handles COMPLETION_PROFILE_CHANGED and emits event and updates config', async () => {
        const { handler, eventBus, configProvider } = createDependencies();
        
        const emittedEvents: any[] = [];
        eventBus.on(APP_EVENTS.COMPLETION_PROFILE_CHANGED, (model: string) => {
            emittedEvents.push({ event: APP_EVENTS.COMPLETION_PROFILE_CHANGED, model });
        });

        await handler.handle({
            command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED,
            model: 'test-profile-id'
        });

        expect(emittedEvents).toEqual([
            { event: APP_EVENTS.COMPLETION_PROFILE_CHANGED, model: 'test-profile-id' }
        ]);
        
        expect(configProvider.updateConfig).toHaveBeenCalledWith(
            'activeCompletionProfile',
            'test-profile-id',
            true
        );
    });


});