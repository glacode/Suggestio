import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { RunCommandTool } from '../../src/tools/runCommandTool.js';
import { IWorkspaceProvider, ICommandExecutor, IEventBus, IUserConfirmationPayload, ICommandValidator } from '../../src/types.js';
import { AGENT_MESSAGES } from '../../src/constants/messages.js';
import { createMockWorkspaceProvider, createMockEventBus } from '../testUtils.js';

describe('RunCommandTool', () => {
    let tool: RunCommandTool;
    let mockWorkspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let mockCommandExecutor: jest.Mocked<ICommandExecutor>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockValidator: jest.Mocked<ICommandValidator>;

    beforeEach(() => {
        mockWorkspaceProvider = createMockWorkspaceProvider();
        mockWorkspaceProvider.rootPath.mockReturnValue('/mock/root');

        mockCommandExecutor = {
            execute: jest.fn<ICommandExecutor['execute']>()
        };

        mockEventBus = createMockEventBus();

        mockValidator = {
            validate: jest.fn<ICommandValidator['validate']>().mockReturnValue({ allowed: true })
        };

        tool = new RunCommandTool(mockWorkspaceProvider, mockCommandExecutor, mockEventBus, mockValidator);
    });

    it('should return error if no workspace root', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue(undefined);
        const result = await tool.execute({ command: 'ls' });
        expect(result).toEqual({
            content: AGENT_MESSAGES.ERROR_NO_WORKSPACE,
            success: false
        });
    });

    it('should block execution if validator fails', async () => {
        const command = 'rm -rf .git';
        mockValidator.validate.mockReturnValue({ allowed: false, reason: 'Protected' });

        const result = await tool.execute({ command });

        expect(mockValidator.validate).toHaveBeenCalledWith(command);
        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.content).toContain('Security Error');
        expect(result.content).toContain('Protected');
    });

    it('should request user confirmation and proceed if allowed', async () => {
        const toolCallId = 'test-call-id';
        const command = 'npm test';
        
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        mockEventBus.on.mockImplementation((event: string, callback: any) => {
            if (event === 'user:confirmationResponse') {
                userResponseCallback = callback;
            }
            return { dispose: jest.fn() };
        });

        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:requestConfirmation' && payload.toolCallId === toolCallId) {
                setImmediate(() => {
                    if (userResponseCallback) {
                        userResponseCallback({ toolCallId, decision: 'allow' });
                    }
                });
            }
            return true;
        });

        mockCommandExecutor.execute.mockResolvedValue({
            stdout: 'Tests passed',
            stderr: '',
            exitCode: 0
        });

        const result = await tool.execute({ command }, undefined, toolCallId);

        expect(mockValidator.validate).toHaveBeenCalledWith(command);
        expect(mockEventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            toolCallId,
            message: expect.stringContaining(command)
        }));
        expect(mockCommandExecutor.execute).toHaveBeenCalledWith(command, expect.objectContaining({ cwd: '/mock/root' }));
        expect(result).toEqual({
            content: 'Tests passed',
            success: true
        });
    });

    it('should return error if user denies confirmation', async () => {
        const toolCallId = 'test-call-id';
        const command = 'npm test';
        
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        mockEventBus.on.mockImplementation((event: string, callback: any) => {
            if (event === 'user:confirmationResponse') {
                userResponseCallback = callback;
            }
            return { dispose: jest.fn() };
        });

        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:requestConfirmation' && payload.toolCallId === toolCallId) {
                setImmediate(() => {
                    if (userResponseCallback) {
                        userResponseCallback({ toolCallId, decision: 'deny' });
                    }
                });
            }
            return true;
        });

        const result = await tool.execute({ command }, undefined, toolCallId);

        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.content).toContain('User denied permission');
    });

    it('should include stderr and exit code in output on failure', async () => {
        const command = 'invalid-cmd';
        
        mockCommandExecutor.execute.mockResolvedValue({
            stdout: 'partial output',
            stderr: 'command not found',
            exitCode: 127
        });

        const result = await tool.execute({ command });

        expect(result.success).toBe(false);
        expect(result.content).toContain('partial output');
        expect(result.content).toContain('STDERR:');
        expect(result.content).toContain('command not found');
        expect(result.content).toContain('exit code: 127');
    });

    it('should handle execution exceptions', async () => {
        mockCommandExecutor.execute.mockRejectedValue(new Error('Spawn failed'));

        const result = await tool.execute({ command: 'ls' });

        expect(result.success).toBe(false);
        expect(result.content).toContain('Error executing command: Spawn failed');
    });
});
