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

// This should match SYSTEM_PROMPTS.AGENT in src/constants/prompts.ts
const EXTENSION_SYSTEM_PROMPT = "You are a code assistant. You can use tools to interact with the workspace. Always use the provided JSON tool-calling schema for function calls. NEVER use XML or custom tags like <function>.\n[Active editor is not a file (e.g., Output tab) and will not be included in context.]";

async function testProfile(name, profile, isHeavy = false) {
    const apiKey = resolveApiKeyForProfile(profile);

    if (apiKey === null) {
        return { name, status: 'skipped', reason: `Missing ENV: ${profile.apiKeyIdentifier}` };
    }

    console.log(`[*] Testing profile: ${name} (${profile.model})${isHeavy ? ' [HEAVY MODE]' : ''}...`);

    const messages = isHeavy ? [
        { role: 'system', content: EXTENSION_SYSTEM_PROMPT },
        { role: 'user', content: 'I am working on a TypeScript project. I need to see the file structure.' },
        { role: 'assistant', content: 'I can help you with that. I will list the files in your project root.' },
        { role: 'user', content: 'Great, please write the complete tree of all the files in the current WORKSPACE ROOT DIRECTORY and in all the subfolders RECURSIVELY don\'t list the content of hidden subfolders' }
    ] : [
        { role: 'user', content: 'What files are in the root directory? Please use a tool if available.' }
    ];

    const payload = {
        model: profile.model,
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
        const headers = {
            'Content-Type': 'application/json'
        };

        // Strict isolation: Only add Authorization if we have a key and it's not 'unused'
        if (apiKey && apiKey !== 'unused') {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(profile.endpoint, {
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

        const KNOWN_ROOT_KEYS = ['id', 'object', 'created', 'model', 'choices', 'usage', 'system_fingerprint'];
        const KNOWN_CHOICE_KEYS = ['index', 'message', 'logprobs', 'finish_reason'];
        const KNOWN_MESSAGE_KEYS = ['role', 'content', 'tool_calls', 'function_call'];

        const extraFields = [];
        Object.keys(data).forEach(k => { if (!KNOWN_ROOT_KEYS.includes(k)) extraFields.push(`root.${k}`); });

        const choice = data.choices?.[0];
        if (choice) {
            Object.keys(choice).forEach(k => { if (!KNOWN_CHOICE_KEYS.includes(k)) extraFields.push(`choice.${k}`); });
            if (choice.message) {
                Object.keys(choice.message).forEach(k => {
                    if (!KNOWN_MESSAGE_KEYS.includes(k)) extraFields.push(`message.${k}`);
                });
            }
        }

        if (!response.ok) {
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
    const profiles = config.profiles || {};
    const profileNames = Object.keys(profiles);

    console.log("\n=== Suggestio Profile Tester ===");
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
    console.log("Detected profiles in config.json:\n");

    const candidates = profileNames.map((name, index) => {
        const p = profiles[name];
        const apiKey = resolveApiKeyForProfile(p);
        const hasKey = apiKey !== null;
        return { 
            index: index + 1, 
            name, 
            model: p.model, 
            hasKey, 
            apiKeyIdentifier: p.apiKeyIdentifier || (p.isApiKeyRequired === false ? 'None' : 'Default')
        };
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
        res.name = c.name; // ensure name is attached
        results.push(res);

        if (res.status === 'success' || res.status === 'text-only') {
            const statusLabel = res.status === 'success' ? '[+]' : '[-]';
            console.log(`${statusLabel} ${c.name}: ${res.detail}`);
        }
        else if (res.status === 'fail' || res.status === 'error') {
            console.log(`[!] ${c.name}: Failed`);
            if (res.error) {
                console.log(`    Error: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
            }
        }
        else {
            console.log(`[-] ${c.name}: ${res.status} (${res.reason || res.detail})`);
        }

        if (res.features?.reasoning) { console.log(`    [R] Reasoning detected!`); }
        if (res.features?.tokenHeaders) {
            console.log(`    [H] Token headers found: ${Object.keys(res.tokenHeaders).join(', ')}`);
        }
        if (res.extraFields?.length > 0) {
            console.log(`    [E] Extra fields: ${res.extraFields.join(', ')}`);
        }

        if (i < toTest.length - 1 && res.status !== 'skipped') {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
        }
    }

    console.log("\n=== Final Summary ===");
    console.table(results.map(r => ({
        Profile: r.name,
        Status: r.status,
        Reasoning: r.features?.reasoning ? '✅' : '❌',
        'Token Hdrs': r.features?.tokenHeaders ? '✅' : '❌',
        'Extra Fields': r.extraFields?.length > 0 ? r.extraFields.join(', ') : '-',
        Detail: r.detail || (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) || r.reason
    })));

    if (results.some(r => r.status === 'skipped')) {
        console.log("\n[!] REMINDER: Some profiles were skipped because their API keys were not found in the environment.");
        console.log("    Please update your .env file and restart the script to test them.");
    }

    rl.close();
}

main().catch(err => {
    console.error("Fatal Error:", err);
    rl.close();
    process.exit(1);
});
