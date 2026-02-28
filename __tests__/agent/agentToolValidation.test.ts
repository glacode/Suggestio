import { Agent } from "../../src/agent/agent.js";
import { IToolImplementation, IToolDefinition } from "../../src/types.js";
import { z } from "zod";
import { jest } from "@jest/globals";
import { createMockEventBus, createMockHistoryManager, createDefaultConfig, FakeProvider } from "../testUtils.js";

describe("Agent Tool Argument Validation", () => {
    it("should return an error message to the LLM if Zod validation fails", async () => {
        const schema = z.object({
            count: z.number()
        });

        const definition: IToolDefinition = {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object", properties: { count: { type: "number" } } }
        };

        const mockTool: IToolImplementation<any> = {
            definition,
            schema,
            execute: jest.fn<any>().mockResolvedValue({ content: "success", success: true }),
        };

        const mockHistoryManager = createMockHistoryManager([]);
        const mockEventBus = createMockEventBus();
        
        const toolCall = {
            id: "call_123",
            type: "function" as const,
            function: {
                name: "test_tool",
                arguments: JSON.stringify({ count: "not-a-number" }) // Invalid type
            }
        };

        const fakeProvider = new FakeProvider([
            {
                role: "assistant",
                content: "I will call the tool",
                tool_calls: [toolCall]
            },
            {
                role: "assistant",
                content: "Final answer"
            }
        ]);

        const config = createDefaultConfig({
            llmProviderForChat: fakeProvider
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockHistoryManager,
            eventBus: mockEventBus,
            tools: [mockTool]
        });

        const mockPrompt = {
            generateChatHistory: () => []
        };

        await agent.run(mockPrompt);

        // Verify execute was NOT called
        expect(mockTool.execute).not.toHaveBeenCalled();

        const history = mockHistoryManager.getChatHistory();
        const toolResultMessage = history.find(m => m.role === "tool");
        
        expect(toolResultMessage).toBeDefined();
        expect(toolResultMessage?.content).toContain("Invalid arguments for tool 'test_tool'");
        expect(toolResultMessage?.content).toContain("count: ");
        expect(toolResultMessage?.content).toContain("expected number, received string");
        expect(toolResultMessage?.tool_call_id).toBe("call_123");
    });

    it("should proceed to execute if validation passes", async () => {
        const schema = z.object({
            count: z.number()
        });

        const definition: IToolDefinition = {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object", properties: { count: { type: "number" } } }
        };

        const mockTool: IToolImplementation<any> = {
            definition,
            schema,
            execute: jest.fn<any>().mockResolvedValue({ content: "Success result", success: true }),
        };

        const mockHistoryManager = createMockHistoryManager([]);
        const mockEventBus = createMockEventBus();

        const toolCall = {
            id: "call_123",
            type: "function" as const,
            function: {
                name: "test_tool",
                arguments: JSON.stringify({ count: 42 })
            }
        };

        const fakeProvider = new FakeProvider([
            {
                role: "assistant",
                content: "I will call the tool",
                tool_calls: [toolCall]
            },
            {
                role: "assistant",
                content: "Final answer"
            }
        ]);

        const config = createDefaultConfig({
            llmProviderForChat: fakeProvider
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockHistoryManager,
            eventBus: mockEventBus,
            tools: [mockTool]
        });

        const mockPrompt = {
            generateChatHistory: () => []
        };

        await agent.run(mockPrompt);

        expect(mockTool.execute).toHaveBeenCalledWith({ count: 42 }, undefined);
        
        const history = mockHistoryManager.getChatHistory();
        const toolResultMessage = history.find(m => m.role === "tool");
        expect(toolResultMessage?.content).toBe("Success result");
    });

    it("should return an error if unknown arguments are provided to a strict schema", async () => {
        const schema = z.object({
            directory: z.string().optional()
        }).strict();

        const definition: IToolDefinition = {
            name: "list_files",
            description: "List files",
            parameters: { type: "object", properties: { directory: { type: "string" } } }
        };

        const mockTool: IToolImplementation<any> = {
            definition,
            schema,
            execute: jest.fn<any>().mockResolvedValue({ content: "Success", success: true }),
        };

        const mockHistoryManager = createMockHistoryManager([]);
        const mockEventBus = createMockEventBus();
        
        const toolCall = {
            id: "call_unknown",
            type: "function" as const,
            function: {
                name: "list_files",
                arguments: JSON.stringify({ unknown_key: "value" })
            }
        };

        const fakeProvider = new FakeProvider([
            {
                role: "assistant",
                content: "I will call the tool",
                tool_calls: [toolCall]
            },
            {
                role: "assistant",
                content: "Final answer"
            }
        ]);

        const config = createDefaultConfig({
            llmProviderForChat: fakeProvider
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockHistoryManager,
            eventBus: mockEventBus,
            tools: [mockTool]
        });

        const mockPrompt = {
            generateChatHistory: () => []
        };

        await agent.run(mockPrompt);

        // Verify execute was NOT called
        expect(mockTool.execute).not.toHaveBeenCalled();

        const history = mockHistoryManager.getChatHistory();
        const toolResultMessage = history.find(m => m.role === "tool");
        
        expect(toolResultMessage).toBeDefined();
        expect(toolResultMessage?.content).toContain("Invalid arguments for tool 'list_files'");
        expect(toolResultMessage?.content).toContain("Unrecognized key: \"unknown_key\"");
    });
});
