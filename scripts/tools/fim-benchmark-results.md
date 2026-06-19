# FIM vs chat inline-completion — benchmark sample

Sample run of [`fim-benchmark.js`](./fim-benchmark.js). Reproduce with:

```bash
DEEP_SEEK_API_KEY=... node scripts/tools/fim-benchmark.js
# optional overrides:
DEEP_SEEK_API_KEY=... DEEPSEEK_FIM_MODEL=deepseek-v4-pro DEEPSEEK_CHAT_MODEL=deepseek-chat \
  node scripts/tools/fim-benchmark.js
```

## Setup

The benchmark holds everything constant except the **dialect**, so the FIM
endpoint and the chat endpoint are judged on identical work:

- **Same scenarios** — 8 suffix-sensitive, mid-file gap completions (function
  args, `if (…)` conditions, object literals, `.map(…)`, dict comprehensions,
  JSX attributes, SQL `WHERE`, Go struct fields).
- **Same chat prompt** — a verbatim copy of the prompt produced by
  `src/completion/promptBuilder/promptBuilder.ts`, not a strawman.
- **temperature 0**, `max_tokens` 512 (generous, so a reasoning model has room
  to finish reasoning *and* emit content).

Three paths:

| path | endpoint | model |
|---|---|---|
| **FIM** | `/beta/completions` (`{prompt, suffix}`) | `deepseek-v4-pro` |
| **CHAT (v4-pro)** | `/chat/completions` | `deepseek-v4-pro` — isolates *dialect* from *model* |
| **CHAT (deepseek-chat)** | `/chat/completions` | `deepseek-chat` — the current-style chat path |

## Summary

| metric | FIM (v4-pro) | CHAT (v4-pro) | CHAT (deepseek-chat) |
|---|---|---|---|
| empty completions | 0/8 | **5/8** | 0/8 |
| avg reasoning tokens / req | 0 | **~400** | 0 |
| markdown contamination | 0/8 | 0/8 | 0/8 |
| suffix leaks (heuristic*) | 0/8 | 0/8 | 0/8 |
| avg latency | 204 ms | 186 ms | 188 ms |

\* The automated leak check uses naive token matching and **missed one real
leak** — see the `.map(` case below. Treat the leak row as a floor, not a
verdict.

## Per-scenario output

| scenario | FIM (v4-pro) | CHAT (deepseek-chat) |
|---|---|---|
| `def add(` … `):` | `a, b` | `a, b` |
| `if (` … `) {` | `age >= 18` | `age >= 18` |
| `config = { host:"…",` … `};` | `port: 3000,` | `port: 3000` |
| `.map(` … `);` | `u => u.id` | `u => u.id)` ⚠️ extra `)` (suffix already has `);`) |
| `lengths = {` … `}` | `name: len(name) for name in names` | `name: len(name) for name in names` |
| `<span classNam` … `>{label}` | `data-testid="badge"` | `style={{ backgroundColor: label === 'new' ? 'green' : 'blue' }}` |
| `WHERE ` … `ORDER BY` | `email_verified = false AND …` | `email IS NOT NULL` |
| `Host string\n\t` … `}` | `Port int` | `Port int` |

CHAT (v4-pro) is omitted from this table because it returned an empty string in
5 of 8 cases (see below).

## Key finding — the gap is structural, not a prompt problem

`deepseek-v4-pro` is a **reasoning model**. On the chat endpoint it spends its
token budget reasoning and frequently never emits any completion:

```
deepseek-v4-pro  /chat/completions  max_tokens=128
  finish_reason: length
  content: ""
  reasoning_tokens: 128         ← budget fully consumed by reasoning

deepseek-v4-pro  /chat/completions  max_tokens=512
  finish_reason: stop
  content: "age >= 18"
  reasoning_tokens: 196         ← ~200 tokens burned per keystroke-completion
```

Through the **FIM endpoint the same model does zero reasoning** and returns a
clean gap fill every time. No amount of prompt tuning on the chat path can
reproduce that — it comes from hitting `/beta/completions` instead of
`/chat/completions`.

For a non-reasoning model (`deepseek-chat`) the chat path holds up well, so
prompt tuning is reasonable there. The FIM path is what makes
reasoning / FIM-native models usable for low-latency inline completion at all.

## Caveats

- 8 scenarios, single sample at temperature 0 — directional, not a rigorous eval.
- Scoring is heuristic; the `.map(` leak shows it can under-count.
- Focused narrowly on suffix handling (the reported weak spot), not broad quality.
