
import { _electron as electron } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export async function launchVscode(workspacePath?: string) {
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.106.2');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-'));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-extensions-'));

    const args = [
        '--no-sandbox',
        '--disable-gpu',
        `--extensionDevelopmentPath=${process.cwd()}`,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        '--disable-workspace-trust',
        '--disable-extensions',
        // Exposes port 9229 so the "Attach to Extension Host" launch config can connect and hit breakpoints within the extension.
        // Also add a couple of explicit inspect flags to make the debug port easier to find.
        // Try --inspect-brk to pause the main process and --inspect-brk-extensions to pause extension hosts.
        // '--inspect-brk=9229',
        // '--inspect=9229',
        '--inspect-extensions=9229'
        // use the arg below if you want to break on the first line of extension code (useful for debugging extension activation issues)
        // '--inspect-brk-extensions=9229'
    ];

    if (workspacePath) {
        args.push(workspacePath);
    }

    const electronApp = await electron.launch({
        executablePath: vscodeExecutablePath,
        args: args
    });

    // Print the args so you can confirm the inspect flags were passed when Playwright launches VS Code.
    // This line will appear in the Playwright test output.
    console.log('Launched VS Code with args:', args.join(' '));

    return { electronApp, userDataDir, extensionsDir };
}
