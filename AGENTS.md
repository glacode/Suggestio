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