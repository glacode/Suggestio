import { IChatMessage, IAnonymizer, IPrompt, ILlmProvider, IToolDefinition, IHttpClient, IHttpResponse, IReasoningProcessor, IOpenAIResponseParser, IOpenAIRequestFormatter, IOpenAIStreamHandler } from "../types.js";
import { StandardReasoningProcessor } from "./reasoningProcessor.js";
import { OpenAIResponseParser } from "./openAIResponseParser.js";
import { OpenAIRequestFormatter, OpenAIRequestBody } from "./openAIRequestFormatter.js";
import { OpenAIStreamHandler } from "./openAIStreamHandler.js";
import { IEventBus } from "../utils/eventBus.js";
import { LLM_MESSAGES, LLM_LOGS } from "../constants/messages.js";
import { createEventLogger } from "../log/eventLogger.js";
import { withRetry } from "../utils/retry.js";

/**
 * Arguments for the OpenAICompatibleProvider constructor.
 */
export interface IOpenAICompatibleProviderArgs {
  /** The HTTP client to use for requests. */
  httpClient: IHttpClient;
  /** The API endpoint URL for the OpenAI-compatible service. */
  endpoint: string;
  /** The API key for authentication. */
  apiKey: string;
  /** The model identifier to be used for completions. */
  model: string;
  /** The event bus to emit token events. */
  eventBus: IEventBus;
  /** Optional anonymizer to protect sensitive data in user messages. */
  anonymizer?: IAnonymizer;
  /** Maximum number of retries for API calls. */
  maxRetries: number;
  /** Initial delay for exponential backoff in ms. */
  initialDelay: number;
  /** Maximum tokens to request per completion. Defaults to 8192 when omitted. */
  maxTokens?: number;
  /** Optional reasoning processor to handle various model formats. */
  reasoningProcessor?: IReasoningProcessor;
  /** Optional response parser for validating API results. */
  parser?: IOpenAIResponseParser;
  /** Optional request formatter for constructing API payloads. */
  formatter?: IOpenAIRequestFormatter;
  /** Optional stream handler for processing SSE responses. */
  streamHandler?: IOpenAIStreamHandler;
}

export class OpenAICompatibleProvider implements ILlmProvider {
  private httpClient: IHttpClient;
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private eventBus: IEventBus;
  private anonymizer?: IAnonymizer;
  private maxRetries: number;
  private initialDelay: number;
  private maxTokens: number;
  private reasoningProcessor: IReasoningProcessor;
  private parser: IOpenAIResponseParser;
  private formatter: IOpenAIRequestFormatter;
  private streamHandler: IOpenAIStreamHandler;

  private logger: ReturnType<typeof createEventLogger>;

  /**
   * Creates an instance of OpenAICompatibleProvider.
   * 
   * @param args - The configuration arguments for the provider.
   */
  constructor({
    httpClient,
    endpoint,
    apiKey,
    model,
    eventBus,
    anonymizer,
    maxRetries,
    initialDelay,
    maxTokens,
    reasoningProcessor,
    parser,
    formatter,
    streamHandler,
  }: IOpenAICompatibleProviderArgs) {
    this.httpClient = httpClient;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.eventBus = eventBus;
    this.anonymizer = anonymizer;
    this.maxRetries = maxRetries;
    this.initialDelay = initialDelay;
    this.maxTokens = maxTokens ?? 8192;
    this.reasoningProcessor = reasoningProcessor || new StandardReasoningProcessor();
    this.parser = parser || new OpenAIResponseParser();
    this.formatter = formatter || new OpenAIRequestFormatter(this.reasoningProcessor, anonymizer);
    this.logger = createEventLogger(eventBus);
    this.streamHandler = streamHandler || new OpenAIStreamHandler(eventBus, this.reasoningProcessor, this.parser, this.logger, anonymizer);
  }

  /**
   * Constructs the request body for the completion API.
   * 
   * @param prompt - The prompt object that generates the chat history.
   * @param tools - Optional tool definitions for function calling.
   * @param stream - Whether the response should be streamed.
   * @returns A JSON-serializable object representing the request body.
   */
  private createRequestBody(
    prompt: IPrompt,
    tools: IToolDefinition[] | undefined,
    stream: boolean
  ): OpenAIRequestBody {
    return this.formatter.formatRequest(prompt, this.model, {
      maxTokens: this.maxTokens,
      stream,
      tools
    });
  }

