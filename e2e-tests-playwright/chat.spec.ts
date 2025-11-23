import { test, expect, Page } from '@playwright/test';
import { launchVscode } from './vscode-runner';
import { ElectronApplication } from 'playwright';
import express from 'express';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
                endpoint: "http://localhost:3001/v1/chat/completions",
                model: "test-model",
                apiKey: "unused"
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

        app.post('/v1/chat/completions', (req, res) => {
            const userMessages = req.body.messages.filter((m: any) => m.role === 'user');
            const concatenated = userMessages.map((m: any) => m.content).join(' ');

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const chars = concatenated.split('');
            let i = 0;

            const interval = setInterval(() => {
                if (i < chars.length) {
                    res.write(`data: ${JSON.stringify({
                        choices: [{ delta: { content: chars[i] } }]
                    })}\n\n`);
                    i++;
                } else {
                    clearInterval(interval);
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
            }, 50);
        });

        const server = app.listen(3001, () => resolve(server));
    });
}

async function openChatView(page: Page) {
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(500);
    await page.keyboard.type('Suggestio: Focus on Chat View', { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);
}

async function getChatFrames(page: Page) {
    const outerSelector = 'iframe.webview[src*="glacode.suggestio"]';
    await page.waitForSelector(outerSelector);

    const outer = page.frameLocator(outerSelector);
    await outer.locator('iframe').waitFor({ state: 'visible' });

    const inner = outer.frameLocator('iframe');
    return inner;
}

async function sendChatMessage(innerFrame: ReturnType<Page["frameLocator"]>, message: string) {
    const input = innerFrame.locator('#messageInput');
    await input.waitFor({ state: 'visible' });

    await input.page().keyboard.type(message, { delay: 50 });
    const sendBtn = innerFrame.locator('.send-icon');
    await sendBtn.click();

    return input;
}

async function expectChatMessages(inner: ReturnType<Page["frameLocator"]>, expected: string) {
    const userMessage = inner.locator('.message.user');
    const assistantMessage = inner.locator('.message.assistant');

    await expect(userMessage).toBeVisible();
    await expect(userMessage).toHaveText(expected);
    await expect(assistantMessage).toBeVisible();
    await expect(assistantMessage).toHaveText(expected, { timeout: 5000 });
}

// -----------------------------------------------------------------------------
// Main Test
// -----------------------------------------------------------------------------

test.describe('Chat E2E', () => {
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
        await server?.close();

        if (fs.existsSync(tempWorkspacePath)) {
            fs.rmSync(tempWorkspacePath, { recursive: true, force: true });
        }
    });

    test('should display user input and mocked response in chat history', async () => {
        // 👇 ADD THIS. This pauses Playwright indefinitely.
        // It keeps the Electron window open so we can check the connection.
        await page.pause();

        await openChatView(page);
        const inner = await getChatFrames(page);

        await sendChatMessage(inner, 'Hello');
        await expectChatMessages(inner, 'Hello');
    });
});
