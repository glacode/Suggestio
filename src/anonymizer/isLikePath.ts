export function isLikePath(token: string): boolean {
    // Normalize separators
    const s = token.replace(/\\/g, '/');

    // Must contain at least one separator
    if (!s.includes('/')) { return false; }

    // Common file extensions
    if (/\.(ts|js|tsx|jsx|py|java|cs|json|yml|yaml|xml|md|txt)$/i.test(s)) {
        return true;
    }

    // Looks like path segments (no high-entropy chunks)
    const segments = s.split('/');
    if (segments.length < 2) { return false; }

    // Each segment must look identifier-ish or extension-ish
    return segments.every(seg =>
        seg.length === 0 ||
        /^[a-zA-Z0-9._-]+$/.test(seg)
    );
}
