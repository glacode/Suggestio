import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { FileContentReader } from "../../src/utils/FileContentReader.js";
import { IFileReadProvider } from "../../src/types.js";

describe("FileContentReader", () => {
    let reader: FileContentReader;
    let mockFileReadProvider: jest.Mocked<IFileReadProvider>;
    const mockFilePath = "/home/user/project/test.txt";
    const mockContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";

    beforeEach(() => {
        mockFileReadProvider = {
            existsSync: jest.fn(),
            readFileSync: jest.fn(),
        };
        
        mockFileReadProvider.existsSync.mockReturnValue(true);
        mockFileReadProvider.readFileSync.mockReturnValue(mockContent);

        reader = new FileContentReader(mockFileReadProvider);
    });

    it("should read the entire file when no range is provided", () => {
        const result = reader.read(mockFilePath);
        expect(result).toBe(mockContent);
        expect(mockFileReadProvider.readFileSync).toHaveBeenCalledWith(mockFilePath, 'utf-8');
    });

    it("should read a single line when startLine equals endLine", () => {
        const result = reader.read(mockFilePath, 2, 2);
        expect(result).toBe("Line 2");
    });

    it("should return an empty string when endLine is less than startLine", () => {
        const result = reader.read(mockFilePath, 5, 2);
        expect(result).toBe("");
    });

    it("should read from startLine to the end of the file when endLine is missing", () => {
        const result = reader.read(mockFilePath, 4);
        expect(result).toBe("Line 4\nLine 5");
    });

    it("should read from the beginning to endLine when startLine is missing", () => {
        const result = reader.read(mockFilePath, undefined, 3);
        expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should read a specific range", () => {
        const result = reader.read(mockFilePath, 2, 4);
        expect(result).toBe("Line 2\nLine 3\nLine 4");
    });

    it("should handle startLine < 1 by treating it as 1", () => {
        const result = reader.read(mockFilePath, 0, 2);
        expect(result).toBe("Line 1\nLine 2");
    });

    it("should handle endLine > file length by reading until the end", () => {
        const result = reader.read(mockFilePath, 1, 100);
        expect(result).toBe(mockContent);
    });

    it("should return undefined if the file does not exist", () => {
        mockFileReadProvider.existsSync.mockReturnValue(false);
        const result = reader.read(mockFilePath);
        expect(result).toBeUndefined();
    });

    it("should return undefined if readFileSync throws an error", () => {
        mockFileReadProvider.readFileSync.mockImplementation(() => {
            throw new Error("Read error");
        });
        const result = reader.read(mockFilePath);
        expect(result).toBeUndefined();
    });
});
