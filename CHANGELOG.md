# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4] - 2026-01-04

### Added
-   **Interactive Chat Sidebar:** Introduced a dedicated "Suggestio" sidebar view (`SUGGESTIO`) for real-time AI assistance.
    -   **Streaming Responses:** Chat responses now stream token-by-token for immediate feedback.
    -   **Rich Text Support:** Full Markdown rendering with syntax highlighting for code blocks.
    -   **Context Awareness:** The chat now tracks your active editor and respects `.gitignore` / `.vscodeignore` files when building context.
    -   **History Management:** Added conversation history persistence and a "New Chat" command to clear context.
-   **Advanced Anonymization Engine:**
    -   **Entropy-Based Detection:** Implemented Shannon entropy analysis to automatically detect and mask high-randomness strings (like API keys and tokens).
    -   **New Heuristics:** Added detection for file paths, identifiers, and a generic `sensitiveData` configuration object.
    -   **Streaming Deanonymization:** Responses are now deanonymized on the fly as they stream in.
-   **New LLM Providers:**
    -   Added support for **Gemini Flash**.
    -   Added **Ollama Cloud** model configurations.
-   **Developer Experience:**
    -   Added JSON schema validation for `config.json` to provide IntelliSense for configuration settings.
    -   Added a new "Suggestio" logo and branding assets.

### Changed
-   **Testing Infrastructure Overhaul:** Migrated E2E tests from the standard VS Code test runner to **Playwright**, enabling more reliable, headless, and debuggable integration tests.
-   **Architecture Refactor:**
    -   Implemented Dependency Injection (DI) across `ChatResponder`, `ContextBuilder`, and `ChatViewProvider` for better modularity.
    -   Centralized type definitions into `src/types.ts` and shared models.
    -   Moved anonymization logic to the provider level (rather than prompt level) for consistent security across all features.
-   **UI Improvements:**
    -   Replaced native select elements with custom dropdowns for model selection.
    -   Updated the status bar and sidebar titles to reflect the new brand ("SUGGESTIO").

### Fixed
-   **Security:** Prevented sensitive files (e.g., those in `.env` or ignored paths) from being inadvertently sent to LLMs during inline completions.
-   **Chat Rendering:** Fixed issues where newlines and whitespace were not preserved in LLM responses.
-   **Stability:** Fixed Electron app cleanup errors during E2E test runs.

## [0.0.3] - 2025-08-31

### Added
-   New VS Code commands for API key management (`updateApiKey`, `deleteApiKey`), allowing secure updates and deletions without editing config files.
-   Command to edit global configuration (`suggestio.editGlobalConfig`) with automatic config file creation if missing.
-   `SecretManager` abstraction with support for secure key storage and deletion.
-   Comprehensive Jest tests for config processing and API key placeholder handling.
-   New `ConfigProcessor` with support for resolving API keys from environment variables, placeholders, or VS Code secret storage.
-   Dedicated cancellation module for more consistent handling of completion cancellation events.

### Changed
-   **Config & Secret Management Refactor:** Extracted API key logic into `secretManager.ts`, introduced `apiKeyPlaceholder` and `resolvedApiKey` fields, and improved error handling.
-   **Architecture Improvements:**  
    - Moved `Config` interface into its own `types.ts` file for clarity.  
    - Relocated `config.ts` into a dedicated `config/` directory.  
    - Split extension activation logic into `commandRegistration.ts` and `completionRegistration.ts`.  
    - Modularized completion provider into `completionProvider.ts`.  
-   Updated Groq provider model to `llama-3.3-70b-versatile`.
-   Improved testability by adding a Jest mock for the VS Code API.
-   Changed test output directory from `out` → `dist` for consistency.

### Fixed
-   N/A (This release focused on architecture, testing, and new features).

## [0.0.2] - 2025-08-30

### Added
-   Centralized logging system: All extension activity is now logged to a dedicated "Suggestio" output channel in VS Code for easier debugging.
-   New `anonymizer` configuration section in the README with detailed examples and explanations.
-   Project metadata and branding for the VS Code Marketplace.

### Changed
-   **Improved Suggestion Quality:** Increased the context window and added a debounce timer to generate more relevant and stable completions.
-   Reorganized and significantly expanded the README documentation for better clarity and user onboarding.
-   Removed the `dotenv` dependency, simplifying the extension's runtime environment.

### Fixed
-   N/A (This release focused on enhancements and refinements).

## [0.0.1] - 2025-08-26

### Added
- Initial release of **Suggestio** VS Code extension.
- Inline autocomplete using LLMs for multiple languages (JavaScript, TypeScript, Python, Java, C, C++, C#, Go, PHP, Ruby, Rust, HTML, CSS, JSON, Markdown, Shell script, YAML, SQL, and more).
- Works out-of-the-box **without any API key required**.
- Optional configuration for custom LLM providers and API keys.
- Three-level configuration system: Workspace, Global, and Built-in Defaults.
- **Secret management**: automatically prompts for API keys if missing and stores them securely in VS Code Secret Storage.
- Built-in **anonymizer**: masks sensitive values (emails, tokens, file paths, IDs) before sending text to LLMs; deanonymizes responses automatically.
- Example configuration file included.
- Comprehensive README and documentation.

### Changed
- Internal code refactoring for maintainability and performance.
- Optimized prompt construction for multi-language support.

### Fixed
- None (first release).
