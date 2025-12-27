const WELL_KNOWN_SECRET_PATTERNS: RegExp[] = [
    // AWS
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,

    // GitHub
    /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/,

    // Google
    /\bAIza[0-9A-Za-z\-_]{35}\b/,

    // Stripe
    /\bsk_(test|live)_[0-9a-zA-Z]{16,}\b/,

    // Slack
    /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/,

    // Generic JWT
    /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\b/
];

export function matchesWellKnownSecret(token: string): boolean {
    return WELL_KNOWN_SECRET_PATTERNS.some(r => r.test(token));
}