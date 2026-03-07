import { normalizePath } from './pathUtils.js';

/**
 * A very simple glob-to-regex converter.
 * Ported from IgnoreManager to be reusable across tools like GrepSearchTool.
 */
export function globToRegex(pattern: string): RegExp {
    // Normalize pattern
    let p = pattern.trim();
    
    let regexString = p
        .replace(/\./g, '\\.')
        .replace(/\*\*\//g, '(.*/)?') // Match zero or more directories
        .replace(/\*\*/g, '.*')      // Match zero or more characters
        .replace(/\*/g, '[^/]*');    // Match zero or more characters except /

    if (p.endsWith('/')) {
        return new RegExp(`^${regexString}.*`);
    } 
    
    if (!p.includes('/')) {
        if (!p.startsWith('*')) {
            return new RegExp(`^${regexString}(\\/.*)?$`);
        }
    }
    
    return new RegExp(`^${regexString}$`);
}

/**
 * Checks if a path matches a glob pattern.
 * @param path The relative path to check.
 * @param glob The glob pattern.
 */
export function matchesGlob(path: string, glob: string): boolean {
    const normalizedPath = normalizePath(path);
    const regex = globToRegex(glob);
    return regex.test(normalizedPath);
}
