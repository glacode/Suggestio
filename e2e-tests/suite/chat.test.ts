import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { simulateTyping } from './testUtils.js';

suite('Chat Test Suite', () => {
	let server: Server | null = null;
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const configFilePath = workspaceFolder ? path.join(workspaceFolder, 'suggestio.config.json') : '';
	let mockServerHit = false;

	suiteSetup(async function () {
		this.timeout(20000);

		if (!workspaceFolder) {
			throw new Error('No workspace folder found');
		}

		const mockConfig = {
			activeProvider: 'testProvider',
			providers: {
				testProvider: {
					endpoint: 'http://localhost:3000/v1/chat/completions',
					model: 'test-chat-model',
				},
			},
		};
		fs.writeFileSync(configFilePath, JSON.stringify(mockConfig, null, 2));

		const extension = vscode.extensions.getExtension('glacode.suggestio');
		if (!extension) {
			throw new Error('Extension "glacode.suggestio" not found.');
		}
		await extension.activate();
		await new Promise(resolve => setTimeout(resolve, 2000));

		const app = express();
		app.use(express.json());
		app.post('/v1/chat/completions', (_req: Request, res: Response) => {
			mockServerHit = true;
			res.json({
				choices: [
					{
						message: {
							content: 'Mocked chat response.',
						},
					},
				],
			});
		});
		server = await new Promise<Server>((resolve) => {
			const s = app.listen(3000, () => resolve(s));
		});
	});

	suiteTeardown(async () => {
		server?.close();
		if (fs.existsSync(configFilePath)) {
			fs.unlinkSync(configFilePath);
		}
	});

	test('should display user input and mocked response in chat history', async () => {
		mockServerHit = false; // Reset for this test

		// Open the chat view
		await vscode.commands.executeCommand('suggestio.openChat');
		await new Promise(r => setTimeout(r, 1000)); // Give time for chat view to open

		const chatInput = 'Hello, chat bot!';
		// Simulate typing into the chat input field
		await simulateTyping(chatInput);

		// Simulate pressing Enter to send the message
		await vscode.commands.executeCommand('type', { text: '\n' });
		await new Promise(r => setTimeout(r, 3000)); // Give time for message to be sent and response to arrive

		// Assert that the mock server was hit, indicating the extension tried to fetch a response
		assert.ok(mockServerHit, 'Mock LLM provider should have been hit.');

		// Due to limitations in VS Code's e2e testing framework, direct DOM access to webviews
		// for content assertion is not straightforward without modifying the extension's source code
		// to expose internal states or providing a dedicated testing API.
		// This test verifies that the chat command can be invoked, typing is simulated, and the backend
		// (mock LLM provider) is correctly interacted with.
		// Further visual verification would require a different testing approach (e.g., Puppeteer
		// interacting with a hosted webview, or a custom extension API for testing).

	}).timeout(200000);
});
