import { describe, it, beforeEach, expect, jest, afterEach } from "@jest/globals";
import { PersistentChatHistoryManager } from "../../src/chat/persistentChatHistoryManager.js";
import { IChatHistoryManager, IChatSession, IChatMessage, IWorkspaceChatHistoryStorage, IStoredChatMessage } from "../../src/types.js";
import { createMockHistoryManager, createMockWorkspaceChatHistoryStorage } from "../testUtils.js";

describe("PersistentChatHistoryManager", () => {
    let persistentManager: PersistentChatHistoryManager;
    let mockHistoryManager: jest.Mocked<IChatHistoryManager>;
    let mockStorage: jest.Mocked<IWorkspaceChatHistoryStorage>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockHistoryManager = createMockHistoryManager();
        mockStorage = createMockWorkspaceChatHistoryStorage();

        persistentManager = new PersistentChatHistoryManager(mockHistoryManager, mockStorage);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("should load sessions on initialization", () => {
        expect(mockStorage.loadSessions).toHaveBeenCalled();
    });

    it("should NOT save when a message is added (now turn-based)", () => {
        const message: IChatMessage = { role: "user", content: "Hello" };
        persistentManager.addMessage(message);

        expect(mockHistoryManager.addMessage).toHaveBeenCalledWith(message);
        
        // Save should not be called or scheduled
        jest.advanceTimersByTime(2000);
        expect(mockStorage.saveSession).not.toHaveBeenCalled();
    });

    it("should save when persistCurrentSession is called", () => {
        const message: IStoredChatMessage = { role: "user", content: "Hello" };
        mockHistoryManager.getChatHistory.mockReturnValue([message]);
        
        persistentManager.persistCurrentSession();
        expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it("should generate a title from the first user message", () => {
        const history: IStoredChatMessage[] = [
            { role: "user", content: "This is a very long message that should be truncated" },
            { role: "assistant", content: "OK" }
        ];
        mockHistoryManager.getChatHistory.mockReturnValue(history);

        persistentManager.persistCurrentSession();

        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "This is a very long message th..."
            })
        );
    });

    it("should handle clearing history", () => {
        persistentManager.clearHistory();
        expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
    });

    it("should load a specific session", async () => {
        const session: IChatSession = {
            id: "session-1",
            title: "Test Session",
            timestamp: Date.now(),
            history: [{ role: "user", content: "Saved message" }]
        };
        mockStorage.loadSessions.mockReturnValue([session]);
        
        // Re-init to load sessions
        persistentManager = new PersistentChatHistoryManager(mockHistoryManager, mockStorage);

        await persistentManager.loadSession("session-1");

        expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
        expect(mockHistoryManager.addMessage).toHaveBeenCalledWith(session.history[0]);
    });

    it("should create a new session", () => {
        persistentManager.newSession();
        expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
    });
});
