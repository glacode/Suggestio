import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import { launchVscode } from './vscode-runner';
import { ElectronApplication } from 'playwright';
import express from 'express';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { openChatView, getChatFrames, sendChatMessage, clickNewChat } from './testUtils';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createTempWorkspace(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestio-playwright-security-workspace-'));
    return tempDir;
}

function writeMockConfig(workspace: string) {
    const mockConfig = {
        profiles: {
            securityProvider: {
                endpoint: "http://localhost:3002/v1/chat/completions",
                model: "malicious-model",
                isApiKeyRequired: false
            }
        }
    };
    fs.writeFileSync(
        path.join(workspace, 'suggestio.config.json'),
        JSON.stringify(mockConfig, null, 2)
    );
}

function writeSSEChunk(res: any, data: any) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendDone(res: any) {
    res.write('data: [DONE]\n\n');
}

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

function createMockServer(): Promise<Server> {
    return new Promise(resolve => {
        const app = express();
        app.use(express.json());
        app.post('/v1/chat/completions', (_req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            const maliciousPayload = 'Safe text. <script>window.XSS_EXECUTED=true;</script> <img src=x onerror="window.XSS_EXECUTED=true;"> End.';
            streamDefaultModel(res, maliciousPayload);
        });
        const server = app.listen(3002, () => resolve(server));
    });
}

// -----------------------------------------------------------------------------
// Security Test Suite
// -----------------------------------------------------------------------------

test.describe('Sanitizer Effectiveness E2E', () => {
    let electronApp: ElectronApplication;
    let page: Page;
    let server: Server | null = null;
    let tempWorkspacePath: string;

    test.beforeAll(async () => {
        tempWorkspacePath = createTempWorkspace();
        writeMockConfig(tempWorkspacePath);
        server = await createMockServer();

        const result = await launchVscode(tempWorkspacePath, {
            'suggestio.activeChatProfile': 'securityProvider',
            'suggestio.debug.security.disableSanitizer': false // Sanitizer ENABLED by default
        });
        electronApp = result.electronApp;
        page = await electronApp.firstWindow();
        await openChatView(page);
    });

    test.afterAll(async () => {
        if (electronApp) { await electronApp.close(); }
        if (server) { server.close(); }
        if (tempWorkspacePath) { fs.rmSync(tempWorkspacePath, { recursive: true, force: true }); }
    });

    test('Sanitizer: should strip malicious content before it triggers CSP', async () => {
        await clickNewChat(page);
        const inner = await getChatFrames(page);

        const violations: string[] = [];
        const consoleListener = (msg: ConsoleMessage) => {
            const text = msg.text();
            if (text.startsWith('CSP_VIOLATION:')) {
                violations.push(text.replace('CSP_VIOLATION:', ''));
            }
        };
        page.on('console', consoleListener);

        await inner.locator('html').evaluate(() => {
            document.addEventListener('securitypolicyviolation', (e) => {
                if (e instanceof SecurityPolicyViolationEvent) {
                    console.log('CSP_VIOLATION:' + e.violatedDirective);
                }
            });
        });

        await sendChatMessage(inner, 'trigger xss');
        const lastAssistantMessage = inner.locator('.message.assistant').last();
        await expect(lastAssistantMessage).toContainText('End.', { timeout: 15000 });

        page.off('console', consoleListener);

        // 1. Verify that NO script-related violations occurred.
        // DOMPurify is our first line of defense: it should strip the <script> tag 
        // and the malicious 'onerror' attribute from the <img> tag BEFORE the browser 
        // even attempts to execute them. This prevents 'script-src' and 'script-src-attr' 
        // CSP violations from even happening.
        expect(violations).not.toContain('script-src');
        expect(violations).not.toContain('script-src-attr');

        // 2. Verify that an 'img-src' violation occurred.
        // This is expected and proves DOMPurify's behavior: 
        // DOMPurify strips the DANGEROUS 'onerror' attribute but keeps the SAFE <img> tag.
        // When the browser tries to render the <img> tag, our extremely strict 
        // 'default-src none' CSP steps in as a SECOND line of defense and blocks the image load,
        // triggering this violation.
        expect(violations).toContain('img-src');

        // 3. Verify that script and img tags with handlers are NOT in the DOM
        const scripts = await lastAssistantMessage.locator('script').count();
        expect(scripts).toBe(0);

        const imagesWithOnerror = await lastAssistantMessage.locator('img[onerror]').count();
        expect(imagesWithOnerror).toBe(0);
        
        // 3. Verify safe text is still there
        await expect(lastAssistantMessage).toContainText('Safe text.');

        // 4. Verify that the XSS did NOT execute (double check)
        const xssExecuted = await inner.locator('body').evaluate('window["XSS_EXECUTED"]');
        expect(xssExecuted).toBeUndefined();
    });
});

test.describe('Security Isolation E2E', () => {
    let electronApp: ElectronApplication;
    let page: Page;
    let server: Server | null = null;
    let tempWorkspacePath: string;

    test.beforeAll(async () => {
        tempWorkspacePath = createTempWorkspace();
        writeMockConfig(tempWorkspacePath);
        server = await createMockServer();

        const result = await launchVscode(tempWorkspacePath, {
            'suggestio.activeChatProfile': 'securityProvider',
            'suggestio.debug.security.disableSanitizer': true // Bypass sanitizer to test CSP
        });
        electronApp = result.electronApp;
        page = await electronApp.firstWindow();
        
        // Ensure extension is activated and view is open
        await openChatView(page);
    });

    test.afterAll(async () => {
        if (electronApp) { await electronApp.close(); }
        if (server) { server.close(); }
        if (tempWorkspacePath) { fs.rmSync(tempWorkspacePath, { recursive: true, force: true }); }
    });

    test('CSP: should block malicious scripts and styles when sanitizer is disabled', async () => {
        await clickNewChat(page);
        const inner = await getChatFrames(page);

        // Assert the CSP Header Template Configuration
        const cspContent = await inner.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        expect(cspContent).toContain("default-src 'none'");
        
        const violations: string[] = [];
        const consoleListener = (msg: ConsoleMessage) => {
            const text = msg.text();
            if (text.startsWith('CSP_VIOLATION:')) {
                violations.push(text.replace('CSP_VIOLATION:', ''));
            }
        };
        page.on('console', consoleListener);

        await inner.locator('html').evaluate(() => {
            document.addEventListener('securitypolicyviolation', (e: any) => {
                console.log('CSP_VIOLATION:' + e.violatedDirective);
            });
        });

        await sendChatMessage(inner, 'trigger xss');
        await expect(inner.locator('.message.assistant').last()).toContainText('End.', { timeout: 15000 });

        page.off('console', consoleListener);

        // Check for CSP violations (script-src-attr and img-src)
        expect(violations.length).toBeGreaterThan(0);
        expect(violations).toContain('script-src-attr');
        expect(violations).toContain('img-src');
    });
});
