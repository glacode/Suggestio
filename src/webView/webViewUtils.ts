/**
 * Common LLM providers mapping for consistent brand naming.
 */
export const KNOWN_PROVIDERS: Record<string, string> = {
    'openai.com': 'OPENAI',
    'anthropic.com': 'ANTHROPIC',
    'groq.com': 'GROQ',
    'mistral.ai': 'MISTRAL',
    'openrouter.ai': 'OPENROUTER',
    'huggingface.co': 'HUGGINGFACE',
    'together.xyz': 'TOGETHER',
    'deepseek.com': 'DEEPSEEK',
    'googleapis.com': 'GOOGLEAPIS',
    'ollama.com': 'OLLAMA'
};

/**
 * Extracts a brand name from a URL for API key placeholder generation.
 */
export function getBrandFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        // 1. Special Cases
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'LOCAL';
        }

        // 2. Known Providers Map (exact or suffix match)
        for (const [domain, brand] of Object.entries(KNOWN_PROVIDERS)) {
            if (host === domain || host.endsWith('.' + domain)) {
                return brand;
            }
        }

        // 3. Common Multi-part TLDs
        const multiPartTlds = ['.co.uk', '.com.br', '.org.uk', '.net.au', '.gov.it', '.co.jp'];
        
        let workingHost = host;
        for (const tld of multiPartTlds) {
            if (host.endsWith(tld)) {
                workingHost = host.slice(0, -tld.length);
                break;
            }
        }

        // 4. Standard TLD stripping if no multi-part match
        if (workingHost === host) {
            const parts = host.split('.');
            if (parts.length > 1) {
                workingHost = parts.slice(0, -1).join('.');
            }
        }

        // 5. Take last segment
        const finalParts = workingHost.split('.');
        const brand = finalParts[finalParts.length - 1];
        
        return brand.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    } catch {
        return 'CUSTOM';
    }
}

/**
 * Manages a custom themed dropdown for input fields.
 */
export class CustomDropdown {
    constructor(
        private input: HTMLInputElement,
        private list: HTMLElement,
        private wrapper: HTMLElement,
        private options: string[],
        private onSelect: (value: string) => void,
        private onInput?: () => void,
        private newActionLabel: string = '+ New...'
    ) {
        this.attachListeners();
    }

    private attachListeners() {
        this.input.addEventListener('focus', () => this.show());
        this.input.addEventListener('input', () => {
            this.render(this.input.value);
            if (this.onInput) {
                this.onInput();
            }
        });
        this.input.addEventListener('blur', () => {
            setTimeout(() => this.hide(), 200);
        });
    }

    public render(filter: string = '') {
        const normalizedFilter = filter.toLowerCase().trim();
        const filtered = this.options.filter(o => o.toLowerCase().includes(normalizedFilter));
        
        this.list.innerHTML = '';
        
        filtered.forEach(option => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            item.textContent = option;
            item.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                this.input.value = option;
                this.hide();
                this.onSelect(option);
            });
            this.list.appendChild(item);
        });

        const newAction = document.createElement('div');
        newAction.className = 'custom-dropdown-item new-endpoint-action';
        newAction.textContent = this.newActionLabel;
        newAction.addEventListener('mousedown', (evt) => {
            evt.preventDefault();
            this.input.value = '';
            this.hide();
            this.input.focus();
            this.onSelect('');
        });
        this.list.appendChild(newAction);
    }

    public show() {
        this.render(this.input.value);
        this.list.classList.add('visible');
        this.wrapper.classList.add('open');
    }

    public hide() {
        this.list.classList.remove('visible');
        this.wrapper.classList.remove('open');
    }

    public setOptions(newOptions: string[]) {
        this.options = newOptions;
    }
}
