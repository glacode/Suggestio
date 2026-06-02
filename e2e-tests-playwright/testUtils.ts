import { Page, expect } from '@playwright/test';

/**
 * Robustly opens the Suggestio chat view.
 * Uses F1 and waits for UI states instead of arbitrary timeouts.
 */
export async function openChatView(page: Page) {
    const outerSelector = 'iframe.webview[src*="glacode.suggestio"]';
    
    // 1. Wait for workbench and ensure focus
    await page.locator('.monaco-workbench').waitFor({ state: 'visible', timeout: 30000 });
    await page.focus('body');

    // 2. Check if it's already open (fast check)
    if (await page.locator(outerSelector).count() > 0) {
        return;
    }

    const triggerCommand = async () => {
        await page.keyboard.press('F1');
        const quickInput = page.locator('.quick-input-widget');
        // Wait for the quick pick widget to appear with a short timeout to retry fast
        await quickInput.waitFor({ state: 'visible', timeout: 3000 });
        
        await page.keyboard.type('Suggestio: Focus on Chat View', { delay: 5 });
        
        const commandOption = page.locator('.quick-input-list .monaco-list-row', { hasText: 'Suggestio: Focus on Chat View' });
        await commandOption.first().waitFor({ state: 'visible', timeout: 3000 });
        
        await page.keyboard.press('Enter');
    };

    try {
        await triggerCommand();
        // If the webview appears, we are done
        await page.waitForSelector(outerSelector, { timeout: 10000 });
    } catch (e) {
        console.log('Fast attempt failed or command not ready. Retrying with full timeouts...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500); // Small cooldown before retry
        await triggerCommand();
        await page.waitForSelector(outerSelector, { timeout: 15000 });
    }
}

/**
 * Locates the nested chat frames (outer VS Code webview iframe and inner extension iframe).
 */
export async function getChatFrames(page: Page) {
    const outerSelector = 'iframe.webview[src*="glacode.suggestio"]';
    const outer = page.frameLocator(outerSelector);
    // The inner iframe has no predictable ID/src, so we wait for its existence
    const innerIframe = outer.locator('iframe');
    await innerIframe.waitFor({ state: 'visible', timeout: 15000 });
    return outer.frameLocator('iframe');
}

/**
 * Sends a message in the chat.
 */
export async function sendChatMessage(innerFrame: ReturnType<Page["frameLocator"]>, message: string) {
    const input = innerFrame.locator('#messageInput');
    await input.click(); // Focus
    await input.fill(message); // fill() is faster and safer than type()
    const sendBtn = innerFrame.locator('.send-icon');
    await sendBtn.click();
}

/**
 * Clicks the "New Chat" button in the VS Code title bar menu.
 */
export async function clickNewChat(page: Page) {
    const newChatBtn = page.locator('[role="button"][aria-label="Suggestio: New Chat"]').first();
    await newChatBtn.click();
}

/**
 * Switches the model in the chat view dropdown.
 */
export async function switchModel(inner: ReturnType<Page["frameLocator"]>, profileId: string) {
    const selector = inner.locator('#profile-selector');
    await selector.click();
    const dropdown = inner.locator('.dropdown-content');
    await dropdown.waitFor({ state: 'visible' });
    const option = dropdown.locator(`.dropdown-item[data-id="${profileId}"]`);
    await option.click();
    
    // Give it a moment to propagate
    await new Promise(resolve => setTimeout(resolve, 500));
}
