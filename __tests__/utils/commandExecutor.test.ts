import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { NodeCommandExecutor, ExecFunction } from '../../src/utils/commandExecutor.js';

describe('NodeCommandExecutor', () => {
    let executor: NodeCommandExecutor;
    let mockExec: jest.Mock<ExecFunction>;

    beforeEach(() => {
        mockExec = jest.fn<ExecFunction>();
        executor = new NodeCommandExecutor(mockExec);
    });

    it('should return stdout and exitCode 0 on success', async () => {
        mockExec.mockImplementation((_cmd, _opts, callback) => {
            callback(null, 'success output', '');
            return { kill: jest.fn() };
        });

        const result = await executor.execute('echo hello');

        expect(result).toEqual({
            stdout: 'success output',
            stderr: '',
            exitCode: 0
        });
        expect(mockExec).toHaveBeenCalledWith('echo hello', expect.any(Object), expect.any(Function));
    });

    it('should return stderr and non-zero exitCode on failure', async () => {
        const error = new Error('failed');
        // Use Object.assign to avoid 'as any' while adding the code property
        Object.assign(error, { code: 127 });
        
        mockExec.mockImplementation((_cmd, _opts, callback) => {
            callback(error, '', 'error output');
            return { kill: jest.fn() };
        });

        const result = await executor.execute('invalid-cmd');

        expect(result).toEqual({
            stdout: '',
            stderr: 'error output',
            exitCode: 127
        });
    });

    it('should kill the process when AbortSignal is triggered', async () => {
        const mockKill = jest.fn();
        mockExec.mockImplementation(() => {
            return { kill: mockKill };
        });

        const controller = new AbortController();
        const executePromise = executor.execute('long-running', { signal: controller.signal });

        controller.abort();
        
        // We need to resolve the promise to finish the test
        const callback = mockExec.mock.calls[0][2];
        callback(new Error('Killed'), '', '');

        await executePromise;
        expect(mockKill).toHaveBeenCalled();
    });

    it('should pass cwd to exec', async () => {
        mockExec.mockImplementation((_cmd, _opts, callback) => {
            callback(null, '', '');
            return { kill: jest.fn() };
        });

        await executor.execute('cmd', { cwd: '/test/path' });

        expect(mockExec).toHaveBeenCalledWith(
            'cmd',
            expect.objectContaining({ cwd: '/test/path' }),
            expect.any(Function)
        );
    });
});
