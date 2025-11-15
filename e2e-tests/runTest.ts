import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

// TypeScript may complain that __dirname/__filename don't exist in ESM context
declare const __dirname: string;
declare const __filename: string;

async function main() {
    let testWorkspace: string | undefined;
    try {
        // Create a temporary directory for the test workspace
        testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-test-workspace-'));

        // Folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = process.cwd();

        // Path to the compiled test file
        const extensionTestsPath = path.resolve(__dirname, './suite/index.cjs');

        // Run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspace, // Open the temporary workspace
                '--enable-proposed-api=suggestio',
                '--disable-extensions', // Disable all other extensions for a clean test environment
                '--force-user-env',
                '--settings', '{"editor.inlineSuggest.enabled": true}'
            ],
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    } finally {
        // Clean up the temporary workspace
        if (testWorkspace && fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    }
}

main();
