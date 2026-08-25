import { describe, it, expect, jest } from '@jest/globals';
import { ToolCommandHandler } from '../../../src/chat/commandHandlers/toolCommandHandler.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS, APP_EVENTS } from '../../../src/constants/protocol.js';
import { createMockDiffManager, createMockVscodeApi, createMockWebviewView, createMockWebview, createMockEventBridge, createMockChatWebviewView, createMockCommandContext } from '../../testUtils.js';

describe('ToolCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const diffManager = createMockDiffManager();
        const eventBridge = createMockEventBridge();
        const vscodeApi = createMockVscodeApi();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);
        const view = createMockChatWebviewView();

        const handler = new ToolCommandHandler({
            diffManager,
            eventBridge,
            vscodeApi,
            eventBus
        });

        return { handler, diffManager, eventBridge, vscodeApi, webviewView, webview, eventBus, view };
    };

    describe('canHandle', () => {
        it('should return true for tool-related commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle(WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.VIEW_DIFF)).toBe(true);
        });

        it('should return false for non-tool commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle('unknownCommand')).toBe(false);
            expect(handler.canHandle(WEBVIEW_COMMANDS.SEND_MESSAGE)).toBe(false);
            expect(handler.canHandle(WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED)).toBe(false);
        });
    });

    describe('CONFIRM_TOOL_CALL', () => {
        it('should handle always-allow-edit decision', async () => {
            const { handler, vscodeApi, webviewView, view } = createDependencies();
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL,
                decision: 'always-allow-edit',
                toolCallId: 'test-tool-call'
            }, createMockCommandContext({ view, webviewView }));

            expect(vscodeApi.commands.executeCommand).toHaveBeenCalledWith('suggestio.enableAutoAcceptEdits');
        });

        it('should handle deny decision and close diff', async () => {
            const { handler, diffManager, eventBridge, webviewView, view } = createDependencies();
            
            const mockDiffData = {
                filePath: 'test-file.txt',
                oldContent: 'old content',
                newContent: 'new content'
            };
            
            eventBridge.getActiveDiff = jest.fn<(_id: string) => { oldContent: string; newContent: string; filePath: string; } | undefined>().mockReturnValue(mockDiffData);
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL,
                decision: 'deny',
                toolCallId: 'test-tool-call'
            }, createMockCommandContext({ view, webviewView }));

            expect(eventBridge.getActiveDiff).toHaveBeenCalledWith('test-tool-call');
            expect(diffManager.closeDiff).toHaveBeenCalledWith('test-file.txt');
        });

        it('should emit user confirmation response event', async () => {
            const { handler, eventBus, webviewView, view } = createDependencies();
            
            const emitSpy = jest.spyOn(eventBus, 'emit');
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL,
                decision: 'allow',
                toolCallId: 'test-tool-call'
            }, createMockCommandContext({ view, webviewView }));

            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.USER_CONFIRMATION_RESPONSE, {
                toolCallId: 'test-tool-call',
                decision: 'allow'
            });
            
            emitSpy.mockRestore();
        });
    });

    describe('VIEW_DIFF', () => {
        it('should show diff when diff data is available', async () => {
            const { handler, diffManager, eventBridge, webviewView, view } = createDependencies();
            
            const mockDiffData = {
                filePath: 'test-file.txt',
                oldContent: 'old content',
                newContent: 'new content'
            };
            
            eventBridge.getActiveDiff = jest.fn<(_id: string) => { oldContent: string; newContent: string; filePath: string; } | undefined>().mockReturnValue(mockDiffData);
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.VIEW_DIFF,
                toolCallId: 'test-tool-call'
            }, createMockCommandContext({ view, webviewView }));

            expect(eventBridge.getActiveDiff).toHaveBeenCalledWith('test-tool-call');
            expect(diffManager.showDiff).toHaveBeenCalledWith('test-file.txt', 'old content', 'new content');
        });

        it('should not show diff when diff data is not available', async () => {
            const { handler, diffManager, eventBridge, webviewView, view } = createDependencies();
            
            eventBridge.getActiveDiff = jest.fn<(_id: string) => { oldContent: string; newContent: string; filePath: string; } | undefined>().mockReturnValue(undefined);
            
            await handler.handle({
                command: WEBVIEW_COMMANDS.VIEW_DIFF,
                toolCallId: 'test-tool-call'
            }, createMockCommandContext({ view, webviewView }));

            expect(eventBridge.getActiveDiff).toHaveBeenCalledWith('test-tool-call');
            expect(diffManager.showDiff).not.toHaveBeenCalled();
        });
    });
});
