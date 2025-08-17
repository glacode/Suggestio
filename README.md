<div align="center">
  <img src="resources/logo.png" width="128" alt="Suggestio Logo">
  <h1>Suggestio</h1>
  <p>AI-Powered in line suggestions </p>
</div>

# Suggestio

**Suggestio** is a VS Code extension that provides inline code completions using LLM (Large Language Model) APIs.  
It’s lightweight, open-source, and does not require login or cloud accounts unless you configure it to use one.

---

## ✨ Features

- Inline code suggestions as you type, powered by configurable LLM providers.  
- Works out of the box with sensible defaults.  
- Supports multiple providers/models — add your own with simple JSON config.  
- Three levels of configuration (project, user, built-in defaults).  

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
  "providers": {
    "openrouter": {
      "endpoint": "https://openrouter.ai/api/v1",
      "models": ["gpt-4o-mini", "mistral-7b", "llama-3-70b"]
    },
    "ollama": {
      "endpoint": "http://localhost:11434/api/generate",
      "models": ["llama2", "phi3"]
    }
  },
  "defaultProvider": "openrouter",
  "defaultModel": "gpt-4o-mini"
}
```

You can reference environment variables in your config, e.g.:

```json
{
  "apiKey": "${OPENROUTER_API_KEY}"
}
```

---

## 🔑 API Keys & Secrets

- Never hardcode API keys into workspace configs if you share the repo.  
- Instead, use environment variables like `${MY_API_KEY}`.  
- Suggestio automatically substitutes them when loading config.  

---

## 📂 Where is the Global Config Folder?

VS Code stores global extension data in different places depending on your OS:

- **Linux:** `~/.config/Code/User/globalStorage/glacode.suggestio/`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/glacode.suggestio/`
- **Windows:** `%APPDATA%\Code\User\globalStorage\glacode.suggestio\`

You usually don’t need to remember this path — just use **Suggestio: Edit Global Config** from the command palette.

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

