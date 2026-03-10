import { ICommandValidator, IValidationResult } from '../types.js';
import { ShellTokenizer } from './shellTokenizer.js';

/**
 * Validator that blocks potentially dangerous shell commands by tokenizing and analyzing them.
 */
export class CommandBlacklistValidator implements ICommandValidator {
    /**
     * Set of commands that are strictly prohibited at the start of a command or after a separator.
     */
    private readonly forbiddenCommands = new Map([
        // Unix/Linux/macOS
        ['sudo', "Privilege escalation (sudo/su) is prohibited for security reasons."],
        ['su', "Privilege escalation (sudo/su) is prohibited for security reasons."],
        ['chmod', "Modifying file permissions or ownership is prohibited."],
        ['chown', "Modifying file permissions or ownership is prohibited."],
        ['kill', "Terminating processes is prohibited."],
        ['pkill', "Terminating processes is prohibited."],
        ['killall', "Terminating processes is prohibited."],
        ['mkfs', "Disk manipulation commands are prohibited."],
        ['fdisk', "Disk manipulation commands are prohibited."],
        ['parted', "Disk manipulation commands are prohibited."],
        // Windows
        ['runas', "Privilege escalation (runas) is prohibited for security reasons."],
        ['icacls', "Modifying file permissions (icacls) is prohibited."],
        ['takeown', "Modifying file ownership (takeown) is prohibited."],
        ['taskkill', "Terminating processes (taskkill) is prohibited."],
        ['format', "Disk manipulation commands (format) are prohibited."],
        ['diskpart', "Disk manipulation commands (diskpart) are prohibited."]
    ]);

    /**
     * Shell interpreters that are prohibited to be piped into.
     */
    private readonly shellInterpreters = ['bash', 'sh', 'zsh', 'powershell', 'pwsh', 'cmd', 'cmd.exe'];

    /**
     * Command separators that indicate the start of a new command.
     */
    private readonly commandSeparators = [';', '&&', '||', '|'];

    /**
     * Validates a shell command against the blacklist using a tokenize-and-scan approach.
     * 
     * @param command The shell command to validate.
     * @returns A validation result.
     */
    validate(command: string): IValidationResult {
        const trimmedCommand = command.trim();
        
        if (!trimmedCommand) {
            return { allowed: false, reason: "Command cannot be empty." };
        }

        const tokens = ShellTokenizer.tokenize(trimmedCommand);

        // Rule: .git manipulation anywhere is prohibited
        if (tokens.some(token => token.toLowerCase().includes('.git'))) {
            return { 
                allowed: false, 
                reason: "Modifying or deleting the .git directory is prohibited to protect project history." 
            };
        }

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const isAtCommandStart = i === 0 || this.commandSeparators.includes(tokens[i - 1]);

            // Rule: Forbidden commands at start or after a separator
            if (isAtCommandStart) {
                const lowerToken = token.toLowerCase();
                let reason: string | undefined;

                for (const [cmd, r] of this.forbiddenCommands) {
                    if (lowerToken === cmd || lowerToken.startsWith(cmd + '.')) {
                        reason = r;
                        break;
                    }
                }

                if (reason) {
                    return { allowed: false, reason };
                }

                // Rule: Dangerous 'rm' or 'rd' (Windows) commands
                if (lowerToken === 'rm' || lowerToken === 'rd' || lowerToken === 'del') {
                    for (let j = i + 1; j < tokens.length && !this.commandSeparators.includes(tokens[j]); j++) {
                        const arg = tokens[j];
                        // Standalone / or . as arguments, or Windows drive root (e.g., C:\)
                        if (arg === '/' || arg === '.' || /^[a-zA-Z]:\\?$/.test(arg)) {
                            return { 
                                allowed: false, 
                                reason: "Deleting the system root or workspace root directory is prohibited." 
                            };
                        }
                    }
                }
            }

            // Rule: Piping into shell interpreters
            if (token === '|' && i + 1 < tokens.length) {
                const nextToken = tokens[i + 1].toLowerCase();
                if (this.shellInterpreters.includes(nextToken)) {
                    return { 
                        allowed: false, 
                        reason: "Piping commands directly into a shell is prohibited to prevent remote execution exploits." 
                    };
                }
            }
        }

        return { allowed: true };
    }
}
