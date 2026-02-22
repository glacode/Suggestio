import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');

const DELAY_BETWEEN_REQUESTS_MS = 1500;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function resolveApiKey(placeholder) {
    if (!placeholder) { return ''; }
    if (placeholder === 'unused') { return 'unused'; }

    const match = placeholder.match(/^\$\{(.+)\}$/);
    if (match) {
        const envVar = match[1];
        return process.env[envVar] || null;
    }
    return placeholder;
}

const EXTENSION_SYSTEM_PROMPT = "You are a code assistant. You can use tools to interact with the workspace. Always use the provided JSON tool-calling schema for function calls. NEVER use XML or custom tags like <function>.\n[Active editor is not a file (e.g., Output tab) and will not be included in context.]";

async function testProvider(name, config, isHeavy = false) {
    const apiKey = resolveApiKey(config.apiKey);

    if (apiKey === null) {
        return { name, status: 'skipped', reason: `Missing ENV: ${config.apiKey.replace(/[${}]/g, '')}` };
    }

    console.log(`[*] Testing ${name} (${config.model})${isHeavy ? ' [HEAVY MODE]' : ''}...`);

    const messages = isHeavy ? [
        { role: 'system', content: EXTENSION_SYSTEM_PROMPT },
        { role: 'user', content: 'I am working on a TypeScript project. I need to see the file structure.' },
        { role: 'assistant', content: 'I can help you with that. I will list the files in your project root.' },
        { role: 'user', content: 'Great, please write the complete tree of all the files in the current WORKSPACE ROOT DIRECTORY and in all the subfolders RECURSIVELY don\'t list the content of hidden subfolders' }
    ] : [
        { role: 'user', content: 'What files are in the root directory? Please use a tool if available.' }
    ];

    const payload = {
        model: config.model,
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

    try {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey === 'unused' ? '' : apiKey}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            return { name, status: 'fail', error: data.error || data };
        }

        const choice = data.choices?.[0];
        const hasToolCall = !!choice?.message?.tool_calls;

        if (hasToolCall) {
            return { name, status: 'success', detail: 'Tool Call Generated' };
        } else {
            return { name, status: 'text-only', detail: choice?.message?.content?.substring(0, 50) + '...' };
        }

    } catch (error) {
        return { name, status: 'error', error: error.message };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isHeavy = args.includes('--heavy');

    const DOTENV_PATH = path.join(PROJECT_ROOT, '.env');
    if (!fs.existsSync(DOTENV_PATH)) {
        console.warn("[!] Warning: .env file not found. Ensure you pass environment variables manually.");
    } else {
        console.log("[i] .env file detected and loaded via Node's --env-file.");
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`Error: config.json not found at ${CONFIG_PATH}`);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const providers = config.providers || {};
    const providerNames = Object.keys(providers);

    console.log("\n=== Suggestio Provider Tester ===");
    if (isHeavy) {
        console.log("--------------------------------------------------");
        console.log("[!] HEAVY MODE: ON");
        console.log("[i] Simulating extension prompt complexity and history.");
        console.log("--------------------------------------------------");
    } else {
        console.log("[i] HEAVY MODE: OFF");
        console.log("[i] To simulate extension complexity, run:");
        console.log("    npm run test:providers -- --heavy");
        console.log("--------------------------------------------------");
    }
    console.log("Detected providers in config.json:\n");

    const candidates = providerNames.map((name, index) => {
        const p = providers[name];
        const apiKey = resolveApiKey(p.apiKey);
        const hasKey = apiKey !== null;
        return { index: index + 1, name, model: p.model, hasKey, envVar: p.apiKey };
    });

    candidates.forEach(c => {
        const keyStatus = c.hasKey ? "[KEY OK]" : "[NO KEY ]";
        console.log(`${c.index.toString().padStart(2)}. ${keyStatus} ${c.name.padEnd(25)} (${c.model})`);
    });

    console.log("\nOptions:");
    console.log("- Enter numbers separated by commas (e.g., 1,4,5)");
    console.log("- Enter 'all' to test all with keys");
    console.log("- Use --heavy in the npm command for more complex prompts");
    console.log("- Press Enter to cancel");

    const answer = await question("\nWhich models to test? ");

    let selectedIndices = [];
    if (answer.toLowerCase() === 'all') {
        selectedIndices = candidates.filter(c => c.hasKey).map(c => c.index);
    } else if (answer.trim()) {
        selectedIndices = answer.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }

    if (selectedIndices.length === 0) {
        console.log("No models selected. Exiting.");
        rl.close();
        return;
    }

    const toTest = candidates.filter(c => selectedIndices.includes(c.index));

    console.log(`\n=== Starting Probe (${toTest.length} models) ===\n`);

    const results = [];
    for (let i = 0; i < toTest.length; i++) {
        const c = toTest[i];
        const res = await testProvider(c.name, providers[c.name], isHeavy);
        res.name = c.name; // ensure name is attached
        results.push(res);

        if (res.status === 'success') { console.log(`[+] ${c.name}: Success`); }
        else if (res.status === 'fail' || res.status === 'error') { console.log(`[!] ${c.name}: Failed`); }
        else { console.log(`[-] ${c.name}: ${res.status} (${res.reason || res.detail})`); }

        if (i < toTest.length - 1 && res.status !== 'skipped') {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
        }
    }

    console.log("\n=== Final Summary ===");
    console.table(results.map(r => ({
        Provider: r.name,
        Status: r.status,
        Detail: r.detail || (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) || r.reason
    })));

    if (results.some(r => r.status === 'skipped')) {
        console.log("\n[!] REMINDER: Some models were skipped because their API keys were not found in the environment.");
        console.log("    Please update your .env file and restart the script to test them.");
    }

    rl.close();
}

main().catch(err => {
    console.error("Fatal Error:", err);
    rl.close();
    process.exit(1);
});
