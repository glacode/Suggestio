import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ToolImplementation, ToolCall, IEventBus } from "../../src/types.js";
import { FakeProvider, createMockHistoryManager, createDefaultConfig, createMockEventBus } from "../testUtils.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";

describe("Agent", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatMessage[];
    let mockPrompt: IPrompt;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        mockChatHistory = [];
        mockChatHistoryManager = createMockHistoryManager(mockChatHistory);
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
        mockEventBus = createMockEventBus();
    });

    it("runs a simple chat without tools", async () => {
        const provider = new FakeProvider([{ role: "assistant", content: "Hello!" }], mockEventBus);
        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [],
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await agent.run(mockPrompt);

        expect(streamedContent).toBe("Hello!");
        expect(mockChatHistory.length).toBe(1);
        expect(mockChatHistory[0].content).toBe("Hello!");
    });

    it("handles tool calls and continues the loop", async () => {
        const tool: ToolImplementation = {
            definition: {
                name: "test_tool",
                description: "A test tool",
                parameters: { type: "object", properties: { arg: { type: "string" } } }
            },
            execute: jest.fn(async (args: any) => `Result for ${args.arg}`)
        };

        const provider = new FakeProvider([
            {
                role: "assistant",
                content: "Calling tool...",
                tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: { name: "test_tool", arguments: '{"arg": "val"}' }
                }]
            },
            { role: "assistant", content: "Final answer" }
        ], mockEventBus);

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [tool],
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await agent.run(mockPrompt);

        expect(streamedContent).toBe("Calling tool...Final answer");
        expect(tool.execute).toHaveBeenCalledWith({ arg: "val" }, undefined);

        // History should have: 
        // 1. Assistant tool call
        // 2. Tool result
        // 3. Final assistant answer
        expect(mockChatHistory.length).toBe(3);
        expect(mockChatHistory[0].role).toBe("assistant");
        expect(mockChatHistory[1].role).toBe("tool");
        expect(mockChatHistory[1].content).toBe("Result for val");
        expect(mockChatHistory[2].content).toBe("Final answer");
    });

    it("handles tool not found", async () => {
        const toolCall: ToolCall = {
            id: "call_456",
            type: "function",
            function: {
                name: "unknownTool",
                arguments: "{}"
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "I could not find the tool."
        };

        const provider = new FakeProvider([toolResponse, finalResponse], mockEventBus);
        const mockAddMessage = jest.spyOn(mockChatHistoryManager, 'addMessage');

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [], // No tools
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(logs).toContain("Tool not found: unknownTool");
        expect(mockAddMessage).toHaveBeenCalledWith(expect.objectContaining({
            role: "tool",
            content: expect.stringContaining(AGENT_MESSAGES.ERROR_TOOL_NOT_FOUND("unknownTool")),
            tool_call_id: "call_456"
        }));
    });

    it("handles tool execution error", async () => {
        const toolCall: ToolCall = {
            id: "call_789",
            type: "function",
            function: {
                name: "errorTool",
                arguments: "{}"
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Something went wrong."
        };

        const provider = new FakeProvider([toolResponse, finalResponse], mockEventBus);
        const mockAddMessage = jest.spyOn(mockChatHistoryManager, 'addMessage');

        const mockTool: ToolImplementation = {
            definition: {
                name: "errorTool",
                description: "Throws an error",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => { throw new Error("Tool failed"); })
        };

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(logs).toContain("Error executing tool: Tool failed");
        expect(mockAddMessage).toHaveBeenCalledWith(expect.objectContaining({
            role: "tool",
            content: AGENT_MESSAGES.ERROR_TOOL_FAILED,
            tool_call_id: "call_789"
        }));
    });

    it("processes multiple tool calls in a single response", async () => {
        const toolCall1: ToolCall = {
            id: "call_A",
            type: "function",
            function: {
                name: "toolA",
                arguments: JSON.stringify({ arg: "valA" })
            }
        };

        const toolCall2: ToolCall = {
            id: "call_B",
            type: "function",
            function: {
                name: "toolB",
                arguments: JSON.stringify({ arg: "valB" })
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall1, toolCall2]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Processed both."
        };

        const provider = new FakeProvider([toolResponse, finalResponse], mockEventBus);

        const mockToolA: ToolImplementation = {
            definition: { name: "toolA", description: "Tool A", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result A")
        };

        const mockToolB: ToolImplementation = {
            definition: { name: "toolB", description: "Tool B", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result B")
        };

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockToolA, mockToolB],
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await agent.run(mockPrompt);

        expect(streamedContent).toBe("Processed both.");
        expect(mockToolA.execute).toHaveBeenCalledWith({ arg: "valA" }, undefined);
        expect(mockToolB.execute).toHaveBeenCalledWith({ arg: "valB" }, undefined);

        // Verify history
        expect(mockChatHistory.length).toBe(4);
        expect(mockChatHistory[0]).toEqual(toolResponse);
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "Result A",
            tool_call_id: "call_A"
        });
        expect(mockChatHistory[2]).toEqual({
            role: "tool",
            content: "Result B",
            tool_call_id: "call_B"
        });
        expect(mockChatHistory[3]).toEqual(finalResponse);
    });

    it("handles multiple consecutive iterations of tool calls", async () => {
        // Round 1: Assistant requests tool 1
        const toolCall1: ToolCall = {
            id: "call_1",
            type: "function",
            function: { name: "tool1", arguments: "{}" }
        };
        const response1: ChatMessage = {
            role: "assistant",
            content: "Step 1",
            tool_calls: [toolCall1]
        };

        // Round 2: Assistant requests tool 2
        const toolCall2: ToolCall = {
            id: "call_2",
            type: "function",
            function: { name: "tool2", arguments: "{}" }
        };
        const response2: ChatMessage = {
            role: "assistant",
            content: "Step 2",
            tool_calls: [toolCall2]
        };

        // Round 3: Final response
        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Done."
        };

        const provider = new FakeProvider([response1, response2, finalResponse], mockEventBus);

        const mockTool1: ToolImplementation = {
            definition: { name: "tool1", description: "Tool 1", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result 1")
        };

        const mockTool2: ToolImplementation = {
            definition: { name: "tool2", description: "Tool 2", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result 2")
        };

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool1, mockTool2],
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await agent.run(mockPrompt);

        expect(streamedContent).toBe("Step 1Step 2Done.");
        expect(mockTool1.execute).toHaveBeenCalled();
        expect(mockTool2.execute).toHaveBeenCalled();

        // Verify flow
        expect(mockChatHistory.length).toBe(5);
        expect(mockChatHistory[0]).toEqual(response1);
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "Result 1",
            tool_call_id: "call_1"
        });
        expect(mockChatHistory[2]).toEqual(response2);
        expect(mockChatHistory[3]).toEqual({
            role: "tool",
            content: "Result 2",
            tool_call_id: "call_2"
        });
        expect(mockChatHistory[4]).toEqual(finalResponse);
    });

    it("STOPS the loop if AbortSignal is aborted between iterations", async () => {
        const tool: ToolImplementation = {
            definition: {
                name: "test_tool",
                description: "A test tool",
                parameters: { type: "object", properties: { arg: { type: "string" } } }
            },
            execute: jest.fn(async () => `Result`)
        };

        const provider = new FakeProvider([
            {
                role: "assistant",
                content: "Calling tool...",
                tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: { name: "test_tool", arguments: '{"arg": "val"}' }
                }]
            },
            { role: "assistant", content: "Final answer" }
        ], mockEventBus);

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [tool],
            eventBus: mockEventBus
        });

        const controller = new AbortController();

        // Mock execute to abort the controller mid-run
        jest.spyOn(tool, 'execute').mockImplementation(async () => {
            controller.abort();
            return "Tool result";
        });

        await agent.run(mockPrompt, controller.signal);

        // If the loop respected the signal, it should have stopped AFTER the first tool call
        // and NOT called the provider for the "Final answer".
        expect(provider.queryCount).toBe(1);
        expect(mockChatHistory.length).toBe(2); // Assistant call + Tool result, but no Final answer
    });

    it("passes AbortSignal to tools", async () => {
        const tool: ToolImplementation = {
            definition: {
                name: "test_tool",
                description: "A test tool",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async (_args: any, signal?: AbortSignal) => {
                if (!signal) { throw new Error("Signal not passed to tool"); }
                return "OK";
            })
        };

        const provider = new FakeProvider([
            {
                role: "assistant",
                content: "Calling tool...",
                tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: { name: "test_tool", arguments: '{}' }
                }]
            }
        ], mockEventBus);

        const agent = new Agent({
            config: createDefaultConfig({ llmProviderForChat: provider }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager,
            tools: [tool],
            eventBus: mockEventBus
        });

        const controller = new AbortController();
        await agent.run(mockPrompt, controller.signal);

        expect(tool.execute).toHaveBeenCalledWith(expect.anything(), controller.signal);
    });
});