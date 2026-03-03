import { IDiffManager, IVscodeApiLocal } from '../types.js';

/**
 * `DiffManager` handles displaying side-by-side diffs in the VS Code editor
 * using in-memory virtual documents.
 *
 * It is decoupled from the VS Code API through `IVscodeApiLocal`.
 */
export class DiffManager implements IDiffManager {
    public static readonly scheme = 'suggestio-diff';
    private _contentMap = new Map<string, string>();

    constructor(private vscodeApi: IVscodeApiLocal) {}

    /**
     * Returns the stored content for a specific virtual document URI.
     * @param uriString The string form of the virtual URI.
     */
    getContent(uriString: string): string {
        return this._contentMap.get(uriString) || '';
    }

    /**
     * Opens a native side-by-side diff editor.
     * @param filePath The path of the file to display in the editor title.
     * @param oldContent The original content (displayed on the left).
     * @param newContent The proposed content (displayed on the right).
     */
    async showDiff(filePath: string, oldContent: string, newContent: string): Promise<void> {
        const timestamp = Date.now();
        const baseName = filePath.split('/').pop() || filePath;
        
        // Construct URIs for the virtual documents
        const leftUriStr = `${DiffManager.scheme}:/original/${filePath}?v=${timestamp}`;
        const rightUriStr = `${DiffManager.scheme}:/modified/${filePath}?v=${timestamp}`;

        // Store the content for later retrieval
        this._contentMap.set(leftUriStr, oldContent);
        this._contentMap.set(rightUriStr, newContent);

        // Open the native VS Code diff editor using the injected API
        await this.vscodeApi.commands.executeCommand(
            'vscode.diff',
            this.vscodeApi.Uri.parse(leftUriStr),
            this.vscodeApi.Uri.parse(rightUriStr),
            `${baseName} (Original ↔ Suggestio)`
        );
    }
}
