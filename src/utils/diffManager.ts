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
        
        // Construct the URIs using the injected API
        const leftUri = this.vscodeApi.Uri.parse(`${DiffManager.scheme}:/original/${filePath}?v=${timestamp}`);
        const rightUri = this.vscodeApi.Uri.parse(`${DiffManager.scheme}:/modified/${filePath}?v=${timestamp}`);

        // Store the content using the URI's canonical string representation as the key
        this._contentMap.set(leftUri.toString(), oldContent);
        this._contentMap.set(rightUri.toString(), newContent);

        // Open the native VS Code diff editor
        await this.vscodeApi.commands.executeCommand(
            'vscode.diff',
            leftUri,
            rightUri,
            `${baseName} (Original ↔ Suggestio)`
        );
    }

    /**
     * Closes any open diff editors associated with the given file path by targeting
     * our custom URI scheme.
     * @param filePath The file path to close diffs for.
     */
    async closeDiff(filePath: string): Promise<void> {
        const tabsToClose: any[] = [];
        
        // Iterate through all tab groups and tabs to find Suggestio diff tabs
        for (const group of this.vscodeApi.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input;
                // A diff tab has 'original' and 'modified' URIs
                if (input && input.original && input.modified) {
                    const originalUri = input.original.toString();
                    const modifiedUri = input.modified.toString();

                    // Check if these URIs belong to our scheme and target the specific file
                    if (originalUri.includes(`${DiffManager.scheme}:/original/${filePath}`) ||
                        modifiedUri.includes(`${DiffManager.scheme}:/modified/${filePath}`)) {
                        tabsToClose.push(tab);
                    }
                }
            }
        }

        if (tabsToClose.length > 0) {
            await this.vscodeApi.window.tabGroups.close(tabsToClose);
        }
    }
}
