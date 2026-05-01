import { IFileContentReader, IFileReadProvider } from '../types.js';

/**
 * Implementation of IFileContentReader that provides file system access
 * with support for reading specific line ranges.
 */
export class FileContentReader implements IFileContentReader {
    constructor(private fileReadProvider: IFileReadProvider) {}

    /**
     * Reads the content of a file at the given path, optionally within a line range.
     * 
     * @param filePath The path of the file to read.
     * @param startLine Optional start line (1-indexed).
     * @param endLine Optional end line (1-indexed).
     * @returns The file content as a string, or undefined if the read failed.
     */
    read(filePath: string, startLine?: number, endLine?: number): string | undefined {
        try {
            if (this.fileReadProvider.existsSync(filePath)) {
                const content = this.fileReadProvider.readFileSync(filePath, 'utf-8');
                
                if (startLine === undefined && endLine === undefined) {
                    return content;
                }

                const lines = content.split(/\r?\n/);
                
                // Convert 1-based line numbers to 0-based indices
                const start = Math.max(0, (startLine || 1) - 1);
                
                // endLine is exclusive in .slice()
                const end = endLine ? Math.min(lines.length, endLine) : lines.length;

                if (start > end) {
                    return '';
                }

                return lines.slice(start, end).join('\n');
            }
        } catch (error) {
            return undefined;
        }
        return undefined;
    }
}
