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
        anonymizer: {
            words: ["secret"]
        },
        profiles: {
            testProvider: {
                endpoint: "http://localhost:3001/v1/chat/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            reasoningProvider: {
                endpoint: "http://localhost:3001/v1/chat/completions",
                model: "reasoning-model",
                isApiKeyRequired: false
            },
            autoRetryProvider: {
                endpoint: "http://localhost:3001/v1/auto-retry/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            manualRetryProvider: {
                endpoint: "http://localhost:3001/v1/manual-retry/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            reasoningRetryProvider: {
                endpoint: "http://localhost:3001/v1/reasoning-retry/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            maxIterationsProvider: {
                endpoint: "http://localhost:3001/v1/max-iterations/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            maxIterationsReasoningProvider: {
                endpoint: "http://localhost:3001/v1/max-iterations-reasoning/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            alwaysFailProvider: {
                endpoint: "http://localhost:3001/v1/always-fail/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            alwaysHaltProvider: {
                endpoint: "http://localhost:3001/v1/always-halt/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            autoAcceptEditsProvider: {
                endpoint: "http://localhost:3001/v1/auto-accept/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            alwaysAllowEditProvider: {
                endpoint: "http://localhost:3001/v1/always-allow-edit/completions",
                model: "test-model",
                isApiKeyRequired: false
            },
            runCommandProvider: {
                endpoint: "http://localhost:3001/v1/run-command/completions",
                model: "test-model",
                isApiKeyRequired: false
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
    let runs = 0;
    let lastRole = '';
    for (const m of messages) {
        if (m.role === 'assistant' && lastRole !== 'assistant') {
            runs++;
        }
        lastRole = m.role;
    }
    const turnIndex = runs;
    const allParts = [
        // Turn 1a: Initial reasoning and nested tool request (list_files)
        [
            { type: 'reasoning', content: 'Thinking step 1...' },
            { type: 'tool_calls', calls: [
                { id: 'call_list_nested', name: 'list_files', arguments: '{}' }
            ]}
        ],
        // Turn 1b: more thinking and nested tool request (write_file - requires confirmation)
        [
            { type: 'reasoning', content: ' more thinking...' },
            { type: 'tool_calls', calls: [
                { id: 'call_edit_nested', name: 'write_file', arguments: '{"path":"nested.txt","content":"nested content"}' }
            ]}
        ],
        // Turn 1c: Content and other tool requests
        [
            { type: 'reasoning', content: ' thinking after edit...' },
            { type: 'content', content: 'Prefix text.' },
            { type: 'tool_calls', calls: [
                { id: 'call_list', name: 'list_files', arguments: '{"directory":"."}' },
                { id: 'call_edit', name: 'write_file', arguments: '{"path":"test.txt","content":"new content"}' }
            ]}
        ],
        // Turn 2: Follow-up reasoning and nested tool request (run_command)
        [
            { type: 'reasoning', content: 'Thinking step 2...' },
            { type: 'tool_calls', calls: [
                { id: 'call_run', name: 'run_command', arguments: '{"command":"echo test"}' }
            ]}
        ],
        // Turn 3: Final content
        [
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

        let autoRetryCallCount = 0;
        let manualRetryCallCount = 0;
        let reasoningRetryCallCount = 0;
        let maxIterationsCallCount = 0;
        let maxIterationsReasoningCallCount = 0;
        let alwaysAllowCallCount = 0;
        let autoAcceptCallCount = 0;
        let runCommandCallCount = 0;

        app.post('/v1/always-fail/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'always-fail', body: req.body });
            res.status(500).json({ error: "Always failing for test" });
        });

        app.post('/v1/always-halt/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'always-halt', body: req.body });
            // Return a tool_call to keep the agent in the loop
            res.setHeader('Content-Type', 'text/event-stream');
            writeSSEChunk(res, {
                choices: [{
                    delta: {
                        tool_calls: [{
                            index: 0,
                            id: 'call_list',
                            type: 'function',
                            function: { name: 'list_files', arguments: '{}' }
                        }]
                    }
                }]
            });
            sendDone(res);
        });

        app.post('/v1/auto-accept/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'auto-accept', body: req.body });
            autoAcceptCallCount++;
            res.setHeader('Content-Type', 'text/event-stream');
            
            if (autoAcceptCallCount === 1 || autoAcceptCallCount === 3) {
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: `call_edit_auto_${autoAcceptCallCount}`,
                                type: 'function',
                                function: { name: 'write_file', arguments: '{"path":"auto.txt","content":"auto content"}' }
                            }]
                        }
                    }]
                });
            } else {
                writeSSEChunk(res, { choices: [{ delta: { content: 'Turn finished' } }] });
            }
            sendDone(res);
        });

        app.post('/v1/run-command/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'run-command', body: req.body });
            runCommandCallCount++;
            res.setHeader('Content-Type', 'text/event-stream');

            if (runCommandCallCount === 1) {
                // First call (user message 1) -> Tool call 1: echo "test"
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_run_1',
                                type: 'function',
                                function: { name: 'run_command', arguments: JSON.stringify({ command: 'echo "test"' }) }
                            }]
                        }
                    }]
                });
            } else if (runCommandCallCount === 2) {
                // Second call (tool result 1) -> Finish first turn
                writeSSEChunk(res, { choices: [{ delta: { content: 'Finished turn 1' } }] });
            } else if (runCommandCallCount === 3) {
                // Third call (user message 2) -> Tool call 2: echo "test" (same command)
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_run_2',
                                type: 'function',
                                function: { name: 'run_command', arguments: JSON.stringify({ command: 'echo "test"' }) }
                            }]
                        }
                    }]
                });
            } else if (runCommandCallCount === 4) {
                // Fourth call (tool result 2) -> Finish second turn
                writeSSEChunk(res, { choices: [{ delta: { content: 'Finished turn 2' } }] });
            } else if (runCommandCallCount === 5) {
                // Fifth call (user message 3) -> Tool call 3: echo "test" --silent (different command)
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_run_3',
                                type: 'function',
                                function: { name: 'run_command', arguments: JSON.stringify({ command: 'echo "test" --silent' }) }
                            }]
                        }
                    }]
                });
            } else if (runCommandCallCount === 6) {
                // Sixth call (tool result 3) -> Finish third turn
                writeSSEChunk(res, { choices: [{ delta: { content: 'Finished turn 3' } }] });
            } else {
                // Fallback: just finish
                writeSSEChunk(res, { choices: [{ delta: { content: 'Done' } }] });
            }
            sendDone(res);
        });

        app.post('/v1/always-allow-edit/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'always-allow-edit', body: req.body });
            alwaysAllowCallCount++;
            res.setHeader('Content-Type', 'text/event-stream');
            
            if (alwaysAllowCallCount === 1) {
                // First call (user message 1) -> Tool call 1
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: `call_replace_1`,
                                type: 'function',
                                function: { 
                                    name: 'replace_text', 
                                    arguments: JSON.stringify({
                                        path: 'test.txt',
                                        old_string: 'original',
                                        new_string: 'modified'
                                    })
                                }
                            }]
                        }
                    }]
                });
            } else if (alwaysAllowCallCount === 2) {
                // Second call (tool result 1) -> Finish first turn
                writeSSEChunk(res, { choices: [{ delta: { content: 'Finished turn 1' } }] });
            } else if (alwaysAllowCallCount === 3) {
                // Third call (user message 2) -> Tool call 2
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: `call_replace_2`,
                                type: 'function',
                                function: { 
                                    name: 'replace_text', 
                                    arguments: JSON.stringify({
                                        path: 'test.txt',
                                        old_string: 'modified',
                                        new_string: 'final'
                                    })
                                }
                            }]
                        }
                    }]
                });
            } else {
                // Fourth call (tool result 2) -> Finish second turn
                writeSSEChunk(res, { choices: [{ delta: { content: 'Finished turn 2' } }] });
            }
            sendDone(res);
        });

        app.post('/v1/max-iterations-reasoning/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'max-iterations-reasoning', body: req.body });
            maxIterationsReasoningCallCount++;

            if (maxIterationsReasoningCallCount === 1) {
                // Initial success
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "First Response");
            } else if (maxIterationsReasoningCallCount <= 11) {
                // Iterations 2-11: Reasoning + Tool call
                res.setHeader('Content-Type', 'text/event-stream');
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            reasoning_content: `Thinking turn ${maxIterationsReasoningCallCount}... `,
                            tool_calls: [{
                                index: 0,
                                id: 'call_list',
                                type: 'function',
                                function: { name: 'list_files', arguments: '{}' }
                            }]
                        }
                    }]
                });
                sendDone(res);
            } else {
                // Continue click (request 12): Final reasoning and content
                res.setHeader('Content-Type', 'text/event-stream');
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            reasoning_content: "Final thought.",
                            content: "Final answer."
                        }
                    }]
                });
                sendDone(res);
            }
        });

        app.post('/v1/max-iterations/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'max-iterations', body: req.body });
            maxIterationsCallCount++;

            if (maxIterationsCallCount === 1) {
                // First request: Success
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "First Response");
            } else if (maxIterationsCallCount === 2) {
                // Second request: Return tool_calls indefinitely to trigger max iterations loop
                // Return a tool_call that will keep the agent in the iteration loop
                res.setHeader('Content-Type', 'text/event-stream');
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_list',
                                type: 'function',
                                function: { name: 'list_files', arguments: '{}' }
                            }]
                        }
                    }]
                });
                sendDone(res);
            } else if (maxIterationsCallCount <= 11) {
                // Requests 3-11: Continue returning tool_calls
                // This keeps agent in loop: request → tool_calls → execute → request → ...
                // After 10 iterations (10 LLM calls), agent halts at max iterations
                res.setHeader('Content-Type', 'text/event-stream');
                writeSSEChunk(res, {
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_list',
                                type: 'function',
                                function: { name: 'list_files', arguments: '{}' }
                            }]
                        }
                    }]
                });
                sendDone(res);
            } else {
                // Continue click (request 12): Success
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "Success after continuing from max iterations");
            }
        });

        app.post('/v1/reasoning-retry/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'reasoning-retry', body: req.body });
            reasoningRetryCallCount++;

            if (reasoningRetryCallCount === 1) {
                // First request: partial reasoning then CRASH
                res.setHeader('Content-Type', 'text/event-stream');
                res.write('data: {"choices":[{"delta":{"reasoning":"Thinking mid-thought..."}}]}\n\n');
                // Abruptly destroy the socket to simulate network error
                setTimeout(() => res.destroy(), 100);
            } else if (reasoningRetryCallCount <= 4) {
                // Auto-retries fail
                res.status(500).json({ error: "Still failing" });
            } else {
                // Manual retry: Success
                res.setHeader('Content-Type', 'text/event-stream');
                res.write('data: {"choices":[{"delta":{"reasoning":" Continuing thought."}}]}\n\n');
                setTimeout(() => {
                    res.write('data: {"choices":[{"delta":{"content":"Final answer."}}]}\n\n');
                    res.write('data: [DONE]\n\n');
                    res.end();
                }, 100);
            }
        });

        app.post('/v1/manual-retry/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'manual-retry', body: req.body });
            manualRetryCallCount++;

            if (manualRetryCallCount === 1) {
                // First request: Success
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "First Response");
            } else if (manualRetryCallCount <= 5) {
                // Second request + 3 auto-retries: Failure (Total 4 attempts for Request 2)
                res.status(500).json({ error: `Manual retry phase fail ${manualRetryCallCount}` });
            } else {
                // Sixth request (manual retry click): Success
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "Success after manual retry");
            }
        });

        app.post('/v1/auto-retry/completions', (req, res) => {
            capturedRequests.push({ endpoint: 'auto-retry', body: req.body });
            autoRetryCallCount++;

            // Fail 3 times, succeed on the 4th
            if (autoRetryCallCount <= 3) {
                res.status(500).json({ error: `Simulated failure ${autoRetryCallCount}` });
            } else {
                res.setHeader('Content-Type', 'text/event-stream');
                streamDefaultModel(res, "Success after 3 retries");
            }
        });

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
    await page.keyboard.type('Suggestio: Focus on Chat View', { delay: 10 });
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

    await input.page().keyboard.type(message, { delay: 10 });
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
    
    // Use exact text match to avoid ambiguity (e.g., "reasoningProvider" matching "maxIterationsReasoningProvider")
    await dropdown.locator('a').filter({ hasText: new RegExp(`^${modelName}$`) }).click();

    // Safety wait: VS Code's configuration change events are async and can take time to 
    // propagate from the settings disk write back to the extension host.
    await new Promise(resolve => setTimeout(resolve, 500));
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

        const result = await launchVscode(tempWorkspacePath, {
            'suggestio.activeChatProfile': 'testProvider',
            'suggestio.activeCompletionProfile': 'testProvider',
            'suggestio.experimental.anonymizer.enabled': true,
            'suggestio.maxAgentIterations': 10,
            'suggestio.llm.initialDelay': 500,
            'suggestio.llm.maxRetries': 3
        });
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
        await openChatView(page);
        const inner = await getChatFrames(page);

        // Switch to the reasoning profile
        await switchModel(inner, 'reasoningProvider');
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

        // Initially we expect:
        // - Reasoning Block 1 (Contains multiple nested tool calls)
        const allSegments = assistantMessage.locator('> *:not(.typing-indicator)');

        // Wait for segments to appear (initially only the reasoning container)
        await expect(allSegments).toHaveCount(1, { timeout: 10000 });

        // Turn 1 verification (Reasoning Block 1)
        await expect(allSegments.nth(0)).toHaveClass(/reasoning-container/);
        await expect(allSegments.nth(0)).toContainText('Thinking step 1...');

        // Verify that it is NOT initially collapsed (since no content has followed yet)
        await expect(allSegments.nth(0).locator('.reasoning-content')).not.toHaveClass(/collapsed/);

        // Verify the structure of the reasoning block content
        const reasoningContent = allSegments.nth(0).locator('.reasoning-content');
        const reasoningChildren = reasoningContent.locator('> *');
        
        // Check for 5 children: Content -> Tool Call -> Content -> Tool Call -> Tool Confirmation
        await expect(reasoningChildren).toHaveCount(5);
        
        // 1. Initial reasoning text
        await expect(reasoningChildren.nth(0)).toHaveClass(/message-content/);
        await expect(reasoningChildren.nth(0)).toHaveText('Thinking step 1...');

        // 2. Nested tool call
        const nestedToolCall = reasoningChildren.nth(1);
        await expect(nestedToolCall).toHaveClass(/tool-call-container/);
        await expect(nestedToolCall).toBeVisible();
        await expect(nestedToolCall).toContainText('Listing files in'); 

        // 3. Subsequent reasoning text
        await expect(reasoningChildren.nth(2)).toHaveClass(/message-content/);
        await expect(reasoningChildren.nth(2)).toHaveText(' more thinking...');

        // 4. Nested tool call with confirmation
        const nestedToolCall2 = reasoningChildren.nth(3);
        await expect(nestedToolCall2).toHaveClass(/tool-call-container/);
        await expect(nestedToolCall2).toContainText('Writing file nested.txt');

        const nestedConfirmation = reasoningChildren.nth(4);
        await expect(nestedConfirmation).toHaveClass(/tool-confirmation-container/);
        await expect(nestedConfirmation).toContainText('Allow Suggestio to write to nested.txt?');

        // 3. Confirm the first nested tool call (triggers Turn 1c)
        const allowBtnNested = reasoningChildren.nth(4).locator('button.tool-button-primary:has-text("Allow")');
        await allowBtnNested.click();

        // After clicking:
        // - The confirmation container (index 4) is removed from the DOM.
        // - Turn 1c adds ' thinking after edit...' as a new ContentSegment.
        // So the count should remain 5.
        await expect(reasoningChildren).toHaveCount(5);
        await expect(reasoningChildren.nth(4)).toHaveClass(/message-content/);
        await expect(reasoningChildren.nth(4)).toHaveText(' thinking after edit...');

        // Wait for subsequent segments (Turn 1c) to appear
        // Total segments: Reasoning 1, Prefix text, list_files, write_file status, write_file confirmation
        await expect(allSegments).toHaveCount(5, { timeout: 10000 });

        await expect(allSegments.nth(1)).toHaveClass(/message-content/);
        await expect(allSegments.nth(1)).toHaveText('Prefix text.');

        await expect(allSegments.nth(2)).toHaveClass(/tool-call-container/);
        await expect(allSegments.nth(2)).toContainText('Listing files');

        await expect(allSegments.nth(3)).toHaveClass(/tool-call-container/);
        await expect(allSegments.nth(3)).toContainText('Writing file test.txt');

        await expect(allSegments.nth(4)).toHaveClass(/tool-confirmation-container/);
        await expect(allSegments.nth(4)).toContainText('Allow Suggestio to write to test.txt?');

        // Manually expand Reasoning 1 again (it was collapsed by "Prefix text")
        await allSegments.nth(0).locator('.reasoning-header').click();

        // 4. Confirm the second tool call (triggers Turn 2)
        const allowBtn = allSegments.nth(4).locator('button.tool-button-primary:has-text("Allow")');
        await allowBtn.click();

        // 5. Verify rendering of subsequent segments (Turn 2)
        // After clicking Allow, the confirmation container is removed (-1) 
        // and Turn 2 adds Reasoning 2 (which contains nested Tool Call/Confirmation) (+1). 
        // Total: 5 - 1 + 1 = 5.
        await expect(allSegments).toHaveCount(5, { timeout: 10000 });

        // Turn 2 verification (Reasoning Block 2)
        const reasoningBlock2 = allSegments.nth(4);
        await expect(reasoningBlock2).toHaveClass(/reasoning-container/);
        await expect(reasoningBlock2).toContainText('Thinking step 2...');

        // Verify nested tool call and confirmation in Reasoning Block 2
        // Since no content followed immediately, the block should be expanded (not collapsed)
        await expect(reasoningBlock2.locator('.reasoning-content')).not.toHaveClass(/collapsed/);
        
        const reasoningChildren2 = reasoningBlock2.locator('.reasoning-content > *');
        await expect(reasoningChildren2).toHaveCount(3); // Content, Tool Call, Confirmation

        // 1. Reasoning Text
        await expect(reasoningChildren2.nth(0)).toHaveClass(/message-content/);
        await expect(reasoningChildren2.nth(0)).toHaveText('Thinking step 2...');

        // 2. Tool Call
        const toolCall2 = reasoningChildren2.nth(1);
        await expect(toolCall2).toHaveClass(/tool-call-container/);
        await expect(toolCall2).toContainText('Executing command: echo test');

        // 3. Confirmation
        const confirmation2 = reasoningChildren2.nth(2);
        await expect(confirmation2).toHaveClass(/tool-confirmation-container/);
        await expect(confirmation2).toContainText('Allow Suggestio to run command: "echo test"?');

        // 5. Confirm the run_command tool call
        const allowBtn2 = confirmation2.locator('button.tool-button-primary:has-text("Allow")');
        await allowBtn2.click();

        // 6. Verify rendering of Turn 3 (Final Content)
        // After clicking Allow, confirmation is removed (-1).
        // Turn 3 adds "Suffix text" (Content) (+1).
        // Total: 6 - 1 + 1 = 6.
        await expect(allSegments).toHaveCount(6, { timeout: 10000 });

        // Verify Reasoning Block 2 is followed by "Suffix text".
        // When Turn 3 arrives, the new content token will automatically
        // collapse the active reasoning segment (Block 2).
        
        const suffixText = assistantMessage.locator('.message-content').last();
        await expect(suffixText).toContainText('Suffix text.', { timeout: 15000 });

        // Both reasoning blocks should be collapsed because content followed each of them
        // Block 1: Expanded manually earlier -> stays expanded?
        // Block 2: Collapsed automatically by "Suffix text".
        const finalReasoningBlocks = assistantMessage.locator('> .reasoning-container');
        await expect(finalReasoningBlocks.first().locator('.reasoning-content')).not.toHaveClass(/collapsed/);
        await expect(finalReasoningBlocks.nth(1).locator('.reasoning-content')).toHaveClass(/collapsed/);

        // uncomment this if you want to visually verify the test in the Electron window
        // await page.waitForTimeout(30000);
    });

    test('should automatically retry on failure and succeed', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to the auto-retry profile and start a new chat
        await switchModel(inner, 'autoRetryProvider');
        await clickNewChat(page);

        // 2. Send a message to trigger the flow
        await sendChatMessage(inner, 'Trigger Retry');

        // 3. Assert that the notification bubble appeared and updated
        // The notification appears after the first failure
        const notification = inner.locator('.message.notification');
        await expect(notification).toBeVisible({ timeout: 10000 });
        await expect(notification).toContainText('Retrying (attempt 1 of 3)');
        
        // Wait for it to progress to attempt 3
        await expect(notification).toContainText('Retrying (attempt 3 of 3)', { timeout: 10000 });

        // 4. Assert that the notification eventually disappears (success or final failure)
        await expect(notification).not.toBeVisible({ timeout: 10000 });

        // 5. Assert that the assistant message eventually displays the successful response
        const assistantMessage = inner.locator('.message.assistant').last();
        await expect(assistantMessage).toBeVisible();
        await expect(assistantMessage).toContainText('Success after 3 retries', { timeout: 10000 });

        // 6. Verify that the mock server received four requests for the auto-retry endpoint (1 initial + 3 retries)
        const autoRetryRequests = capturedRequests.filter(r => r.endpoint === 'auto-retry');
        expect(autoRetryRequests.length).toBe(4);
    });

    test('should show a retry button after all auto-retries fail and successfully retry with clean history', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to the manual-retry profile and start a new chat
        await switchModel(inner, 'manualRetryProvider');
        await clickNewChat(page);

        // 2. Turn 1: Send "Request 1" -> Success
        await sendChatMessage(inner, 'Request 1');
        await expect(inner.locator('.message.assistant').last()).toHaveText('First Response', { timeout: 10000 });

        // 3. Turn 2: Send "Request 2" -> This will fail all 4 attempts (1 initial + 3 retries)
        await sendChatMessage(inner, 'Request 2');

        // 4. Assert that the "Retrying..." notification appears and increments
        const notification = inner.locator('.message.notification');
        await expect(notification).toBeVisible({ timeout: 10000 });
        await expect(notification).toContainText('Retrying (attempt 1 of 3)');
        await expect(notification).toContainText('Retrying (attempt 3 of 3)', { timeout: 10000 });

        // 5. Verify that previous messages are still visible above the notifications
        const userMessages = inner.locator('.message.user');
        await expect(userMessages.nth(0)).toHaveText('Request 1');
        await expect(inner.locator('.message.assistant').nth(0)).toHaveText('First Response');
        await expect(userMessages.nth(1)).toHaveText('Request 2');

        // 6. Assert the final failure phase: Error container + Retry button appears
        const assistantMessage = inner.locator('.message.assistant').last();
        const retryBtn = assistantMessage.locator('button.retry-button');
        await expect(retryBtn).toBeVisible({ timeout: 10000 });
        await expect(assistantMessage).toContainText('Sorry, there was an error processing your request');

        // 7. Click the "Retry" button
        await retryBtn.click();

        // 8. Recovery Phase: Error container and button should be removed
        // (the retry logic removes the failed message element and creates a new loading one)
        await expect(retryBtn).not.toBeVisible();

        // 9. Final Verification: Success after manual retry
        const finalAssistantMessage = inner.locator('.message.assistant').last();
        await expect(finalAssistantMessage).toContainText('Success after manual retry', { timeout: 15000 });

        // 10. CRUCIAL: Verify History Integrity (Clean request sent to LLM)
        // Filter requests for our endpoint
        const manualRetryRequests = capturedRequests.filter(r => r.endpoint === 'manual-retry');
        
        // Last request is the manual retry (call #6 in our mock logic)
        const lastRequest = manualRetryRequests[manualRetryRequests.length - 1].body;
        
        // It should contain: [System Message, User: Request 1, Assistant: First Response, User: Request 2]
        // AND nothing else (no error messages, no "retry" strings)
        expect(lastRequest.messages).toHaveLength(4);
        
        // Check System Message
        expect(lastRequest.messages[0].role).toBe('system');
        expect(lastRequest.messages[0].content).toContain('code assistant');

        // Check the conversation flow
        expect(lastRequest.messages[1]).toMatchObject({ role: 'user', content: 'Request 1' });
        expect(lastRequest.messages[2]).toMatchObject({ role: 'assistant', content: 'First Response' });
        expect(lastRequest.messages[3]).toMatchObject({ role: 'user', content: 'Request 2' });
    });

    test('should preserve and continue reasoning bubble when retrying mid-thought', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to reasoning-retry profile
        await switchModel(inner, 'reasoningRetryProvider');
        await clickNewChat(page);

        // 2. Send message
        await sendChatMessage(inner, 'Reason about something');

        // 3. Assert initial reasoning is displayed
        const assistantMessage = inner.locator('.message.assistant').last();
        const reasoningContainer = assistantMessage.locator('.reasoning-container');
        const reasoningContent = reasoningContainer.locator('.reasoning-content');
        
        await expect(reasoningContainer).toBeVisible({ timeout: 10000 });
        await expect(reasoningContent).toContainText('Thinking mid-thought...');

        // 4. Wait for retry button (after auto-retries fail)
        const retryBtn = assistantMessage.locator('button.retry-button');
        await expect(retryBtn).toBeVisible({ timeout: 10000 });

        // 5. Click Retry
        await retryBtn.click();

        // 6. Final Verification
        // - Error container should be gone
        await expect(retryBtn).not.toBeVisible();
        
        // - Reasoning should contain BOTH parts
        await expect(reasoningContent).toContainText('Thinking mid-thought... Continuing thought.', { timeout: 10000 });
        
        // - Final answer should be displayed
        await expect(assistantMessage).toContainText('Final answer.');

        // - EXTREMELY CRUCIAL: There should be exactly ONE reasoning container
        await expect(assistantMessage.locator('.reasoning-container')).toHaveCount(1);
    });

    test('should show continue button when max iterations reached and successfully continue with clean history', async () => {
        // await openChatView(page);
        const inner = await getChatFrames(page);

        // 1. Switch to the max-iterations profile and start a new chat
        await switchModel(inner, 'maxIterationsProvider');
        await clickNewChat(page);

        // 2. Turn 1: Send "Request 1" -> Success
        await sendChatMessage(inner, 'Request 1');
        await expect(inner.locator('.message.assistant').last()).toHaveText('First Response', { timeout: 10000 });

        // 3. Turn 2: Send "Request 2" -> This triggers continuous tool calls that reach max iterations
        await sendChatMessage(inner, 'Request 2');

        // 4. Wait for the halted container with max iterations message and continue button
        const haltedContainer = inner.locator('.halted-container');
        await expect(haltedContainer).toBeVisible({ timeout: 15000 });

        // 5. Assert the halted message is present with correct text
        const haltedMessage = haltedContainer.locator('.halted-message');
        await expect(haltedMessage).toBeVisible();
        await expect(haltedMessage).toContainText('Max iterations reached');

        // 6. Assert the continue button is visible
        const continueBtn = haltedContainer.locator('button.continue-button');
        await expect(continueBtn).toBeVisible();

        // 7. Verify that previous messages are still visible above the halted container
        const userMessages = inner.locator('.message.user');
        await expect(userMessages.nth(0)).toHaveText('Request 1');
        await expect(inner.locator('.message.assistant').nth(0)).toHaveText('First Response');
        await expect(userMessages.nth(1)).toHaveText('Request 2');

        // 8. Click the "Continue" button
        await continueBtn.click();

        // 9. Recovery Phase: Halted container should be removed
        await expect(haltedContainer).not.toBeVisible();

        // 10. Final Verification: Success after continue
        const finalAssistantMessage = inner.locator('.message.assistant').last();
        await expect(finalAssistantMessage).toContainText('Success after continuing from max iterations', { timeout: 15000 });

        // 11. CRUCIAL: Verify History Integrity
        // When max iterations is reached with tool calls, the history includes all intermediate tool calls and results.
        // After continuing, the new request should be sent with this full history.
        // Filter requests for our endpoint
        const maxIterationRequests = capturedRequests.filter(r => r.endpoint === 'max-iterations');
        
        // Last request is the continue click
        const lastRequest = maxIterationRequests[maxIterationRequests.length - 1].body;
        
        // Verify structure: Should start with System Message, then User Request 1, Assistant First Response, User Request 2
        // and include all the intermediate tool calls that triggered max iterations
        expect(lastRequest.messages.length).toBeGreaterThan(4);
        expect(lastRequest.messages[0].role).toBe('system');
        expect(lastRequest.messages[0].content).toContain('code assistant');
        
        // Verify the conversation started correctly
        expect(lastRequest.messages[1]).toMatchObject({ role: 'user', content: 'Request 1' });
        expect(lastRequest.messages[2]).toMatchObject({ role: 'assistant', content: 'First Response' });
        expect(lastRequest.messages[3]).toMatchObject({ role: 'user', content: 'Request 2' });
        
        // Verify the last message in history before the continue request shows tool calls
        // (indicating the agent made progress through iterations)
        const lastHistoryMessage = lastRequest.messages[lastRequest.messages.length - 1];
        expect(lastHistoryMessage.role).toBe('tool');
    });

    test('should preserve and continue reasoning bubble when reaching max iterations and clicking continue', async () => {
        // await openChatView(page);
        const inner = await getChatFrames(page);

        // 1. Switch to the max-iterations-reasoning profile and start a new chat
        await switchModel(inner, 'maxIterationsReasoningProvider');
        await clickNewChat(page);

        // 2. Turn 1: Send "Request 1" -> Success
        await sendChatMessage(inner, 'Request 1');
        await expect(inner.locator('.message.assistant').last()).toHaveText('First Response', { timeout: 10000 });

        // 3. Turn 2: Send "Request 2" -> This triggers continuous reasoning + tool calls that reach max iterations
        await sendChatMessage(inner, 'Request 2');

        // 4. Wait for the halted container with max iterations message and continue button
        const haltedContainer = inner.locator('.halted-container');
        await expect(haltedContainer).toBeVisible({ timeout: 20000 });

        // 5. Assert the halted message is present with correct text
        const haltedMessage = haltedContainer.locator('.halted-message');
        await expect(haltedMessage).toContainText('Max iterations reached');

        // 6. Assert the continue button is visible and has correct text
        const continueBtn = haltedContainer.locator('button.continue-button');
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toContainText('Continue');

        // 7. Assert that initial reasoning is displayed
        const assistantMessage = inner.locator('.message.assistant').last();
        const reasoningContainer = assistantMessage.locator('.reasoning-container');
        const reasoningContent = reasoningContainer.locator('.reasoning-content');
        await expect(reasoningContainer).toBeVisible();
        // It should contain multiple "Thinking turn X... " messages
        await expect(reasoningContent).toContainText('Thinking turn 2...');
        await expect(reasoningContent).toContainText('Thinking turn 11...');

        // 8. Click the "Continue" button
        await continueBtn.click();

        // 9. Recovery Phase: Halted container should be removed
        await expect(haltedContainer).not.toBeVisible();

        // 10. Final Verification
        // - Reasoning should contain BOTH parts (initial turns + final thought)
        await expect(reasoningContent).toContainText('Thinking turn 11...', { timeout: 15000 });
        await expect(reasoningContent).toContainText('Final thought.', { timeout: 15000 });
        
        // - Final answer should be displayed
        await expect(assistantMessage).toContainText('Final answer.');

        // - EXTREMELY CRUCIAL: There should be exactly ONE reasoning container
        await expect(assistantMessage.locator('.reasoning-container')).toHaveCount(1);

        // 11. CRUCIAL: Verify History Integrity
        const maxReasoningRequests = capturedRequests.filter(r => r.endpoint === 'max-iterations-reasoning');
        const lastRequest = maxReasoningRequests[maxReasoningRequests.length - 1].body;
        
        // Check history cleanliness: no halt messages should be sent to the LLM
        expect(lastRequest.messages.every((m: any) => 
            m.content === undefined || 
            (typeof m.content === 'string' && !m.content.includes('Max iterations reached'))
        )).toBe(true);
        
        // Verify we have multiple reasoning steps in history
        // They are now merged into content via <thought> tags
        const assistantMessagesWithMergedReasoning = lastRequest.messages.filter((m: any) => 
            m.role === 'assistant' && 
            typeof m.content === 'string' && 
            m.content.includes('<thought>')
        );
        expect(assistantMessagesWithMergedReasoning.length).toBeGreaterThan(5);
        expect(assistantMessagesWithMergedReasoning.some((m: any) => m.content.includes('Thinking turn 2'))).toBe(true);
        
        // Also verify that the reasoning field itself is NOT present in the messages sent to LLM
        expect(lastRequest.messages.every((m: any) => m.reasoning === undefined)).toBe(true);
    });

    test('should remove retry button and error message when user sends a new message after failure', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to the always-fail profile and start a new chat
        await switchModel(inner, 'alwaysFailProvider');
        await clickNewChat(page);

        // 2. Trigger a failure
        await sendChatMessage(inner, 'Fail me');

        // 3. Wait for the error container and retry button to appear
        const assistantMessage = inner.locator('.message.assistant').last();
        const errorContainer = assistantMessage.locator('.error-container');
        await expect(errorContainer).toBeVisible({ timeout: 15000 });
        await expect(assistantMessage).toHaveClass(/error/);

        // 4. Switch to a working provider so the next message succeeds
        await switchModel(inner, 'testProvider');

        // 5. Send a new message instead of clicking retry
        await sendChatMessage(inner, 'New message');

        // 6. Verify the error container is removed and the class is gone
        await expect(errorContainer).not.toBeVisible();
        await expect(assistantMessage).not.toHaveClass(/error/);
        
        // 7. Verify the new message is processed
        // history: ['Fail me', 'New message'] -> assistant echoes both
        await expect(inner.locator('.message.assistant').last()).toHaveText('Fail me New message', { timeout: 10000 });
    });

    test('should remove continue button and halted message when user sends a new message after halt', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to the always-halt profile and start a new chat
        await switchModel(inner, 'alwaysHaltProvider');
        await clickNewChat(page);

        // 2. Trigger a halt (max iterations)
        await sendChatMessage(inner, 'Halt me');

        // 3. Wait for the halted container and continue button to appear
        const assistantMessage = inner.locator('.message.assistant').last();
        const haltedContainer = assistantMessage.locator('.halted-container');
        await expect(haltedContainer).toBeVisible({ timeout: 20000 });
        await expect(assistantMessage).toHaveClass(/halted/);

        // 4. Switch to a working provider
        await switchModel(inner, 'testProvider');

        // 5. Send a new message instead of clicking continue
        await sendChatMessage(inner, 'New message');

        // 6. Verify the halted container is removed and the class is gone
        await expect(haltedContainer).not.toBeVisible();
        await expect(assistantMessage).not.toHaveClass(/halted/);
        
        // 7. Verify the new message is processed
        // The history will include the tool calls from the halt, but since we switched to testProvider,
        // it just echoes the user messages it sees in the history.
        // history includes ['Halt me', 'New message']
        await expect(inner.locator('.message.assistant').last()).toContainText('Halt me New message', { timeout: 10000 });
    });

    test('should bypass confirmation when "Auto-Accept Edits" is enabled', async () => {
        const inner = await getChatFrames(page);

        // 1. Switch to autoAcceptEditsProvider
        await switchModel(inner, 'autoAcceptEditsProvider');
        await clickNewChat(page);

        // 2. Enable Auto-Accept Edits via the view title action
        // The icon is "$(zap)", and we have two commands toggled by context.
        // We look for the one that is currently visible (Enable).
        const enableBtn = page.locator('[role="button"][aria-label="Suggestio: Enable Auto-Accept Edits"]').first();
        await enableBtn.click();

        // 3. Send a message that triggers a write_file tool call
        await sendChatMessage(inner, 'Edit file automatically');

        // 4. Verify that the tool call starts and completes WITHOUT showing a confirmation UI
        const assistantMessage = inner.locator('.message.assistant').last();

        // Wait for the tool call container to appear
        const toolCall = assistantMessage.locator('.tool-call-container').first();
        await expect(toolCall).toBeVisible({ timeout: 15000 });
        await expect(toolCall).toContainText('Writing file auto.txt');

        // Verify that NO confirmation container appears
        const confirmation = assistantMessage.locator('.tool-confirmation-container');
        await expect(confirmation).not.toBeVisible();

        // Verify that the tool eventually completes (shows checkmark or success message)
        await expect(toolCall).toContainText('Successfully wrote auto.txt', { timeout: 10000 });

        // 5. Disable Auto-Accept Edits for future tests and verify it asks again
        const disableBtn = page.locator('[role="button"][aria-label="Suggestio: Disable Auto-Accept Edits"]').first();
        await disableBtn.click();

        await sendChatMessage(inner, 'Edit file again');
        const finalConfirmation = assistantMessage.locator('.tool-confirmation-container').last();
        await expect(finalConfirmation).toBeVisible({ timeout: 15000 });
        
        // Click Deny to finish the agent turn and avoid state leakage
        await finalConfirmation.locator('button.deny-btn').click();
        await expect(finalConfirmation).not.toBeVisible();
    });

    test('should bypass confirmation for subsequent replace_text calls after "Always Allow" is clicked', async () => {
        // await openChatView(page);
        const inner = await getChatFrames(page);

        // 1. Pre-create the file to be edited
        fs.writeFileSync(path.join(tempWorkspacePath, 'test.txt'), 'original text');

        // 2. Switch to alwaysAllowEditProvider
        await switchModel(inner, 'alwaysAllowEditProvider');
        await clickNewChat(page);

        // 3. Trigger the first replace_text tool call
        await sendChatMessage(inner, 'Replace text in test.txt');

        // 4. Assert the three buttons are displayed
        const assistantMessage = inner.locator('.message.assistant').last();
        const confirmation = assistantMessage.locator('.tool-confirmation-container');
        await expect(confirmation).toBeVisible({ timeout: 15000 });
        
        const allowBtn = confirmation.locator('button.allow-btn');
        const alwaysAllowBtn = confirmation.locator('button.always-allow-btn');
        const denyBtn = confirmation.locator('button.deny-btn');
        
        await expect(allowBtn).toBeVisible();
        await expect(alwaysAllowBtn).toBeVisible();
        await expect(denyBtn).toBeVisible();

        // 5. The user clicks "Always Allow"
        await alwaysAllowBtn.click();

        // 6. Assert the request container is removed
        await expect(confirmation).not.toBeVisible();
        
        // Wait for the tool to complete successfully
        const toolCall = assistantMessage.locator('.tool-call-container').last();
        await expect(toolCall).toContainText('Successfully replaced text', { timeout: 10000 });

        // Verify the file was actually changed on disk
        const contentAfterFirst = fs.readFileSync(path.join(tempWorkspacePath, 'test.txt'), 'utf8');
        expect(contentAfterFirst).toBe('modified text');

        // Wait for the final content of the first turn to ensure input is re-enabled
        await expect(assistantMessage).toContainText('Finished turn 1', { timeout: 10000 });
        
        const input = inner.locator('#messageInput');
        await expect(input).toBeEnabled({ timeout: 10000 });

        // 7. A second replace_text goes through without asking the user permission
        await sendChatMessage(inner, 'Replace text again');
        
        const assistantMessage2 = inner.locator('.message.assistant').last();
        const toolCall2 = assistantMessage2.locator('.tool-call-container').first();
        await expect(toolCall2).toBeVisible({ timeout: 15000 });
        await expect(toolCall2).toContainText('Replacing text in test.txt');

        // Verify that NO confirmation container appears for the second call
        const confirmation2 = assistantMessage2.locator('.tool-confirmation-container');
        await expect(confirmation2).not.toBeVisible();
        
        // Verify success
        await expect(toolCall2).toContainText('Successfully replaced text', { timeout: 10000 });

        // Verify the file reached the final state on disk
        const contentAfterSecond = fs.readFileSync(path.join(tempWorkspacePath, 'test.txt'), 'utf8');
        expect(contentAfterSecond).toBe('final text');
    });

    test('should bypass confirmation for subsequent run_command calls after "Always Allow" is clicked', async () => {
        // uncomment this if you want to run this test in isolation
        // await openChatView(page);

        const inner = await getChatFrames(page);

        // 1. Switch to runCommandProvider
        await switchModel(inner, 'runCommandProvider');
        await clickNewChat(page);

        // 2. Trigger the first run_command tool call
        await sendChatMessage(inner, 'Run first command');

        // 3. Assert the three buttons are displayed
        const assistantMessage = inner.locator('.message.assistant').last();
        const confirmation = assistantMessage.locator('.tool-confirmation-container');
        await expect(confirmation).toBeVisible({ timeout: 15000 });
        
        const allowBtn = confirmation.locator('button.allow-btn');
        const alwaysAllowBtn = confirmation.locator('button.always-allow-btn');
        const denyBtn = confirmation.locator('button.deny-btn');
        
        await expect(allowBtn).toBeVisible();
        await expect(alwaysAllowBtn).toBeVisible();
        await expect(denyBtn).toBeVisible();

        // 4. The user clicks "Always Allow"
        await alwaysAllowBtn.click();

        // 5. Assert the request container is removed
        await expect(confirmation).not.toBeVisible();
        
        // Wait for the tool to complete successfully
        const toolCall = assistantMessage.locator('.tool-call-container').last();
        await expect(toolCall).toContainText('Executing command: echo "test"', { timeout: 10000 });

        // Wait for the final content of the turn to ensure input is re-enabled
        await expect(assistantMessage).toContainText('Finished turn 1', { timeout: 10000 });
        
        const input = inner.locator('#messageInput');
        await expect(input).toBeEnabled({ timeout: 10000 });

        // 6. A second run_command with the SAME arguments goes through without asking
        await sendChatMessage(inner, 'Run same command again');
        
        const assistantMessage2 = inner.locator('.message.assistant').last();
        const toolCall2 = assistantMessage2.locator('.tool-call-container').first();
        await expect(toolCall2).toBeVisible({ timeout: 15000 });
        await expect(toolCall2).toContainText('Executing command: echo "test"');

        // Verify that NO confirmation container appears
        const confirmation2 = assistantMessage2.locator('.tool-confirmation-container');
        await expect(confirmation2).not.toBeVisible();
        
        // Verify success - the command output should be "test"
        await expect(toolCall2).toContainText('test', { timeout: 10000 });

        // 7. A request for a DIFFERENT command requires user permission
        await sendChatMessage(inner, 'Run silent command');
        
        const assistantMessage3 = inner.locator('.message.assistant').last();
        const confirmation3 = assistantMessage3.locator('.tool-confirmation-container');
        await expect(confirmation3).toBeVisible({ timeout: 15000 });
        
        // Click Allow
        await confirmation3.locator('button.allow-btn').click();
        await expect(confirmation3).not.toBeVisible();
        
        const toolCall3 = assistantMessage3.locator('.tool-call-container').last();
        await expect(toolCall3).toContainText('Executing command: echo "test" --silent', { timeout: 10000 });
    });
});
