import fetch, { Response } from "node-fetch";
import { IHttpClient, IHttpResponse } from "../types.js";

/**
 * Implementation of IHttpResponse that wraps a node-fetch Response.
 */
class NodeFetchResponse implements IHttpResponse {
  constructor(private response: Response) {}

  get ok(): boolean {
    return this.response.ok;
  }

  get status(): number {
    return this.response.status;
  }

  get statusText(): string {
    return this.response.statusText;
  }

  get body(): AsyncIterable<any> | null {
    // node-fetch response.body is a Readable stream, which is an AsyncIterable.
    return this.response.body;
  }

  async json(): Promise<any> {
    return await this.response.json();
  }

  async text(): Promise<string> {
    return await this.response.text();
  }
}

/**
 * Implementation of IHttpClient that uses node-fetch.
 */
export class NodeFetchClient implements IHttpClient {
  async post(
    url: string,
    options: {
      headers: Record<string, string>;
      body: string;
      signal?: AbortSignal;
    }
  ): Promise<IHttpResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: options.headers,
      body: options.body,
      signal: options.signal, // node-fetch uses its own AbortSignal type
    });

    return new NodeFetchResponse(response);
  }
}
