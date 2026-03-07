/**
 * Normalizes a path to use forward slashes (/) regardless of the OS.
 * This is crucial for consistent glob matching and display across Linux and Windows.
 * 
 * @param p The path to normalize.
 * @returns The normalized path with forward slashes.
 */
export function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}
