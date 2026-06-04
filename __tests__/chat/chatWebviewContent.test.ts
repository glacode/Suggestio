import { describe, it, expect } from '@jest/globals';
import { getChatWebviewContent } from '../../src/chat/chatWebviewContent.js';
import type { IFileContentReader, InitialState } from '../../src/types.js';
import { createMockUri, createMockVscodeApi } from '../testUtils.js';

describe('getChatWebviewContent', () => {
    it('should replace all placeholders including nonce and cspSource', () => {
        // Mock dependencies using project factories to avoid type assertions
        const extensionUri = createMockUri('/ext');
        const chatJsUri = createMockUri('vscode-resource:/chat.js');
        const markdownJsUri = createMockUri('vscode-resource:/markdown.js');
        const highlightCssUri = createMockUri('vscode-resource:/highlight.css');
        const chatCssUri = createMockUri('vscode-resource:/chat.css');
        
        const initialState: InitialState = {
            chatProfileIds: ['p1'],
            activeChatProfileId: 'p1',
            allProfileIds: [],
            activeCompletionProfileId: 'p1',
            profileMetadata: []
        };

        const vscodeApi = createMockVscodeApi((base, ...parts) => ({
            fsPath: `${base.fsPath}/${parts.join('/')}`,
            toString: () => `file://${base.fsPath}/${parts.join('/')}`
        }));

        const mockHtml = `
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{cspSource}}; script-src 'nonce-{{nonce}}';">
            <script nonce="{{nonce}}">window.initialState = {{initialState}};</script>
            <script nonce="{{nonce}}" src="{{markdownJsUri}}"></script>
            <script nonce="{{nonce}}" src="{{chatJsUri}}"></script>
            <link rel="stylesheet" href="{{highlightCssUri}}">
            <link rel="stylesheet" href="{{chatCssUri}}">
        `;

        const fileReader: IFileContentReader = {
            read: () => mockHtml
        };

        const nonce = 'test-nonce-123';
        const cspSource = 'vscode-resource:';

        const result = getChatWebviewContent({
            extensionUri,
            chatJsUri,
            markdownJsUri,
            highlightCssUri,
            chatCssUri,
            initialState,
            vscodeApi,
            fileReader,
            nonce,
            cspSource
        });

        // Assertions
        expect(result).toContain("style-src vscode-resource:");
        expect(result).toContain("script-src 'nonce-test-nonce-123'");
        expect(result).toContain('nonce="test-nonce-123"');
        // Ensure all 4 nonce occurrences are replaced (meta + 3 scripts)
        const nonceMatches = result.match(/test-nonce-123/g);
        expect(nonceMatches?.length).toBe(4);
        
        expect(result).toContain('src="vscode-resource:/markdown.js"');
        expect(result).toContain('src="vscode-resource:/chat.js"');
        expect(result).toContain('href="vscode-resource:/highlight.css"');
        expect(result).toContain('href="vscode-resource:/chat.css"');
        expect(result).toContain(JSON.stringify(initialState));
    });
});
