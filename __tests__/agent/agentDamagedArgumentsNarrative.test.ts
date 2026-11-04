// ============================================================================
// Damaged tool call arguments, end to end.
//
// LEG 1 - what the model emits (raw arguments text) is repaired into a
//         self-describing stub and annotated with the parse error and the
//         original bytes.
// LEG 2 - the model re-reads its own past call: annotations stripped, stub
//         line speaking for itself on the wire.
// LEG 3 - the agent answers with the four-line narrative, telling the model
//         exactly what it sent, and never executes the damaged call.
// LEG 4 - the recorded tool response is exactly that narrative, byte for byte.
//
// Every assertion is pinned to a readable constant in conversation order.
// ============================================================================

import { Agent } from "../../src/agent/agent.js";
import { OpenAIStreamHandler } from "../../src/providers/openAIStreamHandler.js";
import { StandardReasoningProcessor } from "../../src/providers/reasoningProcessor.js";
import { OpenAIResponseParser } from "../../src/providers/openAIResponseParser.js";
import { DAMAGED_ARGUMENTS_STUB } from "../../src/providers/toolCallJson.js";
import { IHttpResponse, IToolImplementation, IToolDefinition } from "../../src/types.js";
import { z } from "zod";
import { withoutNodeJsonLineColumn, createMockEventBus, createMockHistoryManager, createMockLogger, createMockAnonymizer, createDefaultConfig, FakeProvider } from "../testUtils.js";
import { expect, jest } from "@jest/globals";

// ----------------------------------------------------------------------------
// LEG 1 - the arguments text the model emitted, byte for byte. The unescaped
// quotes around "Aria" kill the JSON: parsing stops at position 66.
// ----------------------------------------------------------------------------
const MODEL_RAW_EMITTED_ARGUMENTS =
    '{"path": "task-manager/style.css", "content": "h1 { font-family: "Aria';

const JSON_PARSE_ERROR_FOR_THE_EMITTED_ARGUMENTS =
    "Expected ',' or '}' after property value in JSON at position 66";

// ----------------------------------------------------------------------------
// LEG 2 - the model's past call as it re-reads it from the replayed history:
// the self-describing stub line speaks for itself on the wire and points at
// the tool result that follows it.
// ----------------------------------------------------------------------------
const TOOL_CALL_ARGUMENTS_THE_MODEL_WOULD_SEE = DAMAGED_ARGUMENTS_STUB;

// ----------------------------------------------------------------------------
// LEG 4 - the tool result we record, exactly as the model will read it: the
// real parse error, the model's own broken bytes, the required parameters
// and the correction tip, one idea per line.
// ----------------------------------------------------------------------------
const TOOL_RESPONSE_CONTENT_THE_MODEL_RECEIVES = [
    `The arguments for tool 'write_file' could not be parsed as JSON: ${JSON_PARSE_ERROR_FOR_THE_EMITTED_ARGUMENTS}.`,
    `Original text sent before repair: ${MODEL_RAW_EMITTED_ARGUMENTS}`,
    "Required parameters: path, content.",
    'Re-send with a valid JSON object; escape inner quotes and newlines (\\" \\n).'
].join("\n");

