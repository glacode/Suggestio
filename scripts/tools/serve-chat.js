import express from 'express';
import path from 'path';
import chokidar from 'chokidar';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Dev CSP: the webview ships with a strict CSP (default-src 'none' + nonce).
// In a plain browser there is no vscode to mint nonces, so replace it with a
// permissive, localhost-only policy for development.
// ---------------------------------------------------------------------------
const DEV_CSP = "content=\"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ws://localhost:3000; img-src 'self' data:; font-src 'self' data:\">";

// ---------------------------------------------------------------------------
// Template replacement values for the current chat.html placeholders.
// ---------------------------------------------------------------------------
const devInitialState = JSON.stringify({
    chatProfileIds: ['dev'],
    activeChatProfileId: 'dev',
    disableSanitizer: false,
});

function replacePlaceholders(html) {
    return html
        // CSP meta: chat.html:6 ships {{cspSource}}/{{nonce}}; swap the whole tag
        .replace(
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src {{cspSource}}; script-src \'nonce-{{nonce}}\';">',
            `<meta http-equiv="Content-Security-Policy" ${DEV_CSP}`
        )
        // Remaining nonce attribute references (script tags) become inert
        .split('{{nonce}}').join('dev')
        .split('{{chatCssUri}}').join('/media/chat.css')
        .split('{{highlightCssUri}}').join('/media/highlight.css')
        .split('{{markdownJsUri}}').join('/builtResources/renderMarkDown.js')
        .split('{{chatJsUri}}').join('/builtResources/chat.js')
        .split('{{initialState}}').join(devInitialState);
}

// ---------------------------------------------------------------------------
// Mock vscode API injected into builtResources/chat.js.
// The bundled chat.js (src/webView/main.ts) calls acquireVsCodeApi()
// unconditionally; there is no dev fallback. We string-patch the single
// `acquireVsCodeApi()` occurrence so the harness works without touching src.
// NOTE: this is intentionally brittle — the anchor must stay unique/matched
// to the bundle (see the plan's Option A trade-off).
// ---------------------------------------------------------------------------
const MOCK_VSCODE_EXPR = `((() => {
    let mockState = undefined;
    return {
        getState() { return mockState; },
        setState(newState) { mockState = newState; return newState; },
        postMessage(message) {
            console.log('[mock vscode]', message);
            if (message) {
                if (message.command === 'sendMessage') {
                    window.__mockSend && window.__mockSend(message.text);
                }
                if (message.command === 'cancelRequest') {
                    window.__mockCancel && window.__mockCancel();
                }
            }
        }
    };
})())`;

function patchChatJs(source) {
    const patched = source.replace('acquireVsCodeApi()', MOCK_VSCODE_EXPR);
    if (patched === source) {
        console.warn('[serve-chat] WARNING: could not find `acquireVsCodeApi()` anchor in builtResources/chat.js. Rebuild it (npm run build:webview) — the mock vscode API will not be injected.');
    }
    return patched;
}

// ---------------------------------------------------------------------------
// Live-reload + mock assistant streaming (injected into the served page).
// ---------------------------------------------------------------------------
const devScript = `
<script>
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
        if (event.data === 'reload') {
            window.location.reload();
        }
    };

    // Simulates the extension's side of the conversation:
    // echoes the user bubble, streams assistant content, then completes.
    window.__mockSend = function (userText) {
        window.postMessage({ sender: 'user', text: userText }, '*');
        const fakeResponse = 'This is a fake assistant response that is approximately thirty words long to give you a realistic idea of how the chat will look with a typical response from the assistant.';
        const words = fakeResponse.split(' ');
        let wordIndex = 0;
        window.__mockCancel = () => { clearInterval(interval); };
        const interval = setInterval(() => {
            if (wordIndex < words.length) {
                window.postMessage({ sender: 'assistant', type: 'tokens', tokenType: 'content', text: words[wordIndex] + ' ' }, '*');
                wordIndex++;
            } else {
                window.postMessage({ sender: 'assistant', type: 'completion', text: '' }, '*');
                clearInterval(interval);
                window.__mockCancel = null;
            }
        }, 100);
    };
</script>
`;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Patch the chat bundle BEFORE the shared /builtResources static handler.
app.get('/builtResources/chat.js', (req, res) => {
    const filePath = path.join(projectRoot, 'builtResources', 'chat.js');
    res.type('application/javascript');
    res.send(patchChatJs(fs.readFileSync(filePath, 'utf8')));
});

app.use('/media', express.static(path.join(projectRoot, 'media')));
app.use('/builtResources', express.static(path.join(projectRoot, 'builtResources')));
app.use('/resources', express.static(path.join(projectRoot, 'resources')));

// Serve the main chat HTML file
app.get('/', (req, res) => {
    const chatHtmlPath = path.join(projectRoot, 'media', 'chat.html');
    fs.readFile(chatHtmlPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading chat.html');
            return;
        }

        let modifiedHtml = replacePlaceholders(data);
        modifiedHtml = modifiedHtml.replace('</head>', '</head>\n<style>\n' + devStyle() + '</style>');
        modifiedHtml = modifiedHtml.replace('</body>', devScript + '</body>');

        res.send(modifiedHtml);
    });
});

const devStyle = () => `
    :root {
        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        --vscode-font-size: 13px;

        /* Light Theme */
        --vscode-editor-foreground: #333;
        --vscode-editor-background: #fff;
        --vscode-editorWidget-border: #ccc;
        --vscode-editorWidget-background: #f3f3f3;
        --vscode-input-background: #fff;
        --vscode-input-border: #ccc;
        --vscode-input-foreground: #333;
        --vscode-focusBorder: #007fd4;
        --vscode-button-background: #007fd4;
        --vscode-button-foreground: #fff;
        --vscode-button-hoverBackground: #005a9e;
        --vscode-descriptionForeground: #777;
    }

    @media (prefers-color-scheme: dark) {
        :root {
            /* Dark Theme */
            --vscode-editor-foreground: #ccc;
            --vscode-editor-background: #1e1e1e;
            --vscode-editorWidget-border: #444;
            --vscode-editorWidget-background: #252526;
            --vscode-input-background: #3c3c3c;
            --vscode-input-border: #3c3c3c;
            --vscode-input-foreground: #ccc;
            --vscode-focusBorder: #007fd4;
            --vscode-button-background: #0e639c;
            --vscode-button-foreground: #fff;
            --vscode-button-hoverBackground: #1177bb;
            --vscode-descriptionForeground: #888;
        }
    }
`;

const server = app.listen(port, () => {
    console.log(`Chat dev server listening at http://localhost:${port}`);
});

// WebSocket server for live reload
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
    console.log('Client connected for live reload');
});

const broadcastReload = () => {
    wss.clients.forEach(client => {
        client.send('reload');
    });
};

// Watch for file changes
const watcher = chokidar.watch([
    path.join(projectRoot, 'media', 'chat.html'),
    path.join(projectRoot, 'media', 'chat.css'),
    path.join(projectRoot, 'builtResources', 'chat.js'),
    path.join(projectRoot, 'builtResources', 'renderMarkDown.js'),
    path.join(projectRoot, 'media', 'highlight.css'),
], {
    ignored: /(^|[\][/])\..*/, // ignore dotfiles
    persistent: true
});

watcher.on('change', path => {
    console.log(`File ${path} has been changed. Reloading...`);
    broadcastReload();
});