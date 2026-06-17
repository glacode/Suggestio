import { describe, it, expect, jest } from '@jest/globals';
import { ChatWebviewEventBridge } from '../../src/chat/chatWebviewEventBridge.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { EXTENSION_EVENTS, MESSAGE_SENDERS } from '../../src/constants/protocol.js';
import type { IToolUiProvider, MessageFromTheExtensionToTheWebview } from '../../src/types.js';
import { createMockWebview, createMockWebviewView } from '../testUtils.js';

describe('ChatWebviewEventBridge', () => {
    const createMockToolUiProvider = (): IToolUiProvider => ({
        getToolUI: jest.fn<any>().mockReturnValue({ displayMessage: 'display', uiOptions: {} }),
        enrichHistory: jest.fn<any>()
    });

    it('forwards agent:token to webview', async () => {
        const eventBus = new EventBus();
        const toolUiProvider = createMockToolUiProvider();
        const bridge = new ChatWebviewEventBridge(eventBus, toolUiProvider);
        const posted: MessageFromTheExtensionToTheWebview[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        bridge.setView(webviewView);
        eventBus.emit('agent:token', { token: 'hello', type: 'content' });

        expect(posted).toContainEqual({
            sender: MESSAGE_SENDERS.ASSISTANT,
            type: EXTENSION_EVENTS.TOKENS,
            text: 'hello',
            tokenType: 'content'
        });
    });

    it('respects abortController for tokens', async () => {
        const eventBus = new EventBus();
        const toolUiProvider = createMockToolUiProvider();
        const bridge = new ChatWebviewEventBridge(eventBus, toolUiProvider);
        const posted: MessageFromTheExtensionToTheWebview[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);
        const abortController = new AbortController();

        bridge.setView(webviewView);
        bridge.setAbortControllerAccessor(() => abortController);

        abortController.abort();
        eventBus.emit('agent:token', { token: 'hello', type: 'content' });

        expect(posted).toHaveLength(0);
    });

    it('manages active diffs', async () => {
        const eventBus = new EventBus();
        const toolUiProvider = createMockToolUiProvider();
        const bridge = new ChatWebviewEventBridge(eventBus, toolUiProvider);
        const diffData = { oldContent: 'old', newContent: 'new', filePath: 'file' };

        eventBus.emit('agent:requestConfirmation', {
            toolCallId: 'call1',
            toolName: 'tool',
            message: 'msg',
            diffData
        });

        expect(bridge.getActiveDiff('call1')).toEqual(diffData);

        eventBus.emit('agent:toolEnd', {
            toolCallId: 'call1',
            toolName: 'tool',
            result: 'res',
            success: true
        });

        expect(bridge.getActiveDiff('call1')).toBeUndefined();
    });

    it('forwards notifications', () => {
        const eventBus = new EventBus();
        const toolUiProvider = createMockToolUiProvider();
        const bridge = new ChatWebviewEventBridge(eventBus, toolUiProvider);
        const posted: MessageFromTheExtensionToTheWebview[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        bridge.setView(webviewView);
        bridge.sendNotification('test-notif');

        expect(posted).toContainEqual({
            sender: MESSAGE_SENDERS.ASSISTANT,
            type: EXTENSION_EVENTS.NOTIFICATION,
            text: 'test-notif'
        });
    });
});
