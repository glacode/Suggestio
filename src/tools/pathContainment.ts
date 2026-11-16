import { IPathResolver } from '../types.js';

/**
 * The reason a workspace target could not be resolved to a safe path.
 */
export type WorkspaceTargetError = 'NO_WORKSPACE' | 'OUTSIDE_WORKSPACE';

/**
 * Discriminated result of resolving a workspace-relative target path:
 * either the resolved absolute path that is guaranteed to stay within
 * the workspace root, or the reason it was rejected.
 */
export type ResolvedWorkspaceTarget =
    | { ok: true; resolvedPath: string }
    | { ok: false; error: WorkspaceTargetError };

/**
 * The single owner of workspace path containment. A candidate path is
 * within the workspace when it equals the root, or when the computed
 * relative path neither escapes upward nor lands on another volume
 * (an absolute relative path on Windows means a different drive).
 * A child named with a leading ".." (e.g. "..foo") is a legitimate
 * descendant, so the boundary is checked exactly.
 */
export function isPathWithinWorkspace(
    pathResolver: IPathResolver,
    rootPath: string,
    candidatePath: string
): boolean {
    if (candidatePath === rootPath) {
        return true;
    }
    const relativePath = pathResolver.relative(rootPath, candidatePath);
    if (pathResolver.isAbsolute(relativePath)) {
        return false;
    }
    return relativePath !== '..' && !relativePath.startsWith('../') && !relativePath.startsWith('..\\');
}

/**
 * Resolves a tool's user-supplied target (relative to the workspace root)
 * through the platform path semantics and verifies containment, so every
 * file tool shares one implementation of the workspace boundary.
 */
export function resolveWorkspaceTarget(
    pathResolver: IPathResolver,
    rootPath: string | undefined,
    rawRelativePath: string
): ResolvedWorkspaceTarget {
    if (!rootPath) {
        return { ok: false, error: 'NO_WORKSPACE' };
    }

    const fullPath = pathResolver.join(rootPath, rawRelativePath);
    const resolvedPath = pathResolver.resolve(fullPath);

    if (!isPathWithinWorkspace(pathResolver, rootPath, resolvedPath)) {
        return { ok: false, error: 'OUTSIDE_WORKSPACE' };
    }

    return { ok: true, resolvedPath };
}
