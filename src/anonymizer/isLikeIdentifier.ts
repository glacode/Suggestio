export function isLikeIdentifier(token: string): boolean {
    // Reject if it contains path-like or punctuation
    if (/[/\\.]/.test(token)) { return false; }

    // Must start with letter or underscore
    if (!/^[A-Za-z_]/.test(token)) { return false; }

    // Allowed identifier chars
    if (!/^[A-Za-z0-9_]+$/.test(token)) { return false; }

    // Reject extremely unbalanced digit-heavy tokens
    const digitRatio = (token.match(/\d/g)?.length ?? 0) / token.length;
    if (digitRatio > 0.4) { return false; }

    if (
        // 1. camelCase: starts low, then uppercase for new words, no underscores
        /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(token) ||

        // 2. PascalCase: starts high, then uppercase for new words, no underscores
        /^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(token) ||

        // 3. snake_case: all lowercase and underscores
        /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(token) ||

        // 4. SCREAMING_SNAKE_CASE: all uppercase and underscores
        /^[A-Z0-9_]+$/.test(token)
    ) {
        return true;
    }

    // Default: identifiers usually have low entropy
    return true;
}
