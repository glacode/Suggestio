<div align="center">
  <img src="resources/logo.png" width="128" alt="Suggestio Logo">
  <h1>Suggestio</h1>
  <p>AI-Powered inline suggestions</p>
</div>

**Suggestio** is a VS Code extension that provides inline code completions using LLM (Large Language Model) APIs.  
It’s lightweight, open-source, and does not require login, cloud accounts, or API keys — it works out of the box.  
(You can optionally configure your own providers and API keys if you want more control.)

![Demo GIF](resources/demo.gif)

---

## ✨ Features

- Inline code suggestions as you type, powered by configurable LLM providers.  
- **Works out of the box — no API key required.**  
- Automatic **secret management**: if an API key is missing, Suggestio securely prompts you once and stores it in VS Code’s secret storage.  
- Built-in **anonymizer**: automatically masks sensitive data (emails, tokens, IDs, etc.) before sending prompts to providers.  
- Supports multiple providers/models — add your own with simple JSON config.  
- Three levels of configuration (project, user, built-in defaults).  

---

## 🔒 Anonymizer

To protect your privacy, Suggestio includes a built-in **anonymizer**:  
it automatically masks sensitive values such as emails, tokens, file paths, and IDs before sending text to external LLM providers.  
The anonymizer only replaces words and patterns explicitly listed in your config file.  

By default, it comes preloaded with common placeholders like names, emails, and IP addresses.  
You can extend this list with any custom terms that should be anonymized before sending text to the model.  

All terms that are anonymized in the outgoing prompt are **deanonymized when the response comes back**,  
so the completion you see in your editor always contains your original values.

---

## 🚀 Installation

1. Install **Suggestio** from the [VS Code Marketplace](https://marketplace.visualstudio.com/).  
2. Start coding — completions will appear inline.  
3. (Optional) Configure your own providers and models (see below).  

---

## ⚙️ Configuration

Suggestio loads its configuration (`config.json`) from **three possible locations**, in priority order:

### 1. Workspace Config (highest priority)
If your project has a file named:

```
suggestio.config.json
```

in the **root of the workspace**, Suggestio will load providers/models from there.  
Use this when different projects need different LLM setups.  

### 2. Global Config (user-wide)
If you create a file:

```
<globalStorage>/glacode.suggestio/config.json
```

(where `<globalStorage>` is VS Code’s private data folder), Suggestio will load that.  
This applies to **all your projects**, unless a workspace config overrides it.  

👉 To make this easier, Suggestio provides a command:

- **Suggestio: Edit Global Config** — creates/opens your global `config.json` so you can edit it directly.

### 3. Built-in Defaults (fallback)
If neither workspace nor global config exists, Suggestio falls back to the **bundled config.json** shipped with the extension.  
This guarantees Suggestio works immediately after install.

---

## 🧩 Example Config

Here’s a minimal example of a config file:

```json
{
  "activeProvider": "llm7-qwen32",
  "providers": {
    "llm7-qwen32": {
      "endpoint": "https://api.llm7.io/v1/chat/completions",
      "model": "qwen2.5-coder-32b-instruct",
      "apiKey": "unused"
    },
    "groq-llama370": {
      "endpoint": "https://api.groq.com/openai/v1/chat/completions",
      "model": "llama3-70b-8192",
      "apiKey": "${GROQ_API_KEY}"
    },
    "openrouter-deepseekv3": {
      "endpoint": "https://openrouter.ai/api/v1/chat/completions",
      "model": "deepseek/deepseek-chat-v3-0324:free",
      "apiKey": "${OPENROUTER_API_KEY}"
    },
    "hf-lama38": {
      "endpoint": "https://api-inference.huggingface.co/v1/chat/completions",
      "model": "meta-llama/Llama-3-8B-Instruct",
      "apiKey": "${HF_API_KEY}"
    }
  },
  "anonymizer": {
    "enabled": true,
    "words": [
      "john",
      "doe",
      "john.doe@example.com",
      "192.168.1.1",
      "<social_security_number>",
      "<street_address>"
    ]
  }
}
```

You can reference environment variables in your config, e.g.:

```json
{
  "apiKey": "${OPENROUTER_API_KEY}"
}
```

---

## 📂 Where is the Global Config Folder?

VS Code stores global extension data in different places depending on your OS:

- **Linux:** `~/.config/Code/User/globalStorage/glacode.suggestio/`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/glacode.suggestio/`
- **Windows:** `%APPDATA%\Code\User\globalStorage\glacode.suggestio\`

You usually don’t need to remember this path — just use **Suggestio: Edit Global Config** from the command palette.

---

## 🔑 API Keys & Secret Management

- By default, Suggestio works without API keys (using built-in providers).  
- If a provider requires an API key:
  - Suggestio first tries to load it from environment variables.  
  - If it’s not found, Suggestio will securely **prompt you once** for the key and save it in VS Code’s [Secret Storage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage).  
- Never hardcode API keys into workspace configs if you share the repo.  

---

## 🛠 Development

To hack on Suggestio locally:

```bash
git clone https://github.com/glacode/suggestio.git
cd suggestio
npm install
npm run compile
```

Then press `F5` in VS Code to launch a new window with the extension loaded.  

---

## 📜 License

MIT © [Glauco Siliprandi](https://github.com/glacode)
