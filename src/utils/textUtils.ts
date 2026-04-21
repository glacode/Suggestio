/**
 * Truncates a string from the middle if it exceeds the maximum length.
 * 
 * @param text The text to truncate.
 * @param maxLength The maximum allowed length.
 * @returns The truncated text with an ellipsis in the middle.
 */
export function adaptiveMiddleTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }

    const truncatedCount = text.length - maxLength;
    const ellipsis = `\n\n... (truncated ${truncatedCount} characters) ...\n\n`;

    const remaining = maxLength - ellipsis.length;
    if (remaining <= 0) {
        return ellipsis;
    }

    const headLength = Math.floor(remaining / 2);
    const tailLength = remaining - headLength;

    const head = text.substring(0, headLength).trimEnd();
    const tail = text.substring(text.length - tailLength).trimStart();

    return `${head}${ellipsis}${tail}`;
}
