import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// --------------------------------------------------------------------------------
//  Constants & Setup
// --------------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');
const HTML_OUTPUT_PATH = path.join(__dirname, 'test-providers.html');

const DELAY_BETWEEN_REQUESTS_MS = 1500;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// This should match SYSTEM_PROMPTS.AGENT in src/constants/prompts.ts
const EXTENSION_SYSTEM_PROMPT = "You are a code assistant. You can use tools to interact with the workspace. Always use the provided JSON tool-calling schema for function calls. NEVER use XML or custom tags like <function>.\n[Active editor is not a file (e.g., Output tab) and will not be included in context.]";

// --------------------------------------------------------------------------------
//  Utilities
// --------------------------------------------------------------------------------

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`Error: config.json not found at ${CONFIG_PATH}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function checkEnvFile() {
    const DOTENV_PATH = path.join(PROJECT_ROOT, '.env');
    if (!fs.existsSync(DOTENV_PATH)) {
        console.warn("[!] Warning: .env file not found. Ensure you pass environment variables manually.");
    } else {
        console.log("[i] .env file detected and loaded via Node's --env-file.");
    }
}

// --------------------------------------------------------------------------------
//  Security & API Key Resolution
// --------------------------------------------------------------------------------

/**
 * Resolves the API key for a specific profile, ensuring strict isolation.
 * Only the environment variable explicitly named in apiKeyIdentifier is used.
 */
function resolveApiKeyForProfile(profile) {
    if (profile.isApiKeyRequired === false) {
        return 'unused';
    }

    const identifier = profile.apiKeyIdentifier;
    if (!identifier) {
        return 'unused';
    }

    const envValue = process.env[identifier];
    return envValue || null;
}

// --------------------------------------------------------------------------------
//  Testing Logic (SRP Functions)
// --------------------------------------------------------------------------------

function createTestPayload(model, isHeavy) {
    const messages = isHeavy ? [
        { role: 'system', content: EXTENSION_SYSTEM_PROMPT },
        { role: 'user', content: 'I am working on a TypeScript project. I need to see the file structure.' },
        { role: 'assistant', content: 'I can help you with that. I will list the files in your project root.' },
        { role: 'user', content: 'Great, please write the complete tree of all the files in the current WORKSPACE ROOT DIRECTORY and in all the subfolders RECURSIVELY don\'t list the content of hidden subfolders' }
    ] : [
        { role: 'user', content: 'What files are in the root directory? Please use a tool if available.' }
    ];

    return {
        model: model,
        messages: messages,
        tools: [
            {
                type: 'function',
                function: {
                    name: 'list_files',
                    description: 'List files in the workspace directory.',
                    parameters: {
                        type: 'object',
                        properties: {
                            directory: {
                                type: 'string',
                                description: 'The directory to list files from (relative to workspace root). Defaults to root if not provided.'
                            }
                        }
                    }
                }
            }
        ],
        tool_choice: 'auto'
    };
}

async function performHttpRequest(endpoint, payload, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey !== 'unused') {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    const tokenHeaders = {};
    for (const [key, value] of response.headers.entries()) {
        const k = key.toLowerCase();
        if (k.includes('ratelimit') || k.includes('token') || k.includes('usage')) {
            tokenHeaders[k] = value;
        }
    }

    const data = await response.json();
    return { ok: response.ok, status: response.status, data, tokenHeaders };
}

function analyzeResponse(name, httpResult) {
    const { ok, data, tokenHeaders } = httpResult;

    const KNOWN_ROOT_KEYS = ['id', 'object', 'created', 'model', 'choices', 'usage', 'system_fingerprint'];
    const KNOWN_CHOICE_KEYS = ['index', 'message', 'logprobs', 'finish_reason'];
    const KNOWN_MESSAGE_KEYS = ['role', 'content', 'tool_calls', 'function_call'];

    const extraFields = [];
    Object.keys(data).forEach(k => { if (!KNOWN_ROOT_KEYS.includes(k)) { extraFields.push(`root.${k}`); } });

    const choice = data.choices?.[0];
    if (choice) {
        Object.keys(choice).forEach(k => { if (!KNOWN_CHOICE_KEYS.includes(k)) { extraFields.push(`choice.${k}`); } });
        if (choice.message) {
            Object.keys(choice.message).forEach(k => {
                if (!KNOWN_MESSAGE_KEYS.includes(k)) { extraFields.push(`message.${k}`); }
            });
        }
    }

    if (!ok) {
        return {
            name,
            status: 'fail',
            error: data.error || data,
            features: { reasoning: false, tokenHeaders: Object.keys(tokenHeaders).length > 0 },
            tokenHeaders,
            extraFields
        };
    }

    const hasToolCall = !!choice?.message?.tool_calls;
    const hasReasoning = !!(choice?.message?.reasoning_content || choice?.message?.reasoning);

    const features = {
        reasoning: hasReasoning,
        tokenHeaders: Object.keys(tokenHeaders).length > 0
    };

    if (hasToolCall) {
        return { name, status: 'success', detail: 'Tool Call Generated', features, tokenHeaders, extraFields };
    } else {
        return { name, status: 'text-only', detail: choice?.message?.content?.substring(0, 50).replace(/\n/g, ' ') + '...', features, tokenHeaders, extraFields };
    }
}

async function testProfile(name, profile, isHeavy) {
    const apiKey = resolveApiKeyForProfile(profile);
    if (apiKey === null) {
        return { 
            name, 
            status: 'skipped', 
            reason: `Missing ENV: ${profile.apiKeyIdentifier}`,
            supportsTools: profile.supportsTools !== false,
            excludeFromChat: !!profile.excludeFromChat
        };
    }

    console.log(`[*] Testing profile: ${name} (${profile.model})${isHeavy ? ' [HEAVY MODE]' : ''}...`);

    const payload = createTestPayload(profile.model, isHeavy);

    try {
        const httpResult = await performHttpRequest(profile.endpoint, payload, apiKey);
        const analysis = analyzeResponse(name, httpResult);
        analysis.model = profile.model;
        analysis.supportsTools = profile.supportsTools !== false;
        analysis.excludeFromChat = !!profile.excludeFromChat;
        return analysis;
    } catch (error) {
        return { 
            name, 
            status: 'error', 
            error: error.message, 
            model: profile.model,
            supportsTools: profile.supportsTools !== false,
            excludeFromChat: !!profile.excludeFromChat
        };
    }
}

// --------------------------------------------------------------------------------
//  CLI UI Functions
// --------------------------------------------------------------------------------

function displayHeader(isHeavy) {
    console.log("\n=== Suggestio Profile Tester ===");
    console.log("--------------------------------------------------");
    if (isHeavy) {
        console.log("[!] HEAVY MODE: ON (Simulating complexity)");
    } else {
        console.log("[i] HEAVY MODE: OFF");
    }
    console.log("--------------------------------------------------");
}

function displayCandidates(candidates) {
    console.log("Detected profiles in config.json:\n");
    candidates.forEach(c => {
        const keyStatus = c.hasKey ? "[KEY OK]" : "[NO KEY ]";
        console.log(`${c.index.toString().padStart(2)}. ${keyStatus} ${c.name.padEnd(25)} (${c.model})`);
    });

    console.log("\nOptions:");
    console.log("- Enter numbers separated by commas (e.g., 1,4,5)");
    console.log("- Enter 'all' to test all with keys");
    console.log("- Press Enter to cancel");
}

function logResult(res) {
    if (res.status === 'success' || res.status === 'text-only') {
        const statusLabel = res.status === 'success' ? '[+]' : '[-]';
        console.log(`${statusLabel} ${res.name}: ${res.detail}`);
    } else if (res.status === 'fail' || res.status === 'error') {
        console.log(`[!] ${res.name}: Failed`);
        if (res.error) {
            console.log(`    Error: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
        }
    } else {
        console.log(`[-] ${res.name}: ${res.status} (${res.reason || res.detail})`);
    }

    if (res.features?.reasoning) { console.log(`    [R] Reasoning detected!`); }
    if (res.extraFields?.length > 0) {
        console.log(`    [E] Extra fields: ${res.extraFields.join(', ')}`);
    }
}

