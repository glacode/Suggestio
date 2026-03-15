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
        anonymizer: {
            enabled: true,
            words: ["secret"]
        },
        providers: {
            testProvider: {
                endpoint: "http://localhost:3001/v1/chat/completions",
                model: "test-model",
                apiKey: "unused"
            },
            reasoningProvider: {
                endpoint: "http://localhost:3001/v1/chat/completions",
                model: "reasoning-model",
                apiKey: "unused"
            }
        }
    };
    fs.writeFileSync(
        path.join(workspace, 'suggestio.config.json'),
        JSON.stringify(mockConfig, null, 2)
    );
}

/**
 * Creates and starts an Express server to mock a streaming Large Language Model (LLM) API endpoint.
 * This server is used for E2E tests to simulate real-time, character-by-character responses,
 * which is crucial for testing the frontend's ability to handle streamed content.
 * It listens for POST requests on '/v1/chat/completions' and streams back the user's input.
 * The mock server's response content is the concatenation of all content fields from the userMessages in the request body,
 * joined by a space. For example, it there are two user messages with contents "Hello" and "How are you", the response will be "Hello How are you".
 * @returns {Promise<Server>} A promise that resolves with the HTTP server instance once it's listening.
 */
function createMockServer(capturedRequests: any[]): Promise<Server> {
    return new Promise(resolve => {
        const app = express();
        app.use(express.json());

        app.post('/v1/chat/completions', (req, res) => {
            capturedRequests.push(req.body);
            const userMessages = req.body.messages.filter((m: any) => m.role === 'user');
            const concatenated = userMessages.map((m: any) => m.content).join(' ');
            const model = req.body.model;

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            if (model === 'reasoning-model') {
                const sequence = [
                    { type: 'reasoning', content: 'Thinking step 1...' },
                    { type: 'content', content: 'Intermediate result.' },
                    { type: 'reasoning', content: 'Thinking step 2...' },
                    { type: 'content', content: ' Final answer.' }
                ];

                let seqIndex = 0;
                let charIndex = 0;

                const interval = setInterval(() => {
                    const current = sequence[seqIndex];
                    if (charIndex < current.content.length) {
                        const delta: any = {};
                        if (current.type === 'reasoning') {
                            delta.reasoning_content = current.content[charIndex];
                        } else {
                            delta.content = current.content[charIndex];
                        }

                        res.write(`data: ${JSON.stringify({
                            choices: [{ delta }]
                        })}\n\n`);
                        charIndex++;
                    } else {
                        seqIndex++;
                        charIndex = 0;
                        if (seqIndex >= sequence.length) {
                            clearInterval(interval);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        }
                    }
                }, 20);
            } else {
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
            }
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
    await input.click();  // this is needed only the secont turn onwards
    await input.waitFor({ state: 'visible' });

    await input.page().keyboard.type(message, { delay: 50 });
    const sendBtn = innerFrame.locator('.send-icon');
    await sendBtn.click();

    return input;
}

async function expectChatMessages(inner: ReturnType<Page["frameLocator"]>, expected: string) {
    const userMessage = inner.locator('.message.user').last();
    const assistantMessage = inner.locator('.message.assistant').last();

    await expect(userMessage).toBeVisible();
    await expect(userMessage).toHaveText(expected);
    await expect(assistantMessage).toBeVisible();
    await expect(assistantMessage).toHaveText(expected, { timeout: 5000 });
}

async function expectChatHistory(
    inner: ReturnType<Page["frameLocator"]>,
    expectedUserMessages: string[],
    expectedAssistantMessages: string[]
) {
    const userMessages = inner.locator('.message.user');
    const assistantMessages = inner.locator('.message.assistant');

    await expect(userMessages).toHaveCount(expectedUserMessages.length);
    await expect(assistantMessages).toHaveCount(expectedAssistantMessages.length);

    for (let i = 0; i < expectedUserMessages.length; i++) {
        await expect(userMessages.nth(i)).toBeVisible();
        await expect(userMessages.nth(i)).toHaveText(expectedUserMessages[i]);
    }

    for (let i = 0; i < expectedAssistantMessages.length; i++) {
        await expect(assistantMessages.nth(i))
            .toHaveText(expectedAssistantMessages[i], { timeout: 5000 });
    }
}

async function clickNewChat(page: Page) {
    // The "New Chat" button is a VS Code view title action, located in the workbench (outside the webview).
    // We use a specific selector for the action button role and take the first one found.
    const newChatBtn = page.locator('[role="button"][aria-label="Suggestio: New Chat"]').first();
    await newChatBtn.click();
}

async function switchModel(inner: ReturnType<Page["frameLocator"]>, modelName: string) {
    const selector = inner.locator('#modelSelector');
    await selector.locator('.dropdown-label').click();
    // Wait for dropdown to be visible
    const dropdown = inner.locator('.dropdown-content');
    await dropdown.waitFor({ state: 'visible' });
    await dropdown.locator(`a:has-text("${modelName}")`).click();
}

// -----------------------------------------------------------------------------
// Main Test
// -----------------------------------------------------------------------------

test.describe('Chat E2E', () => {
    let electronApp: ElectronApplication;
    let page: Page;
    let server: Server | null = null;
    let tempWorkspacePath: string;
    let capturedRequests: any[] = [];

    test.beforeAll(async () => {
        tempWorkspacePath = createTempWorkspace();
        writeMockConfig(tempWorkspacePath);
        capturedRequests = [];
        server = await createMockServer(capturedRequests);

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
        // await page.pause();

        await openChatView(page);
        const inner = await getChatFrames(page);

        await sendChatMessage(inner, 'Hello');
        await expectChatMessages(inner, 'Hello');

        // Second turn
        await sendChatMessage(inner, 'How are you');

        /**
         * Mock server behavior:
         * assistant response = concatenation of ALL user messages
         *
         * Turn 1 assistant: "Hello"
         * Turn 2 assistant: "Hello How are you"  (this proves that the full history is sent!!)
         */
        await expectChatHistory(
            inner,
            ['Hello', 'How are you'],
            ['Hello', 'Hello How are you']
        );

        // Third turn: Anonymization
        await sendChatMessage(inner, 'My secret is simple');

        // Verify Chat UI (Deanonymization)
        // The mock server will echo "Hello How are you My ANON_X is simple"
        // The frontend should deanonymize ANON_X back to "secret"
        await expectChatHistory(
            inner,
            ['Hello', 'How are you', 'My secret is simple'],
            ['Hello', 'Hello How are you', 'Hello How are you My secret is simple']
        );

        // Verify Backend (Anonymization)
        // We expect the last request to contain the anonymized text
        expect(capturedRequests.length).toBeGreaterThanOrEqual(3);
        const lastRequest = capturedRequests[capturedRequests.length - 1];
        const lastUserMessage = lastRequest.messages.findLast((m: any) => m.role === 'user');
        
        // The word "secret" should be replaced by "ANON_" followed by a number
        expect(lastUserMessage.content).toMatch(/My ANON_\d+ is simple/);
    });

    test('should clear chat history when "New Chat" button is clicked', async () => {
        // await openChatView(page);
        const inner = await getChatFrames(page);

        // Start with a clean slate
        await clickNewChat(page);

        // Send a message to have some history
        await sendChatMessage(inner, 'Clear me');
        await expectChatMessages(inner, 'Clear me');

        // Click the "New Chat" button in the VS Code view title
        await clickNewChat(page);

        // Verify that the empty chat content is visible again
        const emptyChatContent = inner.locator('#emptyChatContent');
        await expect(emptyChatContent).toBeVisible();

        // Verify that no messages are left
        const messages = inner.locator('.message');
        await expect(messages).toHaveCount(0);
    });

    test('should handle switching to a reasoning model and processing interleaved tokens correctly', async () => {
        const inner = await getChatFrames(page);

        // Switch to the reasoning model
        await switchModel(inner, 'reasoning-model');
        await clickNewChat(page);

        // Send a message
        const currentRequestCount = capturedRequests.length;
        await sendChatMessage(inner, 'Reason for me');
        
        // 1. Verify that the request used the correct model
        await expect.poll(() => capturedRequests.length).toBeGreaterThan(currentRequestCount);
        const lastRequest = capturedRequests[capturedRequests.length - 1];
        expect(lastRequest.model).toBe('reasoning-model');

        // 2. Verify rendering of interleaved segments
        const assistantMessage = inner.locator('.message.assistant').last();

        // We expect 2 reasoning blocks and 2 content segments in the top-level segments container
        const segments = assistantMessage.locator('.segments');
        const reasoningBlocks = segments.locator('> .reasoning-container');
        const contentBlocks = segments.locator('> .message-content');

        await expect(reasoningBlocks).toHaveCount(2);
        await expect(contentBlocks).toHaveCount(2);

        // Both reasoning blocks should be collapsed because content followed each of them
        await expect(reasoningBlocks.first().locator('.reasoning-content')).toHaveClass(/collapsed/);
        await expect(reasoningBlocks.nth(1).locator('.reasoning-content')).toHaveClass(/collapsed/);

        // Verify final text content in the content blocks
        await expect(contentBlocks.first()).toHaveText('Intermediate result.');
        await expect(contentBlocks.nth(1)).toHaveText(' Final answer.');
    });
});
