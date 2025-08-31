# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
