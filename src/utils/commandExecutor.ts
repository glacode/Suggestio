import { exec } from 'child_process';
import { ICommandExecutor, ICommandResult } from '../types.js';

/**
 * Minimal interface for the shell execution function.
 * Matches Node's child_process.exec signature.
 */
export type ExecFunction = (
    command: string, 
    options: any, 
    callback: (error: any, stdout: string, stderr: string) => void
) => any;

/**
 * Concrete implementation of ICommandExecutor using Node.js child_process.exec.
 */
export class NodeCommandExecutor implements ICommandExecutor {
    /**
     * @param execFn The actual shell execution function. Defaults to child_process.exec.
     */
    constructor(private execFn: ExecFunction = exec) {}

    /**
     * Executes a shell command and returns its output and exit code.
     * 
     * @param command The shell command string to execute.
     * @param options Execution options including working directory and cancellation signal.
     * @returns A promise resolving to the command result.
     */
    async execute(command: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<ICommandResult> {
        return new Promise((resolve) => {
            const childProcess = this.execFn(command, { 
                cwd: options?.cwd,
                signal: options?.signal 
            }, (error, stdout, stderr) => {
                const exitCode = error ? (error.code ?? null) : 0;

                resolve({
                    stdout,
                    stderr,
                    exitCode: typeof exitCode === 'number' ? exitCode : null
                });
            });

            if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                    if (childProcess && typeof childProcess.kill === 'function') {
                        childProcess.kill();
                    }
                }, { once: true });
            }
        });
    }
}
