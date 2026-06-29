#!/usr/bin/env node
/**
 * FIM vs chat-completions inline-completion benchmark.
 *
 * Compares the SAME DeepSeek model along two paths on suffix-sensitive,
 * mid-file completion cases:
 *
 *   (A) FIM  : POST /beta/completions  with { prompt, suffix }
 *   (B) CHAT : POST /chat/completions  with the instruction-wrapped prompt
 *              currently produced by src/completion/promptBuilder/promptBuilder.ts
 *
 * Same model, same scenarios — the only variable is the dialect. That isolates
 * the question the maintainer asked: does the FIM endpoint factor in the suffix
 * better than prompt tuning on the existing chat path?
 *
 * Usage:
 *   DEEP_SEEK_API_KEY=... node fim-benchmark.mjs
 *   DEEP_SEEK_API_KEY=... DEEPSEEK_MODEL=deepseek-v4-pro node fim-benchmark.mjs
 */

const API_KEY = process.env.DEEP_SEEK_API_KEY;
if (!API_KEY) {
  console.error("Missing DEEP_SEEK_API_KEY in environment.");
  process.exit(1);
}

const FIM_MODEL = process.env.DEEPSEEK_FIM_MODEL || "deepseek-v4-pro";
// chat path is judged twice: same model as FIM (isolates the dialect), and the
// real chat profile (the actual current-setup comparison).
const CHAT_MODELS = [...new Set([FIM_MODEL, process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat"])];
const BASE = "https://api.deepseek.com";
const FIM_URL = `${BASE}/beta/completions`;
const CHAT_URL = `${BASE}/chat/completions`;
// Generous budget so reasoning models (v4-pro) can finish reasoning AND emit content.
// FIM does no reasoning, so it stops early regardless — same ceiling is a fair comparison.
const MAX_TOKENS = 512;
const DELAY_MS = 1200;

// Replica of buildPromptForInlineCompletion() from promptBuilder.ts — kept verbatim
// so the chat path is judged on the project's actual prompt, not a strawman.
function buildChatPrompt(prefix, suffix, languageId) {
  return `
You are an inline code completion engine running inside a source code editor.
You are NOT a chat assistant.

The editor will INSERT your output EXACTLY at the cursor position.
There is NO post-processing.

The programming language is: ${languageId}

Your task is NOT to write a full solution.
Your task is to OUTPUT ONLY THE MISSING TEXT BETWEEN TWO EXISTING CODE FRAGMENTS.

CRITICAL RULES (VIOLATION = FAILURE)
1. You MUST treat [CODE_BEFORE_CURSOR] and [CODE_AFTER_CURSOR] as IMMUTABLE.
2. Your output MUST FIT EXACTLY BETWEEN THEM.
3. You MUST NOT repeat, rephrase, or logically reintroduce ANY text that appears in [CODE_AFTER_CURSOR].
4. You MUST stop when your output EXACTLY PRECEDES [CODE_AFTER_CURSOR].
5. You MUST NOT output Markdown.
6. Output RAW SOURCE CODE ONLY.
7. If the best completion is EMPTY, output NOTHING.

[CODE_BEFORE_CURSOR]
${prefix}

[CODE_AFTER_CURSOR]
${suffix}
`;
}

// Suffix-sensitive, mid-file scenarios. The "gold" is a known-good gap fill;
// `mustNotContain` are tokens that belong to the suffix — emitting them means
// the model ignored the suffix (the exact weakness the maintainer described).
const SCENARIOS = [
  {
    name: "py-func-args",
    lang: "python",
    prefix: "def add(",
    suffix: "):\n    return a + b\n",
    mustNotContain: ["):", "return a + b"],
  },
  {
    name: "ts-if-condition",
    lang: "typescript",
    prefix: "function isAdult(age: number): boolean {\n  if (",
    suffix: ") {\n    return true;\n  }\n  return false;\n}\n",
    mustNotContain: [") {", "return true"],
  },
  {
    name: "js-object-literal",
    lang: "javascript",
    prefix: "const server = http.createServer(app);\nconst config = {\n  host: \"localhost\",\n  ",
    suffix: "\n};\nserver.listen(config.port, config.host);\n",
    mustNotContain: ["};", "server.listen"],
  },
  {
    name: "ts-array-map",
    lang: "typescript",
    prefix: "const ids = users\n  .filter(u => u.active)\n  .map(",
    suffix: ");\nconsole.log(ids);\n",
    mustNotContain: [");", "console.log"],
  },
  {
    name: "py-dict-comprehension",
    lang: "python",
    prefix: "names = [\"ada\", \"linus\", \"grace\"]\nlengths = {",
    suffix: "}\nprint(lengths)\n",
    mustNotContain: ["}", "print(lengths)"],
  },
  {
    name: "tsx-jsx-attr",
    lang: "typescriptreact",
    prefix: "function Badge({ label }: { label: string }) {\n  return <span className=\"badge\" ",
    suffix: ">{label}</span>;\n}\n",
    mustNotContain: [">{label}", "</span>"],
  },
  {
    name: "sql-where-gap",
    lang: "sql",
    prefix: "SELECT id, email FROM users\nWHERE ",
    suffix: "\nORDER BY created_at DESC\nLIMIT 10;\n",
    mustNotContain: ["ORDER BY", "LIMIT 10"],
  },
  {
    name: "go-struct-field",
    lang: "go",
    prefix: "type Config struct {\n\tHost string\n\t",
    suffix: "\n}\n\nfunc main() {}\n",
    mustNotContain: ["}", "func main"],
  },
];

async function callFim(prefix, suffix) {
  const t0 = Date.now();
  const res = await fetch(FIM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: FIM_MODEL, prompt: prefix, suffix, max_tokens: MAX_TOKENS, temperature: 0 }),
  });
  const ms = Date.now() - t0;
  const data = await res.json();
  if (!res.ok) return { ok: false, ms, text: "", error: JSON.stringify(data.error || data).slice(0, 200) };
  return { ok: true, ms, text: data.choices?.[0]?.text ?? "", reasoning: data.usage?.completion_tokens_details?.reasoning_tokens || 0, completion: data.usage?.completion_tokens || 0 };
}