// --------------------------------------------------------------------------------
//  HTML Generation (Dedicated Section)
// --------------------------------------------------------------------------------

function getRecommendation(res) {
    if (res.status === 'skipped') { return { text: 'SKIPPED', class: 'warn' }; }
    if (res.status === 'error' || res.status === 'fail') { return { text: 'REMOVE ENTIRELY', class: 'critical' }; }
    if (res.status === 'text-only') { return { text: 'REMOVE FROM CHAT', class: 'warn' }; }
    if (res.status === 'success') { return { text: 'KEEP', class: 'success' }; }
    return { text: 'UNKNOWN', class: '' };
}

function generateHtmlReport(results) {
    const timestamp = new Date().toLocaleString();

    const rows = results.map(r => {
        const rec = getRecommendation(r);
        const detail = r.detail || (r.error ? (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) : (r.reason || '-'));
        const extra = r.extraFields?.length > 0 ? r.extraFields.join(', ') : '-';

        return `
            <tr>
                <td>${r.name}</td>
                <td>${r.model}</td>
                <td class="small-col">${r.supportsTools ? '✅' : '❌'}</td>
                <td class="small-col">${r.excludeFromChat ? '🚫' : '✅'}</td>
                <td class="${r.status}">${r.status.toUpperCase()}</td>
                <td>${r.features?.reasoning ? '✅' : '❌'}</td>
                <td class="detail">${detail}</td>
                <td class="extra">${extra}</td>
                <td class="rec ${rec.class}">${rec.text}</td>
            </tr>
        `;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Suggestio - LLM Test Results</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1400px; margin: 0 auto; padding: 10px; background-color: #f4f7f6; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; font-size: 1.5em; }
        .timestamp { font-size: 0.8em; color: #7f8c8d; margin-bottom: 15px; }
        .table-wrapper { width: 100%; overflow-x: auto; background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; min-width: 1000px; table-layout: fixed; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 0.9em; word-wrap: break-word; vertical-align: top; }
        th { background-color: #3498db; color: white; text-transform: uppercase; font-size: 0.75em; letter-spacing: 1px; position: sticky; top: 0; }
        tr:hover { background-color: #f9f9f9; }
        
        /* Column Widths */
        th:nth-child(1), td:nth-child(1) { width: 12%; } /* Profile */
        th:nth-child(2), td:nth-child(2) { width: 12%; } /* Model */
        th:nth-child(3), td:nth-child(3) { width: 5%; text-align: center; } /* Tools Config */
        th:nth-child(4), td:nth-child(4) { width: 5%; text-align: center; } /* Exclude Chat */
        th:nth-child(5), td:nth-child(5) { width: 8%; } /* Status */
        th:nth-child(6), td:nth-child(6) { width: 7%; text-align: center; } /* Reasoning */
        th:nth-child(7), td:nth-child(7) { width: 25%; } /* Detail */
        th:nth-child(8), td:nth-child(8) { width: 13%; } /* Extra */
        th:nth-child(9), td:nth-child(9) { width: 13%; } /* Recommendation */

        .success { color: #27ae60; font-weight: bold; }
        .text-only { color: #2980b9; font-weight: bold; }
        .fail, .error { color: #c0392b; font-weight: bold; }
        .skipped { color: #7f8c8d; font-weight: bold; }
        .small-col { text-align: center; }
        .detail, .extra { font-family: monospace; font-size: 0.8em; white-space: pre-wrap; }
        .rec { font-weight: bold; padding: 4px 6px; border-radius: 4px; text-align: center; font-size: 0.8em; }
        .rec.success { background-color: #eafaf1; color: #27ae60; }
        .rec.warn { background-color: #fef9e7; color: #f39c12; }
        .rec.critical { background-color: #fdedec; color: #e74c3c; }

        @media screen and (max-width: 768px) {
            body { padding: 5px; }
            h1 { font-size: 1.2em; }
        }
    </style>
</head>
<body>
    <h1>LLM Provider Test Results</h1>
    <div class="timestamp">Generated on: ${timestamp}</div>
    <div class="table-wrapper">
        <table>
            <thead>
                <tr>
                    <th>Profile</th>
                    <th>Model</th>
                    <th title="supportsTools config">Tools</th>
                    <th title="excludeFromChat config">Chat</th>
                    <th>Status</th>
                    <th title="Chain of Thought / Reasoning">Thought</th>
                    <th>Detail / Error</th>
                    <th>Extra Fields</th>
                    <th>Recommendation</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;

    fs.writeFileSync(HTML_OUTPUT_PATH, html);
    console.log(`\n[+] HTML report generated at: ${HTML_OUTPUT_PATH}`);
}

// --------------------------------------------------------------------------------
//  Main Orchestration
// --------------------------------------------------------------------------------

async function main() {
    const isHeavy = process.argv.includes('--heavy');
    checkEnvFile();
    const config = loadConfig();
    const profiles = config.profiles || {};

    displayHeader(isHeavy);

    const candidates = Object.keys(profiles).map((name, index) => {
        const p = profiles[name];
        const apiKey = resolveApiKeyForProfile(p);
        return {
            index: index + 1,
            name,
            model: p.model,
            hasKey: apiKey !== null,
            apiKeyIdentifier: p.apiKeyIdentifier || (p.isApiKeyRequired === false ? 'None' : 'Default')
        };
    });

    displayCandidates(candidates);

    const answer = await question("\nWhich profiles to test? ");
    let selectedIndices = [];
    if (answer.toLowerCase() === 'all') {
        selectedIndices = candidates.filter(c => c.hasKey).map(c => c.index);
    } else if (answer.trim()) {
        selectedIndices = answer.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }

    if (selectedIndices.length === 0) {
        console.log("No profiles selected. Exiting.");
        rl.close();
        return;
    }

    const toTest = candidates.filter(c => selectedIndices.includes(c.index));
    console.log(`\n=== Starting Probe (${toTest.length} profiles) ===\n`);

    const results = [];
    for (let i = 0; i < toTest.length; i++) {
        const c = toTest[i];
        const res = await testProfile(c.name, profiles[c.name], isHeavy);
        results.push(res);
        logResult(res);

        if (i < toTest.length - 1 && res.status !== 'skipped') {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
        }
    }

    console.log("\n=== Final Summary ===");
    console.table(results.map(r => ({
        Profile: r.name,
        Status: r.status,
        Reasoning: r.features?.reasoning ? '✅' : '❌',
        Detail: r.detail || (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) || r.reason
    })));

    generateHtmlReport(results);

    rl.close();
}

main().catch(err => {
    console.error("Fatal Error:", err);
    rl.close();
    process.exit(1);
});
