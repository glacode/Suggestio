import { test, expect, Page } from '@playwright/test';
import { launchVscode } from './vscode-runner';
import { ElectronApplication } from 'playwright';
import express from 'express';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { openChatView } from './testUtils';

// -----------------------------------------------------------------------------
// Test State
// -----------------------------------------------------------------------------

let lastRequestBody: any = null;


// -----------------------------------------------------------------------------
// Helpers (Single-Responsibility)
// -----------------------------------------------------------------------------

function createTempWorkspace(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-workspace-'));
    return tempDir;
}

function writeMockConfig(workspace: string) {
    const mockConfig = {
        activeChatProfile: "testProvider",
        activeCompletionProfile: "testProvider",
        profiles: {
            testProvider: {
                endpoint: "http://localhost:3000/v1/completions",
                model: "test-model",
                isApiKeyRequired: false
            }
        },
        anonymizer: {
            words: ["john", "doe"],
            sensitiveData: {
                allowedEntropy: 0.85,
                minLength: 10000 // Effectively disable entropy-based anonymization for predictable test mapping
            }
        }
    };
    fs.writeFileSync(
        path.join(workspace, 'suggestio.config.json'),
        JSON.stringify(mockConfig, null, 2)
    );
}

function createMockServer(): Promise<Server> {
    return new Promise(resolve => {
        const app = express();
        app.use(express.json());

        app.post('/v1/completions', (req, res) => {
            lastRequestBody = req.body;
            res.json({
                choices: [
                    {
                        message: {
                            content: ' world',
                        },
                    },
                ],
            });
        });

        const server = app.listen(3000, () => resolve(server));
    });
}

async function focusEditor(page: Page) {
    // Wait for the editor container to be visible
    const editor = page.locator('.monaco-editor').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    
    // Force VS Code to focus the first editor group
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(200);
    
    // Click the editor to focus the cursor
    await editor.click();
    await page.waitForTimeout(200);
}

async function createNewFile(page: Page) {
    await page.keyboard.press('Control+N');
    await page.waitForTimeout(1000); // Increased for stability
}

async function clearEditor(page: Page) {
    await focusEditor(page);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500); // Increased for stability
}

// -----------------------------------------------------------------------------
// Main Test
// -----------------------------------------------------------------------------

test.describe('Inline Completion E2E', () => {
    let electronApp: ElectronApplication;
    let page: Page;
    let server: Server | null = null;
    let tempWorkspacePath: string;

    test.beforeAll(async () => {
        tempWorkspacePath = createTempWorkspace();
        writeMockConfig(tempWorkspacePath);
        server = await createMockServer();

        const result = await launchVscode(tempWorkspacePath, {
            'suggestio.experimental.anonymizer.enabled': true,
            'suggestio.inlineCompletion.supportedLanguages': ['plaintext', 'typescript'],
            'suggestio.inlineCompletion.enableInUntitledEditors': true
        });
        electronApp = result.electronApp;

        page = await electronApp.firstWindow();

        await openChatView(page);  // activates the extension
        await createNewFile(page); // open the single file we will reuse
    });

    test.afterAll(async () => {
        await electronApp?.close();
        server?.close();

        if (fs.existsSync(tempWorkspacePath)) {
            fs.rmSync(tempWorkspacePath, { recursive: true, force: true });
        }
    });

    test.beforeEach(async () => {
        lastRequestBody = null;
        await clearEditor(page);
    });

    test('should provide inline completion from a custom provider', async () => {
        // Simulate typing
        await page.keyboard.type('hello', { delay: 150 });

        // Allow debounce + mock server response + rendering
        await page.waitForTimeout(2000);

        // Accept the inline suggestion
        await page.keyboard.press('Tab');
        await page.waitForTimeout(1000);

        // Verify the final content
        const editor = page.locator('.view-line').first();
        await expect(editor).toHaveText('hello world');
    });

    test('should anonymize user data before sending to the provider', async () => {
        // Simulate typing
        await page.keyboard.type('hello john', { delay: 150 });

        // Allow debounce + mock server response + rendering
        await page.waitForTimeout(3000);
        
        // Accept the inline suggestion
        await page.keyboard.press('Tab');
        await page.waitForTimeout(1000);

        // Verify the final content
        expect(lastRequestBody).not.toBeNull();
        const content = lastRequestBody.messages[0].content;
        expect(content).toContain('hello ANON_0');
        expect(content).not.toContain('john');



        // Verify the final content
        const editor = page.locator('.view-line').first();
        await expect(editor).toHaveText('hello john world');
    });

    test('should toggle UI states correctly (inline completion and auto-accept edits)', async () => {
        // --- Inline Completion Toggle ---
        // 1. Initially it should be enabled. Verify by clicking "Disable Inline Completion"
        const disableBtn = page.locator('[role="button"][aria-label="Suggestio: Disable Inline Completion"]').first();
        await expect(disableBtn).toBeVisible();
        await disableBtn.click();

        // 2. Verify UI toggled to "Enable"
        const enableBtn = page.locator('[role="button"][aria-label="Suggestio: Enable Inline Completion"]').first();
        await expect(enableBtn).toBeVisible();
        await expect(disableBtn).not.toBeVisible();

        // 3. Verify functionality is actually disabled (no requests sent)
        lastRequestBody = null;
        await page.keyboard.type('test disable', { delay: 100 });
        await page.waitForTimeout(2000);
        expect(lastRequestBody).toBeNull();

        // 4. Toggle back to enabled
        await enableBtn.click();
        await expect(disableBtn).toBeVisible();
        await expect(enableBtn).not.toBeVisible();

        // 5. Verify functionality is re-enabled
        await clearEditor(page);
        await page.keyboard.type('test enable', { delay: 100 });
        await page.waitForTimeout(3000); // Allow debounce and server response
        expect(lastRequestBody).not.toBeNull();
        expect(lastRequestBody.messages[0].content).toContain('test enable');

        // --- Auto-Accept Edits Toggle ---
        // 6. Initially it should be disabled. Verify by clicking "Enable Auto-Accept Edits"
        const enableAutoAcceptBtn = page.locator('[role="button"][aria-label="Suggestio: Enable Auto-Accept Edits"]').first();
        await expect(enableAutoAcceptBtn).toBeVisible();
        await enableAutoAcceptBtn.click();

        // 7. Verify UI toggled to "Disable"
        const disableAutoAcceptBtn = page.locator('[role="button"][aria-label="Suggestio: Disable Auto-Accept Edits"]').first();
        await expect(disableAutoAcceptBtn).toBeVisible();
        await expect(enableAutoAcceptBtn).not.toBeVisible();

        // 8. Toggle back to disabled
        await disableAutoAcceptBtn.click();
        await expect(enableAutoAcceptBtn).toBeVisible();
        await expect(disableAutoAcceptBtn).not.toBeVisible();
    });
});
