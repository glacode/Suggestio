export function getChatWebviewContent(): string {
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <style>
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-editor-foreground);
                        background: var(--vscode-editor-background);
                    }

                    .chat-container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        border: 1px solid var(--vscode-editorWidget-border);
                        border-radius: 8px;
                        overflow: hidden;
                    }

                    .chat-messages {
                        flex: 1;
                        padding: 12px;
                        overflow-y: auto;
                    }

                    .message { 
                        margin: 8px 0; 
                        padding: 10px 14px; 
                        border-radius: 6px; 
                        line-height: 1.4;
                        font-size: 13px;
                        max-width: 80%;
                    }

                    .user { 
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-editorWidget-border);
                        align-self: flex-end;
                    }

                    .assistant { 
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        align-self: flex-start;
                    }

                    .chat-input {
                        display: flex;
                        border-top: 1px solid var(--vscode-editorWidget-border);
                        padding: 8px;
                        background: var(--vscode-editorWidget-background);
                    }

                    .chat-input input {
                        flex: 1;
                        padding: 6px 10px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        outline: none;
                    }

                    .chat-input input:focus {
                        border-color: var(--vscode-focusBorder);
                        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
                    }

                    .chat-input button {
                        margin-left: 8px;
                        padding: 6px 12px;
                        border: 1px solid var(--vscode-button-border, transparent);
                        border-radius: 4px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                    }

                    .chat-input button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .message-container {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        margin: 12px 0;
                    }

                    .message-label {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-left: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="chat-container">
                    <div class="chat-messages" id="chat"></div>
                    <div class="chat-input">
                        <input type="text" id="messageInput" placeholder="Type a message..." />
                        <button onclick="sendMessage()">Send</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function sendMessage() {
                        const input = document.getElementById('messageInput');
                        const text = input.value.trim();
                        if (!text) return;

                        appendMessage('user', text);
                        vscode.postMessage({ command: 'sendMessage', text });
                        input.value = '';
                    }

                    function appendMessage(sender, text) {
                        const chat = document.getElementById('chat');
                        const container = document.createElement('div');
                        container.className = 'message-container';
                        
                        const label = document.createElement('div');
                        label.className = 'message-label';
                        label.textContent = sender === 'user' ? 'You' : 'Assistant';
                        
                        const msg = document.createElement('div');
                        msg.className = 'message ' + sender;
                        msg.innerText = text;
                        
                        container.appendChild(label);
                        container.appendChild(msg);
                        chat.appendChild(container);
                        chat.scrollTop = chat.scrollHeight;
                    }

                    document.getElementById('messageInput').addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            sendMessage();
                        }
                    });

                    window.addEventListener('message', event => {
                        const { sender, text } = event.data;
                        appendMessage(sender, text);
                    });

                    const messageInput = document.getElementById('messageInput');

                    // Auto-focus the chat input field when the webview loads
                    messageInput.focus();

                    // Refocus the chat input field when the window regains focus
                    window.addEventListener('focus', () => {
                        setTimeout(() => messageInput.focus(), 50);
                    });
                </script>
            </body>
        </html>
    `;
}