import { marked } from "marked";

function renderMarkdown(text: string): string {
    return marked.parse(text, { async: false }) as string;
}

(window as any).renderMarkdown = renderMarkdown;