describe("Damaged tool call arguments, end to end", () => {
  async function* createAsyncIterable(chunks: string[]) {
    for (const chunk of chunks) {
      yield Buffer.from(chunk);
    }
  }

  it("should tell the model exactly what it sent when its tool arguments were damaged", async () => {
    // ------------------------------------------------------------------------
    // LEG 1 - WHAT THE LLM SENDS. On the wire the arguments arrive as a string
    // with a raw unescaped quote; the delta JSON escapes every quote for
    // transport, but the damage survives decoding:
    //
    //   data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1",
    //     "type":"function","function":{"name":"write_file",
    //     "arguments":"{\"path\": \"task-manager/style.css\", \"content\": \"h1
    //     { font-family: \"Aria"}}]}}]}
    // ------------------------------------------------------------------------
    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"write_file","arguments":"{\\"path\\": \\"task-manager/style.css\\", \\"content\\": \\"h1 { font-family: \\"Aria"}}]}}]}\n',
      "data: [DONE]\n"
    ];

    const response: IHttpResponse = {
      body: createAsyncIterable(chunks),
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      text: jest.fn<() => Promise<string>>().mockResolvedValue('')
    };

    const processor = new StandardReasoningProcessor();
    const handler = new OpenAIStreamHandler(
      createMockEventBus(),
      processor,
      new OpenAIResponseParser(),
      createMockLogger(),
      createMockAnonymizer()
    );

    const messages = await handler.handleStream(response);
    const emittedToolCall = messages[0].tool_calls?.[0];

    // The emission becomes a message BY the model, ...
    expect(messages[0].role).toBe("assistant");
    // ... whose visible argument text is the self-describing stub ...
    expect(emittedToolCall?.function.arguments).toBe(TOOL_CALL_ARGUMENTS_THE_MODEL_WOULD_SEE);
    // ... annotated for the composer with the underlying JSON.parse error ...
    expect(withoutNodeJsonLineColumn(emittedToolCall?.argumentsParseError)).toBe(
      JSON_PARSE_ERROR_FOR_THE_EMITTED_ARGUMENTS
    );
    // ... and with the model's verbatim broken bytes.
    expect(emittedToolCall?.originalDamagedArguments).toBe(MODEL_RAW_EMITTED_ARGUMENTS);

    // ------------------------------------------------------------------------
    // LEG 2 - HOW THE MODEL RE-READS ITS OWN PAST CALL, i.e. what the next
    // request replays. The send surface strips the annotations; only the stub
    // line and our answer travel:
    //
    //   { "role": "assistant", "content": "",
    //     "tool_calls": [{ "id": "call_1", "type": "function",
    //       "function": { "name": "write_file",
    //         "arguments": "{\"_argumentsWereDamaged\": \"The original arguments
    //           text was unparseable JSON and has been replaced by this stub.
    //           See the following tool result for the original text and required
    //           parameters.\"}" } }] }
    // ------------------------------------------------------------------------
    const wireAssistantMessage = processor.prepareHistoryMessage(messages[0]);
    expect(wireAssistantMessage.role).toBe("assistant");
    expect(wireAssistantMessage.tool_calls[0].function.arguments).toBe(
      TOOL_CALL_ARGUMENTS_THE_MODEL_WOULD_SEE
    );
    expect("argumentsParseError" in wireAssistantMessage.tool_calls[0]).toBe(false);
    expect("originalDamagedArguments" in wireAssistantMessage.tool_calls[0]).toBe(false);

    // ------------------------------------------------------------------------
    // LEG 3 - the agent runs. The damaged call must not be executed; the tool
    // result must read as the narrative composed from the annotations:
    // ------------------------------------------------------------------------
    const schema = z.object({
      path: z.string(),
      content: z.string()
    }).strict();

    const definition: IToolDefinition = {
      name: "write_file",
      description: "Writes a file",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } }
    };

    const mockTool: IToolImplementation<any> = {
      definition,
      schema,
      execute: jest.fn<any>().mockResolvedValue({ content: "written", success: true }),
    };

    const mockHistoryManager = createMockHistoryManager([]);

    const fakeProvider = new FakeProvider([
      messages[0],
      { role: "assistant", content: "Final answer" }
    ]);

    const agent = new Agent({
      configContainer: { config: createDefaultConfig({ llmProviderForChat: fakeProvider }), rawConfigs: { default: '{}' } },
      chatHistoryManager: mockHistoryManager,
      eventBus: createMockEventBus(),
      tools: [mockTool]
    });

    await agent.run({ generateChatHistory: () => [] });

    expect(mockTool.execute).not.toHaveBeenCalled();

    // ------------------------------------------------------------------------
    // LEG 4 - WHAT WE RECORD AS THE TOOL RESPONSE, exactly as the model reads:
    //
    //   { "role": "tool", "tool_call_id": "call_1",
    //     "content": "The arguments for tool 'write_file' could not be parsed
    //       as JSON: Expected ',' or '}' after property value in JSON at
    //       position 66.\nOriginal text sent before repair:
    //       {\"path\": \"task-manager/style.css\", \"content\": \"h1 {
    //       font-family: \"Aria\nRequired parameters: path, content.\nRe-send
    //       with a valid JSON object; escape inner quotes and newlines
    //       (\\\" \\n)." }
    //
    // Node 21+ renders the parse error with a trailing "(line N column N)"
    // marker; the assertion compares the stable diagnostic core, so the
    // actual content is normalized before the byte-exact comparison.
    // ------------------------------------------------------------------------
    const toolResultMessage = mockHistoryManager.getChatHistory().find(m => m.role === "tool");

    // ... and the answer becomes a message TO the model:
    expect(toolResultMessage?.role).toBe("tool");
    expect(toolResultMessage?.tool_call_id).toBe("call_1");
    expect(withoutNodeJsonLineColumn(toolResultMessage?.content)).toBe(TOOL_RESPONSE_CONTENT_THE_MODEL_RECEIVES);
  });
});
