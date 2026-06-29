import { 
  IChatMessage, 
  IAnonymizer, 
  IEventBus, 
  IHttpResponse, 
  IReasoningProcessor, 
  IOpenAIResponseParser, 
  IOpenAIStreamHandler,
  ToolCall,
  IStreamingDeanonymizer,
  IReasoningDelta
} from "../types.js";
import { APP_EVENTS } from "../constants/protocol.js";
import { OpenAIStreamDelta, OpenAIStreamingToolCall } from "./openAIResponseParser.js";
import { LLM_MESSAGES, LLM_LOGS } from "../constants/messages.js";

/**
 * Minimal logger interface for streaming events.
 */
interface IStreamingLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Implementation of IOpenAIStreamHandler that manages SSE parsing and stateful delta merging.
 */
export class OpenAIStreamHandler implements IOpenAIStreamHandler {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly reasoningProcessor: IReasoningProcessor,
    private readonly parser: IOpenAIResponseParser,
    private readonly logger: IStreamingLogger,
    private readonly anonymizer?: IAnonymizer
  ) {}

  /**
   * Processes the Server-Sent Events (SSE) stream.
   */
  async handleStream(response: IHttpResponse): Promise<IChatMessage[]> {
    if (!response.body) {
      throw new Error(LLM_MESSAGES.RESPONSE_BODY_NULL);
    }

    const contentDeanonymizer = this.anonymizer?.createStreamingDeanonymizer();
    const reasoningDeanonymizer = this.anonymizer?.createStreamingDeanonymizer();
    
    let currentReasoning = "";
    let currentContent = "";
    let currentToolCalls: ToolCall[] = [];
    const flushedMessages: IChatMessage[] = [];
    let currentPhase: 'none' | 'reasoning' | 'content' | 'tool_calls' = 'none';

    const flushCurrentMessage = () => {
        if (currentPhase === 'none') { return; }

        let messageToPush: IChatMessage | null = null;

        if (currentPhase === 'reasoning') {
            const flushed = this.flushDeanonymizer(reasoningDeanonymizer, 'reasoning');
            const totalReasoning = currentReasoning + flushed;
            if (totalReasoning) {
                messageToPush = { role: 'assistant', content: '', reasoning: totalReasoning };
            }
            currentReasoning = "";
        } else if (currentPhase === 'content') {
            const flushed = this.flushDeanonymizer(contentDeanonymizer, 'content');
            const totalContent = currentContent + flushed;
            if (totalContent) {
                messageToPush = { role: 'assistant', content: totalContent };
            }
            currentContent = "";
        } else if (currentPhase === 'tool_calls' && currentToolCalls.length > 0) {
            messageToPush = { role: 'assistant', content: '', tool_calls: currentToolCalls };
            currentToolCalls = [];
        }

        if (messageToPush) {
            flushedMessages.push(messageToPush);
        }
        currentPhase = 'none';
    };

    let buffer = "";

    for await (const chunk of response.body) {
      const chunkStr = chunk.toString();
      this.logger.debug(LLM_LOGS.STREAM_CHUNK_RECEIVED(chunkStr.length));
      const { lines, newBuffer } = this.processChunk(chunkStr, buffer);
      buffer = newBuffer;

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const data = line.substring(6).trim();
        this.logger.debug(LLM_LOGS.STREAM_DATA_RECEIVED(data));
        if (data === "[DONE]") {
          this.logger.debug(LLM_LOGS.STREAM_DONE);
          flushCurrentMessage();
          return flushedMessages;
        }

        try {
          const rawJson = JSON.parse(data);
          const result = this.parser.parseStreamChunk(rawJson);
          if (!result) {
            continue;
          }

          const { delta, finish_reason } = result;

          if (finish_reason) {
            this.logger.debug(LLM_LOGS.STREAM_FINISH_REASON(finish_reason));
          }

          if (!delta) {
            continue;
          }

          // 1. Detect reasoning/content delta
          const processed = this.reasoningProcessor.process(delta);
          const { content, reasoning } = this.handleContentDelta(processed, contentDeanonymizer, reasoningDeanonymizer);
          
          const hasReasoning = processed.reasoning !== undefined;
          const hasContent = processed.content !== undefined;

          if (hasReasoning) {
              if (currentPhase !== 'reasoning') {
                  flushCurrentMessage();
                  currentPhase = 'reasoning';
              }
              currentReasoning += reasoning;
          }

          if (hasContent) {
              if (content.length > 0 || (currentPhase !== 'reasoning' && !hasReasoning)) {
                  if (currentPhase !== 'content') {
                      flushCurrentMessage();
                      currentPhase = 'content';
                  }
                  currentContent += content;
              }
          }

          // 2. Detect tool calls delta
          if (delta.tool_calls) {
              if (currentPhase !== 'tool_calls') {
                  flushCurrentMessage();
                  currentPhase = 'tool_calls';
              }
              this.handleToolCallsDelta(delta, currentToolCalls);
          }

        } catch (e) {
          this.logger.error(LLM_MESSAGES.PARSE_CHUNK_ERROR(data));
        }
      }
    }

    this.logger.info(LLM_LOGS.STREAM_FINISHED);
    flushCurrentMessage();
    return flushedMessages;
  }

  private processChunk(chunk: string, buffer: string): { lines: string[]; newBuffer: string } {
    const currentBuffer = buffer + chunk;
    const lines = currentBuffer.split("\n");
    const newBuffer = lines.pop() || "";
    return { lines, newBuffer };
  }

  private handleContentDelta(
    processed: IReasoningDelta,
    contentDeanonymizer: IStreamingDeanonymizer | undefined,
    reasoningDeanonymizer: IStreamingDeanonymizer | undefined
  ): { content: string; reasoning: string } {
    let content = "";
    let reasoning = "";

    if (processed.reasoning !== undefined) {
      reasoning = this.processTokenStream(processed.reasoning, reasoningDeanonymizer, 'reasoning');
    }

    if (processed.content !== undefined) {
      content = this.processTokenStream(processed.content, contentDeanonymizer, 'content');
    }

    return { content, reasoning };
  }

  private processTokenStream(
    token: string,
    deanonymizer: IStreamingDeanonymizer | undefined,
    type: 'content' | 'reasoning'
  ): string {
    if (deanonymizer) {
      const { processed } = deanonymizer.process(token);
      if (processed) {
        this.eventBus.emit(APP_EVENTS.AGENT_TOKEN, { token: processed, type });
        return processed;
      }
      return "";
    } else {
      if (token) {
        this.eventBus.emit(APP_EVENTS.AGENT_TOKEN, { token, type });
      }
      return token;
    }
  }

  private getToolCallIndex(
    tc: OpenAIStreamingToolCall,
    toolCalls: ToolCall[],
    deltaCount: number,
    currentIterationIndex: number
  ): number {
    if (tc.index !== undefined && tc.index !== null) {
      return tc.index;
    } 
    
    if (tc.id) {
      const foundIndex = toolCalls.findIndex((t) => t.id === tc.id);
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return toolCalls.length;
    } 
    
    if (deltaCount === 1 && toolCalls.length <= 1) {
      return 0;
    } 
    
    return currentIterationIndex;
  }

  private applyToolCallDelta(index: number, tc: OpenAIStreamingToolCall, toolCalls: ToolCall[]): void {
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: tc.id || "",
        type: "function",
        function: { name: "", arguments: "" },
      };
    } else if (tc.id && toolCalls[index].id && toolCalls[index].id !== tc.id) {
      toolCalls[index].id = tc.id;
      toolCalls[index].function.name = "";
      toolCalls[index].function.arguments = "";
    }

    if (tc.id) {
      toolCalls[index].id = tc.id;
    }
    if (tc.extra_content) {
      toolCalls[index].extra_content = {
        ...(toolCalls[index].extra_content || {}),
        ...tc.extra_content,
      };
    }
    if (tc.function?.name) {
      toolCalls[index].function.name += tc.function.name;
    }
    if (tc.function?.arguments) {
      toolCalls[index].function.arguments += tc.function.arguments;
    }
  }

  private handleToolCallsDelta(delta: OpenAIStreamDelta, toolCalls: ToolCall[]): void {
    if (!delta.tool_calls) {
      return;
    }

    for (let i = 0; i < delta.tool_calls.length; i++) {
      const tc = delta.tool_calls[i];
      const index = this.getToolCallIndex(tc, toolCalls, delta.tool_calls.length, i);
      this.applyToolCallDelta(index, tc, toolCalls);
    }
  }

  private flushDeanonymizer(
    deanonymizer: IStreamingDeanonymizer | undefined,
    type: 'content' | 'reasoning'
  ): string {
    if (deanonymizer) {
      const remaining = deanonymizer.flush();
      if (remaining) {
        this.eventBus.emit(APP_EVENTS.AGENT_TOKEN, { token: remaining, type });
        return remaining;
      }
    }
    return "";
  }
}
