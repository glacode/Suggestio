import { describe, it, beforeEach, expect, jest, afterEach } from "@jest/globals";
import { PersistentChatHistoryManager } from "../../src/chat/persistentChatHistoryManager.js";
import { IChatHistoryManager, IChatSession, IChatMessage, IWorkspaceChatHistoryStorage } from "../../src/types.js";
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

    it("should schedule save when a message is added", () => {
        const message: IChatMessage = { role: "user", content: "Hello" };
        persistentManager.addMessage(message);

        expect(mockHistoryManager.addMessage).toHaveBeenCalledWith(message);
        
        // Save should not be called immediately
        expect(mockStorage.saveSessions).not.toHaveBeenCalled();

        // Fast-forward time
        mockHistoryManager.getChatHistory.mockReturnValue([message]);
        jest.advanceTimersByTime(2000);

        expect(mockStorage.saveSessions).toHaveBeenCalled();
    });

    it("should generate a title from the first user message", () => {
        const history: IChatMessage[] = [
            { role: "user", content: "This is a very long message that should be truncated" },
            { role: "assistant", content: "OK" }
        ];
        mockHistoryManager.getChatHistory.mockReturnValue(history);

        persistentManager.addMessage(history[0]);
        jest.advanceTimersByTime(2000);

        expect(mockStorage.saveSessions).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    title: "This is a very long message th..."
                })
            ])
        );
    });

    it("should handle clearing history", () => {
        persistentManager.clearHistory();
        expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
        
        jest.advanceTimersByTime(2000);
        // Save should NOT be called if history is empty (based on our implementation)
        expect(mockStorage.saveSessions).not.toHaveBeenCalled();
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
