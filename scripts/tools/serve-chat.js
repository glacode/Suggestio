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

// Serve static files
app.use('/media', express.static(path.join(projectRoot, 'media')));
app.use('/builtResources', express.static(path.join(projectRoot, 'builtResources')));
app.use('/resources', express.static(path.join(projectRoot, 'resources')));

const devStyle = `
<style>
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
</style>
`;

const devScript = `
<script>
    // WebSocket for live reload
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
        if (event.data === 'reload') {
            window.location.reload();
        }
    };
</script>
`;

// Serve the main chat HTML file
app.get('/', (req, res) => {
    const chatHtmlPath = path.join(projectRoot, 'media', 'chat.html');
    fs.readFile(chatHtmlPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading chat.html');
            return;
        }

        let modifiedHtml = data
            .replace('{{highlightCssUri}}', '/media/highlight.css')
            .replace('{{scriptUri}}', '/builtResources/renderMarkDown.js')
            .replace('{{models}}', JSON.stringify(['GPT-4', 'Claude 3', 'Local LLM']))
            .replace('{{activeModel}}', 'GPT-4')
            .replace(
                'const vscode = acquireVsCodeApi();',
                `const vscode = {
                    postMessage: function(message) {
                        console.log('Mock VSCode received message:', message);
                        if (message.command === 'sendMessage') {
                            const fakeResponse = 'This is a fake assistant response that is approximately thirty words long to give you a realistic idea of how the chat will look with a typical response from the assistant.'.split(' ');
                            let wordIndex = 0;

                            const interval = setInterval(() => {
                                if (wordIndex < fakeResponse.length) {
                                    window.postMessage({
                                        sender: 'assistant',
                                        type: 'token',
                                        text: fakeResponse[wordIndex] + ' '
                                    }, '*');
                                    wordIndex++;
                                } else {
                                    window.postMessage({
                                        sender: 'assistant',
                                        type: 'completion',
                                        text: ''
                                    }, '*');
                                    clearInterval(interval);
                                }
                            }, 100);
                        }
                    }
                }`
            )
            .replace(
                `if (userMessageRect.top > 0) {
                                    chat.scrollTop += 20; // Adjust scroll speed as needed
                                }`,
                `const chatRect = chat.getBoundingClientRect();
                                if (userMessageRect.top > chatRect.top) {
                                    chat.scrollTop += 20;
                                }`
            );

        modifiedHtml = modifiedHtml.replace('</head>', `${devStyle}</head>`);
        modifiedHtml = modifiedHtml.replace('</body>', `${devScript}</body>`);
        
        res.send(modifiedHtml);
    });
});

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
        if (client.readyState === WebSocket.OPEN) {
            client.send('reload');
        }
    });
};

// Watch for file changes
const watcher = chokidar.watch([
    path.join(projectRoot, 'media', 'chat.html'),
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