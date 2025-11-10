import * as path from 'path';
import { runTests } from '@vscode/test-electron';

// TypeScript may complain that __dirname/__filename don't exist in ESM context
declare const __dirname: string;
declare const __filename: string;

async function main() {
    try {
        // Folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = process.cwd();

        // Path to the compiled test file
        const extensionTestsPath = path.resolve(__dirname, './suite/index.cjs');

        // Run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
