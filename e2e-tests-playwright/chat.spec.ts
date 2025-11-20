
import { test, expect, Page } from '@playwright/test';
import { launchVscode } from './vscode-runner';
import { ElectronApplication } from 'playwright';

test.describe('Chat E2E', () => {
    let electronApp: ElectronApplication;
    let page: Page;

    test.beforeAll(async () => {
        const { electronApp: app } = await launchVscode();
        electronApp = app;

        // Wait for the main window to open
        page = await electronApp.firstWindow();

        // It might take a while for the extension to load
        await page.waitForTimeout(5000);

        // Open the chat view
        await page.keyboard.press('Control+Shift+P');
        await page.waitForTimeout(500); // small delay to ensure the command palette is open
        await page.keyboard.type('Suggestio: Focus on Chat View', { delay: 50 });
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');

        // const cmdInput = page.locator('.quick-input-widget .quick-input-input');
        // // await cmdInput.waitFor();       // must wait for UI
        // await cmdInput.fill('>Suggestio: Focus on Chat View');
        // await page.keyboard.press('Enter');

        // It might take a while for the webview to load
        await page.waitForTimeout(2000);
    });

    test.afterAll(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    test('should display user input in chat history', async () => {

        // Wait for the correct webview iframe
        const outerFrameSelector = 'iframe.webview[src*="glacode.suggestio"]';
        await page.waitForSelector(outerFrameSelector);

        const outer = page.frameLocator(outerFrameSelector);

        // VSCode webviews contain an inner iframe – wait for it
        await outer.locator('iframe').waitFor({ state: 'visible' });
        const inner = outer.frameLocator('iframe');

        // Now wait for your textarea inside the inner iframe
        const chatInput = inner.locator('#messageInput');
        await chatInput.waitFor({ state: 'visible' });

        // await chatInput.fill('Hello');  // it works, but page.keyboard.type is closer to real user interaction
        await page.keyboard.type('Hello', { delay: 50 });
        await expect(chatInput).toHaveValue('Hello');

        await page.waitForTimeout(2000); // wait for 2 seconds to see the input
    });
});
