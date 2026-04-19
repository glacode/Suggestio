import { spawn } from 'child_process';
import { ICommandExecutor, ICommandResult } from '../types.js';

/**
 * Minimal interface for the shell execution function.
 * Matches Node's child_process.spawn signature.
 */
export type SpawnFunction = (
    command: string,
    args: string[],
    options: any
) => any;

/**
 * Concrete implementation of ICommandExecutor using Node.js child_process.spawn.
 */
export class NodeCommandExecutor implements ICommandExecutor {
    /**
     * @param spawnFn The actual shell execution function. Defaults to child_process.spawn.
     */
    constructor(private spawnFn: SpawnFunction = spawn) {}

    /**
     * Executes a shell command and returns its output and exit code.
     * Supports streaming stdout and stderr via callbacks.
     * 
     * @param command The shell command string to execute.
     * @param options Execution options including working directory, cancellation signal and callbacks.
     * @returns A promise resolving to the command result.
     */
    async execute(command: string, options?: { 
        cwd?: string; 
        signal?: AbortSignal;
        onStdout?: (data: string) => void;
        onStderr?: (data: string) => void;
    }): Promise<ICommandResult> {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            
            // On Windows, we need to run via cmd /c for many commands
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd' : '/bin/sh';
            const shellArgs = isWindows ? ['/c', command] : ['-c', command];

            const childProcess = this.spawnFn(shell, shellArgs, { 
                cwd: options?.cwd,
                signal: options?.signal,
                shell: false // We are providing our own shell wrapping
            });

            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    options?.onStdout?.(chunk);
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    options?.onStderr?.(chunk);
                });
            }

            childProcess.on('close', (code: number | null) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code
                });
            });

            childProcess.on('error', (err: any) => {
                // If it's an AbortError, it might have been handled by the signal
                // but we should still ensure resolve happens if close doesn't fire
                resolve({
                    stdout,
                    stderr: stderr + (err.message ? `\nError: ${err.message}` : ''),
                    exitCode: err.code === 'ABORT_ERR' ? null : 1
                });
            });

            if (options?.signal) {
                if (options.signal.aborted) {
                    childProcess.kill();
                } else {
                    options.signal.addEventListener('abort', () => {
                        if (childProcess && typeof childProcess.kill === 'function') {
                            childProcess.kill();
                        }
                    }, { once: true });
                }
            }
        });
    }
}
