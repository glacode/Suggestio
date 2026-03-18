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
 * Writes a single Server-Sent Events (SSE) data chunk to the response.
 */
function writeSSEChunk(res: any, data: any) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Sends the termination signal for an SSE stream.
 */
function sendDone(res: any) {
    res.write('data: [DONE]\n\n');
    res.end();
}

/**
 * Streams a response for the 'reasoning-model'.
 * This model simulates a multi-turn reasoning process, interleaved with tool calls.
 */
function streamReasoningModel(res: any, messages: any[]) {
    const turnIndex = messages.filter((m: any) => m.role === 'assistant').length;
    const allParts = [
        // Turn 1a: Initial reasoning and nested tool request (list_files)
        [
            { type: 'reasoning', content: 'Thinking step 1...' },
            { type: 'tool_calls', calls: [
                { id: 'call_list_nested', name: 'list_files', arguments: '{}' }
            ]}
        ],
        // Turn 1b: Content and other tool requests
        [
            { type: 'content', content: 'Prefix text.' },
            { type: 'tool_calls', calls: [
                { id: 'call_list', name: 'list_files', arguments: '{"directory":"."}' },
                { id: 'call_edit', name: 'edit_file', arguments: '{"path":"test.txt","content":"new content"}' }
            ]}
        ],
        // Turn 2: Follow-up reasoning after tool executions (including user confirmation)
        [
            { type: 'reasoning', content: 'Thinking step 2...' },
            { type: 'content', content: 'Suffix text.' }
        ]
    ];

    const parts = allParts[turnIndex] || [];

    let partIndex = 0;
    let charIndex = 0;

    const interval = setInterval(() => {
        if (partIndex >= parts.length) {
            clearInterval(interval);
            sendDone(res);
            return;
        }

        const current = parts[partIndex];

        if (current.type === 'tool_calls' && current.calls) {
            writeSSEChunk(res, {
                choices: [{
                    delta: {
                        tool_calls: current.calls.map((c: any, i: number) => ({
                            index: i,
                            id: c.id,
                            type: 'function',
                            function: { name: c.name, arguments: c.arguments }
                        }))
                    }
                }]
            });
            partIndex++;
            charIndex = 0;
        } else if (current.type !== 'tool_calls' && current.content) {
            // Stream reasoning or content character by character
            if (charIndex < current.content.length) {
                const delta: any = {};
                if (current.type === 'reasoning') {
                    delta.reasoning_content = current.content[charIndex];
                } else {
                    delta.content = current.content[charIndex];
                }

                writeSSEChunk(res, { choices: [{ delta }] });
                charIndex++;
            } else {
                partIndex++;
                charIndex = 0;
            }
        } else {
            // Should not happen, but prevents infinite loop if current is invalid
            partIndex++;
            charIndex = 0;
        }
    }, 20);
}

/**
 * Streams a standard completion response by echoing the user's concatenated input.
 */
function streamDefaultModel(res: any, text: string) {
    const chars = text.split('');
    let i = 0;

    const interval = setInterval(() => {
        if (i < chars.length) {
            writeSSEChunk(res, { choices: [{ delta: { content: chars[i] } }] });
            i++;
        } else {
            clearInterval(interval);
            sendDone(res);
        }
    }, 50);
}

/**
 * Creates and starts an Express server to mock a streaming OpenAI-compatible API.
 * 
 * This server is used in E2E tests to:
 * 1. Verify that the extension sends the correct messages and model identifiers to the backend.
 * 2. Simulate the real-time, character-by-character "typing" experience of a streaming LLM.
 * 3. Test complex UI logic like interleaved reasoning blocks and tool calls.
 * 
 * @param capturedRequests An array that will store all incoming request bodies for assertion in tests.
 * @returns A promise that resolves with the HTTP server instance.
 */