async function callChat(prefix, suffix, lang, model) {
  const t0 = Date.now();
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildChatPrompt(prefix, suffix, lang) }],
      max_tokens: MAX_TOKENS,
      temperature: 0,
    }),
  });
  const ms = Date.now() - t0;
  const data = await res.json();
  if (!res.ok) return { ok: false, ms, text: "", error: JSON.stringify(data.error || data).slice(0, 200) };
  return { ok: true, ms, text: data.choices?.[0]?.message?.content ?? "", reasoning: data.usage?.completion_tokens_details?.reasoning_tokens || 0, completion: data.usage?.completion_tokens || 0 };
}

function score(text, sc) {
  const leaked = sc.mustNotContain.filter(tok => text.includes(tok));
  const markdown = /```|^\s*here('| i)s|^\s*sure[,!]/im.test(text);
  return {
    chars: text.length,
    suffixLeak: leaked.length > 0 ? leaked.join(" | ") : "",
    markdown,
  };
}

const oneLine = s => s.replace(/\n/g, "⏎").slice(0, 70);

async function main() {
  console.log(`# FIM vs chat benchmark`);
  console.log(`FIM model: ${FIM_MODEL} (/beta/completions)`);
  console.log(`CHAT models: ${CHAT_MODELS.join(", ")} (/chat/completions, current promptBuilder prompt)\n`);

  const rows = [];
  for (const sc of SCENARIOS) {
    const fim = await callFim(sc.prefix, sc.suffix);
    await new Promise(r => setTimeout(r, DELAY_MS));
    const chats = {};
    for (const m of CHAT_MODELS) {
      chats[m] = await callChat(sc.prefix, sc.suffix, sc.lang, m);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    const fimS = fim.ok ? score(fim.text, sc) : { error: fim.error };
    const chatsS = Object.fromEntries(CHAT_MODELS.map(m => [m, chats[m].ok ? score(chats[m].text, sc) : { error: chats[m].error }]));
    rows.push({ sc, fim, chats, fimS, chatsS });

    console.log(`## ${sc.name} (${sc.lang})`);
    console.log(`prefix …\`${oneLine(sc.prefix)}\`  | suffix \`${oneLine(sc.suffix)}\``);
    console.log(`- FIM  ${FIM_MODEL} (${fim.ms}ms, reason=${fim.reasoning}tok): \`${oneLine(fim.text)}\`  leak=[${fimS.suffixLeak || "-"}] md=${fimS.markdown ?? fimS.error}`);
    for (const m of CHAT_MODELS) {
      const c = chats[m], s = chatsS[m];
      console.log(`- CHAT ${m} (${c.ms}ms, reason=${c.reasoning}tok): \`${oneLine(c.text)}\`  leak=[${s.suffixLeak || "-"}] md=${s.markdown ?? s.error}`);
    }
    console.log("");
  }

  // Aggregate
  const n = rows.length;
  const fimLeaks = rows.filter(r => r.fimS.suffixLeak).length;
  const fimMd = rows.filter(r => r.fimS.markdown).length;
  const fimLat = Math.round(rows.reduce((a, r) => a + (r.fim.ms || 0), 0) / n);
  const fimReason = Math.round(rows.reduce((a, r) => a + (r.fim.reasoning || 0), 0) / n);
  const fimEmpty = rows.filter(r => r.fim.ok && r.fim.text.trim() === "").length;

  console.log("## Summary\n");
  console.log(`| metric | FIM (${FIM_MODEL}) | ${CHAT_MODELS.map(m => `CHAT (${m})`).join(" | ")} |`);
  console.log(`|---|${"---|".repeat(1 + CHAT_MODELS.length)}`);
  const chatLeaks = CHAT_MODELS.map(m => rows.filter(r => r.chatsS[m].suffixLeak).length);
  const chatMd = CHAT_MODELS.map(m => rows.filter(r => r.chatsS[m].markdown).length);
  const chatLat = CHAT_MODELS.map(m => Math.round(rows.reduce((a, r) => a + (r.chats[m].ms || 0), 0) / n));
  const chatReason = CHAT_MODELS.map(m => Math.round(rows.reduce((a, r) => a + (r.chats[m].reasoning || 0), 0) / n));
  const chatEmpty = CHAT_MODELS.map(m => rows.filter(r => r.chats[m].ok && r.chats[m].text.trim() === "").length);
  console.log(`| empty completions | ${fimEmpty}/${n} | ${chatEmpty.map(x => `${x}/${n}`).join(" | ")} |`);
  console.log(`| avg reasoning tokens/req | ${fimReason} | ${chatReason.join(" | ")} |`);
  console.log(`| suffix leaks (heuristic) | ${fimLeaks}/${n} | ${chatLeaks.map(x => `${x}/${n}`).join(" | ")} |`);
  console.log(`| markdown contamination | ${fimMd}/${n} | ${chatMd.map(x => `${x}/${n}`).join(" | ")} |`);
  console.log(`| avg latency (ms) | ${fimLat} | ${chatLat.join(" | ")} |`);
}

main().catch(e => { console.error(e); process.exit(1); });