  /**
   * Sends a POST request to the provider's endpoint using the injected httpClient.
   * 
   * @param body - The request body to be sent as JSON.
   * @param signal - Optional AbortSignal to cancel the request.
   * @returns A promise that resolves to the IHttpResponse object.
   */
  private async post(body: OpenAIRequestBody, signal?: AbortSignal): Promise<IHttpResponse> {
    return await this.httpClient.post(this.endpoint, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  /**
   * Sends a POST request to the provider's endpoint using the injected httpClient with retry logic.
   *
   * @param body - The request body to be sent as JSON.
   * @param signal - Optional AbortSignal to cancel the request.
   * @returns A promise that resolves to the IHttpResponse object.
   */
  private async performPostWithRetry(
    body: OpenAIRequestBody,
    signal?: AbortSignal
  ): Promise<IHttpResponse> {
    return await withRetry(
      async () => {
        const response = await this.post(body, signal);
        if (!response.ok) {
          const errText = await response.text();
          const error: any = new Error(LLM_MESSAGES.OPENAI_ERROR(response.status, errText));
          error.status = response.status;
          throw error;
        }
        return response;
      },
      {
        maxRetries: this.maxRetries,
        initialDelay: this.initialDelay,
        signal,
        shouldRetry: (error: any) => {
          if (signal?.aborted || error.name === 'AbortError') {
            return false;
          }
          const status = error.status;
          if (status) {
            // Retry on rate limits (429) and server errors (5xx)
            return status === 429 || (status >= 500 && status <= 599);
          }
          // Network errors (like ECONNRESET) typically don't have a status and should be retried
          return true;
        },
        onRetry: (attempt, total, delay, error) => {
          this.logger.warn(`API call failed (attempt ${attempt}/${total}): ${error.message}. Retrying in ${delay}ms...`);
          this.eventBus.emit('agent:notification', {
            text: `${error}\n\nRetrying (attempt ${attempt} of ${total}) in ${delay / 1000}s...`
          });
        }
      }
    ).finally(() => {
      // Clear the notification when we either succeed or give up
      this.eventBus.emit('agent:notification', { text: null });
    });
  }

  /**
   * Performs a non-streaming completion request.
   * 
   * @param prompt - The prompt to be sent.
   * @param tools - Optional tools available for the model to use.
   * @param signal - Optional AbortSignal to cancel the request.
   * @returns A promise resolving to the assistant's message, or null if no choice was returned.
   */
  async query(
    prompt: IPrompt,
    tools?: IToolDefinition[],
    signal?: AbortSignal
  ): Promise<IChatMessage | null> {
    const body = this.createRequestBody(prompt, tools, false);
    const response = await this.performPostWithRetry(body, signal);

    let rawJson: any;
    try {
      rawJson = await response.json();
    } catch (e) {
      throw new Error(LLM_MESSAGES.PARSE_JSON_FAILED(response.status, response.statusText));
    }

    const message = this.parser.parseResponse(rawJson);
    if (!message) {
      return null;
    }

    const processed = this.reasoningProcessor.process(message);
    let content = processed.content || "";
    let reasoning = processed.reasoning || "";

    if (this.anonymizer) {
      if (content) {
        content = this.anonymizer.deanonymize(content);
      }
      if (reasoning) {
        reasoning = this.anonymizer.deanonymize(reasoning);
      }
    }

    return {
      role: "assistant",
      content,
      reasoning: reasoning || undefined,
      tool_calls: message.tool_calls ?? undefined,
    };
  }

  /**
   * Performs a streaming completion request.
   * 
   * @param prompt - The prompt to be sent.
   * @param tools - Optional tools available for the model to use.
   * @returns A promise resolving to an array of consolidated assistant's messages.
   */
  async queryStream(
    prompt: IPrompt,
    tools?: IToolDefinition[],
    signal?: AbortSignal
  ): Promise<IChatMessage[]> {
    const body = this.createRequestBody(prompt, tools, true);
    this.logger.debug(`OpenAI Request Body: ${JSON.stringify(body, null, 2)}`);

    const response = await this.performPostWithRetry(body, signal);

    this.logger.info(LLM_LOGS.RECEIVING_STREAM);
    const results = await this.streamHandler.handleStream(response);
    this.logger.debug(`Number of discrete messages: ${results.length}`);
    return results;
  }
}
