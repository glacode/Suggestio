import type { ICommandAutoAcceptManager } from '../types.js';

export class CommandAutoAcceptManager implements ICommandAutoAcceptManager {
    private allowedCommands = new Set<string>();

    allowCommand(command: string): void {
        if (command) {
            this.allowedCommands.add(command);
        }
    }

    isAllowed(command: string): boolean {
        return this.allowedCommands.has(command);
    }

    clear(): void {
        this.allowedCommands.clear();
    }
}
