import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { simulateTyping } from './testUtils.js';

suite('Inline Completion Test Suite', () => {
	// vscode.window.showInformationMessage('Start all tests.');

	let server: Server | null = null;
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const configFilePath = workspaceFolder ? path.join(workspaceFolder, 'suggestio.config.json') : '';

	// Path of the temporary test file
	let tempFilePath: string;

	suiteSetup(async function () {
		this.timeout(20000);

		if (!workspaceFolder) {
			throw new Error('No workspace folder found');
		}

		const mockConfig = {
			activeProvider: 'testProvider',
			providers: {
				testProvider: {
					endpoint: 'http://localhost:3000/v1/completions',
					model: 'test-model',
				},
			},
		};
		fs.writeFileSync(configFilePath, JSON.stringify(mockConfig, null, 2));

		// Explicitly activate the extension
		const extension = vscode.extensions.getExtension('glacode.suggestio');
		if (!extension) {
			throw new Error('Extension "glacode.suggestio" not found.');
		}
		await extension.activate();
		await new Promise(resolve => setTimeout(resolve, 2000)); // Give extension time to activate

		const app = express();
		app.use(express.json());
		app.post('/v1/completions', (_req: Request, res: Response) => {
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
		server = await new Promise<Server>((resolve) => {
			const s = app.listen(3000, () => resolve(s));
		});

		// Create a temporary .cs file for testing
		tempFilePath = path.join(os.tmpdir(), `suggestio-test-${Date.now()}.cs`);
		fs.writeFileSync(tempFilePath, '');
	});

	suiteTeardown(async () => {
		server?.close();
		if (fs.existsSync(configFilePath)) {
			fs.unlinkSync(configFilePath);
		}
		if (fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath);
		}
	});

	test('should provide inline completion from a custom provider', async () => {
		// Open the temporary TypeScript file
		const doc = await vscode.workspace.openTextDocument(tempFilePath);
		const editor = await vscode.window.showTextDocument(doc);

		// Enable inline suggestions globally
		// await vscode.workspace.getConfiguration('editor')
		// 	.update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Global);

		// Ensure cursor is at the start
		editor.selection = new vscode.Selection(0, 0, 0, 0);

		// Simulate typing
		simulateTyping('hello', 150);

		// editor.selection = new vscode.Selection(0, text.length, 0, text.length);

		// Trigger inline suggestion explicitly
		// await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');

		// Allow debounce + mock server response + rendering
		await new Promise(r => setTimeout(r, 1000));
		
		// Trigger inline suggestion explicitly to ensure it's visible before committing
		await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
		await new Promise(r => setTimeout(r, 2000)); // Give it a moment to render

		// Accept the inline suggestion
		await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');

		// Verify the final content
		const updatedContent = editor.document.getText();
		assert.strictEqual(
			updatedContent,
			'hello world',
			`Expected document content to be "hello world" but was "${updatedContent}"`
		);
	}).timeout(200000);
});
