import { describe, it, expect } from "@jest/globals";
import { win32 as win32Path } from "path";
import { IPathResolver } from "../../src/types.js";
import { isPathWithinWorkspace, resolveWorkspaceTarget } from "../../src/tools/pathContainment.js";
import { createMockPathResolver } from "../testUtils.js";

describe("isPathWithinWorkspace", () => {
    it("accepts a child path inside the workspace", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/root/project/src/file.ts")).toBe(true);
    });

    it("accepts the workspace root itself", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/root/project")).toBe(true);
    });

    it("rejects a sibling directory whose name extends the workspace root prefix", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/root/project-evil/file.ts")).toBe(false);
    });

    it("rejects a path that escapes above the workspace root", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/etc/passwd")).toBe(false);
    });

    it("rejects the direct parent of the workspace root", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/root")).toBe(false);
    });

    it("accepts a child whose name begins with the parent-directory marker", () => {
        const pathResolver = createMockPathResolver();
        expect(isPathWithinWorkspace(pathResolver, "/root/project", "/root/project/..hidden/file.ts")).toBe(true);
    });

    it("rejects a path on a different drive under Windows semantics", () => {
        const win32Resolver: IPathResolver = win32Path;
        expect(isPathWithinWorkspace(win32Resolver, "C:\\work\\project", "D:\\secrets\\file.txt")).toBe(false);
    });

    it("accepts a child path under Windows semantics", () => {
        const win32Resolver: IPathResolver = win32Path;
        expect(isPathWithinWorkspace(win32Resolver, "C:\\work\\project", "C:\\work\\project\\src\\file.ts")).toBe(true);
    });
});

describe("resolveWorkspaceTarget", () => {
    it("reports a missing workspace without touching the resolver", () => {
        const pathResolver = createMockPathResolver();
        const target = resolveWorkspaceTarget(pathResolver, undefined, "src/file.ts");
        expect(target).toEqual({ ok: false, error: "NO_WORKSPACE" });
        expect(pathResolver.join).not.toHaveBeenCalled();
    });

    it("resolves a workspace-relative target to the joined and resolved path", () => {
        const pathResolver = createMockPathResolver();
        const target = resolveWorkspaceTarget(pathResolver, "/root/project", "src/file.ts");
        expect(target).toEqual({ ok: true, resolvedPath: "/root/project/src/file.ts" });
    });

    it("resolves an empty target to the workspace root itself", () => {
        const pathResolver = createMockPathResolver();
        const target = resolveWorkspaceTarget(pathResolver, "/root/project", "");
        expect(target).toEqual({ ok: true, resolvedPath: "/root/project" });
    });

    it("rejects a sibling directory sharing the workspace root prefix", () => {
        const pathResolver = createMockPathResolver();
        const target = resolveWorkspaceTarget(pathResolver, "/root/project", "../project-evil/file.ts");
        expect(target).toEqual({ ok: false, error: "OUTSIDE_WORKSPACE" });
    });

    it("rejects a target that escapes above the workspace root", () => {
        const pathResolver = createMockPathResolver();
        const target = resolveWorkspaceTarget(pathResolver, "/root/project", "../../../../etc/passwd");
        expect(target).toEqual({ ok: false, error: "OUTSIDE_WORKSPACE" });
    });
});
