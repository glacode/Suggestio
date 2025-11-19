
import { _electron as electron } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export async function launchVscode() {
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.106.2');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-'));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-extensions-'));

    const electronApp = await electron.launch({
        executablePath: vscodeExecutablePath,
        args: [
            `--extensionDevelopmentPath=${process.cwd()}`,
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            // '--disable-extensions' // This would disable our extension
        ]
    });

    return { electronApp, userDataDir, extensionsDir };
}