function createMockServer(capturedRequests: any[]): Promise<Server> {
    return new Promise(resolve => {
        const app = express();
        app.use(express.json());

        app.post('/v1/chat/completions', (req, res) => {
            // 1. Capture the request for later inspection in tests
            capturedRequests.push(req.body);

            // 2. Extract context from the request
            const userMessages = req.body.messages.filter((m: any) => m.role === 'user');
            const concatenatedInput = userMessages.map((m: any) => m.content).join(' ');
            const model = req.body.model;

            // 3. Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // 4. Delegate streaming logic based on the requested model
            if (model === 'reasoning-model') {
                streamReasoningModel(res, req.body.messages);
            } else {
                streamDefaultModel(res, concatenatedInput);
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

        // 2. Verify rendering of interleaved segments (Turn 1)
        const assistantMessage = inner.locator('.message.assistant').last();

        // We expect initially:
        // - Reasoning Block 1 (Contains Tool Call: read_file)
        // - Content Segment 1 (Prefix)
        // - Tool Call (list_files - automated)
        // - Tool Call (edit_file - status)
        // - Tool Confirmation (edit_file - requires user action)
        const segments = assistantMessage.locator('.segments');
        const allSegments = segments.locator('> *');

        // Wait for segments to appear
        await expect(allSegments).toHaveCount(5, { timeout: 10000 });

        // Turn 1 verification
        await expect(allSegments.nth(0)).toHaveClass(/reasoning-container/);
        await expect(allSegments.nth(0)).toContainText('Thinking step 1...');

        // Verify that it is initially collapsed
        await expect(allSegments.nth(0).locator('.reasoning-content')).toHaveClass(/collapsed/);

        // Expand reasoning block to check for nested tool call
        const reasoningHeader = allSegments.nth(0).locator('.reasoning-header');
        await reasoningHeader.click();

        // Verify nested tool call in reasoning block
        const nestedToolCall = allSegments.nth(0).locator('.tool-call-container');
        await expect(nestedToolCall).toBeVisible();
        await expect(nestedToolCall).toContainText('Listing files in'); 

        await expect(allSegments.nth(1)).toHaveClass(/message-content/);
        await expect(allSegments.nth(1)).toHaveText('Prefix text.');

        await expect(allSegments.nth(2)).toHaveClass(/tool-call-container/);
        await expect(allSegments.nth(2)).toContainText('Listing files');

        await expect(allSegments.nth(3)).toHaveClass(/tool-call-container/);
        await expect(allSegments.nth(3)).toContainText('Editing file test.txt');

        await expect(allSegments.nth(4)).toHaveClass(/tool-confirmation-container/);
        await expect(allSegments.nth(4)).toContainText('Allow Suggestio to apply changes to test.txt?');

        // 3. Confirm the tool call

        const allowBtn = allSegments.nth(4).locator('button.tool-button-primary:has-text("Allow")');
        await allowBtn.click();

        // 4. Verify rendering of subsequent segments (Turn 2)
        // After clicking Allow, the confirmation container is removed (-1) 
        // and Turn 2 adds Reasoning 2 and Content 2 (+2). Total: 5 - 1 + 2 = 6.
        await expect(allSegments).toHaveCount(6, { timeout: 10000 });

        // Turn 2 verification
        await expect(allSegments.nth(4)).toHaveClass(/reasoning-container/);
        await expect(allSegments.nth(4)).toContainText('Thinking step 2...');

        await expect(allSegments.nth(5)).toHaveClass(/message-content/);
        await expect(allSegments.nth(5)).toHaveText('Suffix text.');

        // Both reasoning blocks should be collapsed because content followed each of them
        const reasoningBlocks = segments.locator('> .reasoning-container');
        // The first one was manually expanded to check for the nested tool call
        await expect(reasoningBlocks.first().locator('.reasoning-content')).not.toHaveClass(/collapsed/);
        // The second one should still be collapsed
        await expect(reasoningBlocks.nth(1).locator('.reasoning-content')).toHaveClass(/collapsed/);

        // uncomment this if you want to visually verify the test in the Electron window
        // await page.waitForTimeout(10000);
    });
});
