import { ICommandValidator, IValidationResult } from '../types.js';

/**
 * Validator that blocks potentially dangerous shell commands using regex patterns.
 */
export class CommandBlacklistValidator implements ICommandValidator {
    /**
     * List of forbidden command patterns and the reasons for blocking them.
     */
    private readonly blacklist = [
        {
            pattern: /\.git\b/i,
            reason: "Modifying or deleting the .git directory is prohibited to protect project history."
        },
        {
            pattern: /\brm\b.*\B\/(?!\w)|\brm\b.*\b\.\s*$/i, // rm -rf / or rm -rf .
            reason: "Deleting the system root or workspace root directory is prohibited."
        },
        {
            pattern: /\bsudo\b|\bsu\b/i,
            reason: "Privilege escalation (sudo/su) is prohibited for security reasons."
        },
        {
            pattern: /\bchmod\b|\bchown\b/i,
            reason: "Modifying file permissions or ownership is prohibited."
        },
        {
            pattern: /\|\s*(bash|sh|zsh|powershell|pwsh)\b/i,
            reason: "Piping commands directly into a shell is prohibited to prevent remote execution exploits."
        },
        {
            pattern: /\b(kill|pkill|killall)\b/i,
            reason: "Terminating processes is prohibited."
        },
        {
            pattern: /\b(mkfs|fdisk|parted)\b/i,
            reason: "Disk manipulation commands are prohibited."
        }
    ];

    /**
     * Validates a shell command against the blacklist.
     * 
     * @param command The shell command to validate.
     * @returns A validation result.
     */
    validate(command: string): IValidationResult {
        const trimmedCommand = command.trim();
        
        if (!trimmedCommand) {
            return { allowed: false, reason: "Command cannot be empty." };
        }

        for (const rule of this.blacklist) {
            if (rule.pattern.test(trimmedCommand)) {
                return { 
                    allowed: false, 
                    reason: rule.reason 
                };
            }
        }

        return { allowed: true };
    }
}
