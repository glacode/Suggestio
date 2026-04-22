import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { withRetry } from "../../src/utils/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return result if operation succeeds immediately", async () => {
    const operation = jest.fn<() => Promise<string>>().mockResolvedValue("success");
    const result = await withRetry(operation, { maxRetries: 3, initialDelay: 100 });
    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry and succeed", async () => {
    const operation = jest.fn<() => Promise<string>>()
      .mockImplementationOnce(async () => { throw new Error("fail"); })
      .mockResolvedValueOnce("success");

    const promise = withRetry(operation, {
      maxRetries: 3,
      initialDelay: 100,
    });

    // Fast-forward through the first delay
    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("should respect exponential backoff", async () => {
    const operation = jest.fn<() => Promise<string>>()
      .mockImplementationOnce(async () => { throw new Error("fail 1"); })
      .mockImplementationOnce(async () => { throw new Error("fail 2"); })
      .mockResolvedValueOnce("success");

    const onRetry = jest.fn<(attempt: number, total: number, nextDelay: number, error: Error) => void>();
    const promise = withRetry(operation, {
      maxRetries: 3,
      initialDelay: 100,
      onRetry,
    });

    // First failure, delay 100ms
    await jest.advanceTimersByTimeAsync(100);
    expect(onRetry).toHaveBeenCalledWith(1, 3, 100, expect.any(Error));

    // Second failure, delay 200ms
    await jest.advanceTimersByTimeAsync(200);
    expect(onRetry).toHaveBeenCalledWith(2, 3, 200, expect.any(Error));

    const result = await promise;
    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should throw after max retries", async () => {
    jest.useRealTimers(); // ESM + FakeTimers + Async/Await is sometimes problematic for rejected promises
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      throw new Error("persistent fail");
    });
    
    const promise = withRetry(operation, {
      maxRetries: 2,
      initialDelay: 1,
    });

    await expect(promise).rejects.toThrow("persistent fail");
    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it("should not retry if shouldRetry returns false", async () => {
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      throw new Error("fatal error");
    });
    const shouldRetry = jest.fn<(error: any) => boolean>().mockReturnValue(false);

    const promise = withRetry(operation, {
      maxRetries: 3,
      initialDelay: 100,
      shouldRetry,
    });

    await expect(promise).rejects.toThrow("fatal error");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalled();
  });

  it("should abort immediately if signal is aborted before starting", async () => {
    const operation = jest.fn<() => Promise<string>>();
    const controller = new AbortController();
    controller.abort();

    const promise = withRetry(operation, {
      maxRetries: 3,
      initialDelay: 100,
      signal: controller.signal,
    });

    await expect(promise).rejects.toThrow("This operation was aborted");
    expect(operation).not.toHaveBeenCalled();
  });

  it("should abort during delay if signal is aborted", async () => {
    jest.useRealTimers();
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      throw new Error("fail");
    });
    const controller = new AbortController();

    const promise = withRetry(operation, {
      maxRetries: 3,
      initialDelay: 1000,
      signal: controller.signal,
    });

    // Wait for first failure and for the delay to start
    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    // Abort during the delay
    controller.abort();

    let error: any;
    try {
      await promise;
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain("aborted");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
