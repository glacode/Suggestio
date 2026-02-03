import { marked } from "marked";
import hljs from "highlight.js";

const renderer = new marked.Renderer();

// New API: code block renderer takes a single object
renderer.code = ({ text, lang }: { text: string; lang?: string; escaped?: boolean }) => {
  const validLang = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = validLang
    ? hljs.highlight(text, { language: validLang }).value
    : hljs.highlightAuto(text).value;

  return `<pre><code class="hljs ${validLang ?? ''}">${highlighted}</code></pre>`;
};

declare global {
  interface Window {
    renderMarkdown: (text: string) => string;
  }
}

function renderMarkdown(text: string): string {
  const parsed = marked.parse(text, { renderer });
  if (typeof parsed !== "string") {
    throw new Error("Expected marked.parse to return a string");
  }
  return parsed;
}

// Expose globally for the webview
window.renderMarkdown = renderMarkdown;
