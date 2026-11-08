<div align="center">
  <img src="resources/logo.png" width="128" alt="Suggestio Logo">
  <h1>Suggestio</h1>
  <p><strong>Autonomous coding agent using free LLM Providers.</strong></p>
</div>

**Suggestio** is an open-source coding assistant for VS Code designed for developers and students who want to use powerful AI without expensive subscriptions. Bundled profiles ending in `-noapikey` need **no sign-up and no API key** — they run through blockrun.ai and Kilo's free Gateway, and the default chat profile is one of them, so the agent works right after install. All other bundled profiles run on **free LLM tiers** (like OpenRouter or Google Gemini) — they don't require credit card information, just a free API key from the provider.

![Agent Demo](resources/agentDemo.gif)

---

## The Autonomous Agent

The core of Suggestio is an **autonomous agent** that can help you solve complex tasks by using tools to navigate and modify your project:

- **Search & Explore:** Automatically uses `grep` to find code and lists files to understand your project structure.
- **Surgical Edits:** Can propose precise changes to your files. You review every change in a **native side-by-side diff** before accepting.
- **Shell Integration:** Can run tests, build commands, or linters to verify its own work.
- **Reasoning Support:** Optimized for "reasoning" models so you can see the agent's step-by-step thought process.
- **Continue a Stalled Response:** If the model stops before finishing — cancelled, errored, or cut off mid-answer — press **Enter** (or click the **send icon**) with an empty input to continue the last response from the existing conversation, no new prompt needed.
- **Lightweight Design:** With an installed size of less than 3MB, Suggestio provides full agentic power with minimal resource consumption.

## ✍️ Inline Completions

Suggestio also provides **ghost-text completions** as you type. It’s lightweight and designed to provide helpful suggestions based on your current file context. You can use different models for chat and completions to balance speed and intelligence.

![Completions Demo](resources/completionsDemo.gif)

---

## ⚙️ Quick Start

**Try it with no sign-up and no API key** — profiles ending in `-noapikey` never ask for credentials:

1. **Install** Suggestio from the VS Code Marketplace.
2. **Open the Sidebar:** Click the Suggestio icon (the lightbulb).
3. **Send a task:** The default profile ends in `-noapikey` and works immediately.

Unlock more free models with free API keys from providers like [OpenRouter](https://openrouter.ai/) or [Google Gemini](https://aistudio.google.com/):

4. **Add your key:** Click the **Gear icon** (Settings) in the chat view.
5. **Paste & Go:** Select a keyed profile, paste your API key, and you're ready to code — switch profiles any time.

![Set Api Key Demo](resources/setApiKeyDemo.gif)

---

## 🔒 Privacy & Security

- **Agent Guardrails:** Every file modification or shell command requires your explicit approval (unless you enable "Always Allow" for specific tools).
- **Experimental Anonymizer:** (Disabled by default) Mathematically detects and masks sensitive data (API keys, tokens) using Shannon entropy analysis before it leaves your machine.
- **Local Secret Storage:** API keys are never stored in your project files. They are managed securely via VS Code's native Secret Storage.

---

## 💡 Recommended Free Tier Models

Suggestio is designed to leverage providers that offer generous free tiers. Here are our current recommendations for high-quality models that can be used without a paid subscription:

- **Kilo Gateway (No API Key Required):** Two bundled profiles — NVIDIA's Nemotron 3.5 Super VL, now Suggestio's default active chat profile, and dots-3-note-preview — run through Kilo's free Gateway without an API key.
- **NVIDIA Lightning via Blockrun (No API Key Required):** The bundled blockrun.ai provider serves NVIDIA's Nemotron 3.5 Lightning without an API key — a reliable, tool-calling route to Suggestio's agentic features right out of the box.
- **Google Gemini 3.5 Flash Lite:** A lightweight, fast Gemini tier with native tool-calling support — great for quick agentic tasks.
- **Qwen 3.8 27B (via Groq):** The default inline completion profile and the strongest completion quality we've measured so far — a fast, free coding model on Groq's free tier.
- **Meta Muse Glimmer 30B (via NVIDIA NIM):** Available through NVIDIA's free endpoint registry, with low-latency generation and tool-calling support for agentic tasks.
- **Z.ai GLM 4.7 Flash:** A fast free coding model from Zhipu AI, ready out of the box with tool-calling support.
- **Cohere North Mini Code (via OpenRouter):** A free coding-specialized model.

---

## ⚖️ Provider Terms

Suggestio connects to third-party model providers. Whether you use an API key or a keyless endpoint (such as Kilo's free Gateway or the bundled llm7.io profiles), your use of that model is governed by the provider's own terms of service. You are responsible for reviewing and complying with those terms. For example, see [Kilo's Terms](https://kilo.ai/terms).

---

## Advanced Configuration

While you can do most things through the UI, Suggestio supports a layered configuration system for power users:

- **Suggestio: Edit Global Config**: Opens a JSON file for advanced profile management.
- **Project Config**: Create a `suggestio.config.json` in your root folder to share model settings (but not keys!) with your teammates.
- **Per-Profile Max Tokens**: Profiles accept an optional Max Tokens (max_tokens) override, editable from the profile forms — leave blank for the provider default.

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
