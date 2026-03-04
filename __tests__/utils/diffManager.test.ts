import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { DiffManager } from "../../src/utils/diffManager.js";
import { IVscodeApiLocal } from "../../src/types.js";
import { createMockVscodeApi } from "../testUtils.js";

describe("DiffManager", () => {
    let vscodeApi: IVscodeApiLocal;
    let diffManager: DiffManager;

    beforeEach(() => {
        vscodeApi = createMockVscodeApi();
        diffManager = new DiffManager(vscodeApi);
    });

    it("should store content and call vscode.diff command with correct URIs", async () => {
        const filePath = "src/test.ts";
        const oldContent = "old";
        const newContent = "new";

        await diffManager.showDiff(filePath, oldContent, newContent);

        // Verify executeCommand was called with 'vscode.diff'
        expect(vscodeApi.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.diff",
            expect.anything(),
            expect.anything(),
            expect.stringContaining("test.ts")
        );

        // Verify getContent retrieves the stored data using the URI strings from the mock
        const parseMock = jest.mocked(vscodeApi.Uri.parse);
        const leftUri = parseMock.mock.results[0].value;
        const rightUri = parseMock.mock.results[1].value;

        function isUri(obj: any): obj is { toString(): string } {
            return obj && typeof obj.toString === 'function';
        }

        if (isUri(leftUri) && isUri(rightUri)) {
            expect(diffManager.getContent(leftUri.toString())).toBe(oldContent);
            expect(diffManager.getContent(rightUri.toString())).toBe(newContent);
        } else {
            throw new Error("Mock results were not URIs");
        }
    });

    it("should return empty string for unknown URIs", () => {
        expect(diffManager.getContent("unknown")).toBe("");
    });

    it("should use different timestamps/versions for consecutive calls", async () => {
        const filePath = "file.ts";
        
        await diffManager.showDiff(filePath, "o1", "n1");
        const parseMock = jest.mocked(vscodeApi.Uri.parse);
        const uri1 = parseMock.mock.calls[0][0];

        // Small delay to ensure timestamp changes if Date.now() is used
        await new Promise(resolve => setTimeout(resolve, 2));

        await diffManager.showDiff(filePath, "o2", "n2");
        const uri2 = parseMock.mock.calls[2][0];

        expect(uri1).not.toBe(uri2);
    });
});
