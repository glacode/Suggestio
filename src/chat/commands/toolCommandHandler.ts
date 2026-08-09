import type {
    IDiffManager,
    IChatWebviewEventBridge,
    IVscodeApiLocal,
    WebviewMessage
} from '../../types.js';
import { WEBVIEW_COMMANDS, APP_EVENTS } from '../../constants/protocol.js';
import { IWebviewCommandHandler, ICommandContext } from '../chatCommandHandler.js';

/**
 * Arguments for the ToolCommandHandler constructor.
 */
export interface IToolCommandHandlerArgs {
    diffManager: IDiffManager;
    eventBridge: IChatWebviewEventBridge;
    vscodeApi: IVscodeApiLocal;
    eventBus: any; // IEventBus type
}

/**
 * Handles tool-related commands: CONFIRM_TOOL_CALL, VIEW_DIFF.
 */
export class ToolCommandHandler implements IWebviewCommandHandler {
    private readonly _diffManager: IDiffManager;
    private readonly _eventBridge: IChatWebviewEventBridge;
    private readonly _vscodeApi: IVscodeApiLocal;
    private readonly _eventBus: any;

    constructor({
        diffManager,
        eventBridge,
        vscodeApi,
        eventBus
    }: IToolCommandHandlerArgs) {
        this._diffManager = diffManager;
        this._eventBridge = eventBridge;
        this._vscodeApi = vscodeApi;
        this._eventBus = eventBus;
    }

    canHandle(command: string): boolean {
        return command === WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL
            || command === WEBVIEW_COMMANDS.VIEW_DIFF;
    }

    async handle(message: WebviewMessage, _ctx: ICommandContext): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL) {
            await this._handleConfirmToolCall(message);
        } else if (message.command === WEBVIEW_COMMANDS.VIEW_DIFF) {
            await this._handleViewDiff(message);
        }
    }

    private async _handleConfirmToolCall(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL }>): Promise<void> {
        if (message.decision === 'always-allow-edit') {
            await this._vscodeApi.commands.executeCommand('suggestio.enableAutoAcceptEdits');
        }
        if (message.decision === 'deny') {
            const diffData = this._eventBridge.getActiveDiff(message.toolCallId);
            if (diffData) {
                await this._diffManager.closeDiff(diffData.filePath);
            }
        }
        this._eventBus.emit(APP_EVENTS.USER_CONFIRMATION_RESPONSE, {
            toolCallId: message.toolCallId,
            decision: message.decision
        });
    }

    private async _handleViewDiff(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.VIEW_DIFF }>): Promise<void> {
        const diffData = this._eventBridge.getActiveDiff(message.toolCallId);
        if (diffData) {
            await this._diffManager.showDiff(diffData.filePath, diffData.oldContent, diffData.newContent);
        }
    }
}
