import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { NodeCommandExecutor, SpawnFunction } from '../../src/utils/commandExecutor.js';
import { EventEmitter } from 'events';

describe('NodeCommandExecutor', () => {
    let executor: NodeCommandExecutor;
    let mockSpawn: jest.Mock<SpawnFunction>;

    class MockChildProcess extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        kill = jest.fn();
    }

    beforeEach(() => {
        mockSpawn = jest.fn<SpawnFunction>();
        executor = new NodeCommandExecutor(mockSpawn);
    });

    it('should return stdout and exitCode 0 on success', async () => {
        const mockChild = new MockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const executePromise = executor.execute('echo hello');

        // Simulate data and close
        mockChild.stdout.emit('data', Buffer.from('success output'));
        mockChild.emit('close', 0);

        const result = await executePromise;

        expect(result).toEqual({
            stdout: 'success output',
            stderr: '',
            exitCode: 0
        });
        
        // Check if spawn was called correctly with shell wrapping
        const isWindows = process.platform === 'win32';
        const expectedShell = isWindows ? 'cmd' : '/bin/sh';
        const expectedArgs = isWindows ? ['/c', 'echo hello'] : ['-c', 'echo hello'];
        
        expect(mockSpawn).toHaveBeenCalledWith(expectedShell, expectedArgs, expect.any(Object));
    });

    it('should invoke onStdout callback', async () => {
        const mockChild = new MockChildProcess();
        mockSpawn.mockReturnValue(mockChild);
        const onStdout = jest.fn();

        const executePromise = executor.execute('echo hello', { onStdout });

        mockChild.stdout.emit('data', Buffer.from('part 1'));
        mockChild.stdout.emit('data', Buffer.from(' part 2'));
        mockChild.emit('close', 0);

        const result = await executePromise;

        expect(onStdout).toHaveBeenCalledWith('part 1');
        expect(onStdout).toHaveBeenCalledWith(' part 2');
        expect(result.stdout).toBe('part 1 part 2');
    });

    it('should return stderr and non-zero exitCode on failure', async () => {
        const mockChild = new MockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const executePromise = executor.execute('invalid-cmd');

        mockChild.stderr.emit('data', Buffer.from('error output'));
        mockChild.emit('close', 127);

        const result = await executePromise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'error output',
            exitCode: 127
        });
    });

    it('should kill the process when AbortSignal is triggered', async () => {
        const mockChild = new MockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const controller = new AbortController();
        const executePromise = executor.execute('long-running', { signal: controller.signal });

        controller.abort();
        
        expect(mockChild.kill).toHaveBeenCalled();
        
        // Finish the promise
        mockChild.emit('close', null);
        await executePromise;
    });

    it('should pass cwd to spawn', async () => {
        const mockChild = new MockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const executePromise = executor.execute('cmd', { cwd: '/test/path' });
        mockChild.emit('close', 0);
        await executePromise;

        expect(mockSpawn).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Array),
            expect.objectContaining({ cwd: '/test/path' })
        );
    });
});
