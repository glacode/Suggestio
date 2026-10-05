## General Instructions

- When you generate new TypeScript code, follow the existing coding style.
- Write completely testable code
- Write short methods: use submethods to achieve this goal. The code must be easily readable and understandable by a human
- Use Dependency Injection (DI) everywhere possible.
- Use Interface Segregation everywhere possible.
- Minimize mocks in tests — use real or in-memory fakes.
- Apply the Single Responsibility Principle: every function, method, and class must have one, and only one, reason to change. Write short, focused functions that do exactly one thing.
- Respect the Open/Closed Principle — open for extension, closed for modification.
- Encourage event-driven patterns for decoupling and extensibility.
- AVOID using 'as unknown' and 'as any'
- AVOID using type assertions: __tests__/testUtils.ts contains complete mocks, try to use them to avoid tests with type assertions
- run 'npm run lint' to check (and fix) lint errors
- before creating new mocks in test files, check __tests__/testUtils.ts to see if we already have mock factories that could do the job

## Verified repository practices

### Testing policy — behavioral tests only
- Drive tests through public entry points (`init`, `sendMessage`, `loadHistory`,
  `retryLastMessage`, window `MessageEvent`s, DOM clicks, `postMessage` asserts).
- No private member access in tests: no bracket access (`obj['field']`), no `as`
  casts (repo bans `consistent-type-assertions`). Spy on prototype-boundary
  methods only (e.g. `SettingsOverlay.prototype`), never on internals.
- Trigger branches via DOM arrangement (add/remove nodes before driving public
  entry points) — the accepted coverage technique in this repo.
- Delete tests that pin unreachable implementation details instead of covering
  them with synthetic scenarios.

### Verification gate (per commit)
- `npx eslint <touched files>`, `npx tsc --noEmit`, then `jest <test file>`.
- `npm test` runs `pretest` (compile-tests + compile + lint): `tsc`
  rejects what jest-direct accepts (e.g. `TS2341` on private access),
  so jest-green never suffices alone — always gate on `tsc --noEmit`
  (read-only; never the emitting compile in the gate).
- Check that no test coverage is lost, unless agreed with the user:
  run the affected suite with `--coverage` before and after, and compare
  the uncovered *set* (not percentages — those wobble arithmetically);
  it may only shrink. Retiring tests alongside deleted dead code is
  removal, not regression, and is agreed explicitly, not silently.
- Scope the gate to touched files; never commit `.vscode/settings.json`.

### Naming
- All newly introduced identifiers MUST use long, descriptive names
  (e.g. `typingIndicator`, not `ind`, not the ambiguous `indicator`;
  no `El` suffix — the type already says element).

### Source invariants
- Throw on external coupling (host-provided DOM: `#chat`, `#messageInput`,
  `#modelSelector`) — real fail-fast for template skew.
- Build nodes directly for self-owned markup — never `innerHTML` then
  re-`querySelector` your own string with a guard; the field holds the node
  it creates, non-nullable by construction.
- Delete dead branches rather than covering them with synthetic tests.