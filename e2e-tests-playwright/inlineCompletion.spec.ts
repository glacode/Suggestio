import { test, expect, Page } from '@playwright/test';
import { launchVscode } from './vscode-runner';
import { ElectronApplication } from 'playwright';
import express from 'express';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
        activeProvider: "testProvider",
        providers: {
            testProvider: {
                endpoint: "http://localhost:3000/v1/completions",
                model: "test-model",
            }
        },
        anonymizer: {
            enabled: true,
            words: ["john", "doe"]
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

async function createNewFile(page: Page) {
    await page.keyboard.press('Control+N');
    await page.waitForTimeout(500);
}

async function openChatView(page: Page) {
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(500);
    await page.keyboard.type('Suggestio: Focus on Chat View', { delay: 10 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1000);
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

        const result = await launchVscode(tempWorkspacePath);
        electronApp = result.electronApp;

        page = await electronApp.firstWindow();
        await page.waitForTimeout(10000);
    });

    test.afterAll(async () => {
        await electronApp?.close();
        server?.close();

        if (fs.existsSync(tempWorkspacePath)) {
            fs.rmSync(tempWorkspacePath, { recursive: true, force: true });
        }
    });

    test('should provide inline completion from a custom provider', async () => {
        await openChatView(page);  // activates the extension
        await createNewFile(page);

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
        await createNewFile(page);
        // uncomment the next two lines if you want to test this independently
        // await openChatView(page);  // activates the extension if you launch this test alone
        // await createNewFile(page); // used to focus to the editor

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
});
