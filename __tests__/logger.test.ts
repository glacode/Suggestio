import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { initLogger, log, __resetLogger } from '../src/logger.js';

describe('logger', () => {
  let mockOutputChannel: vscode.LogOutputChannel;
  let createOutputChannelSpy: jest.SpiedFunction<typeof vscode.window.createOutputChannel>;
  let consoleSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    const mockChannel: any = {
      appendLine: jest.fn(),
      append: jest.fn(),
      replace: jest.fn(),
      clear: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      name: 'Suggestio',
      logLevel: 1, // vscode.LogLevel.Info
      onDidChangeLogLevel: jest.fn(() => ({ dispose: () => { } })),
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockOutputChannel = mockChannel;
    createOutputChannelSpy = jest
      .spyOn(vscode.window, 'createOutputChannel')
      .mockReturnValue(mockOutputChannel);

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    __resetLogger(); // reset internal state before each test
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize logger only once', () => {
    initLogger();
    // Check the first argument of the first call directly to avoid overload issues with toHaveBeenCalledWith
    expect(createOutputChannelSpy.mock.calls[0][0]).toBe('Suggestio');
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Logger initialized');

    initLogger(); // second call shouldn't create a new channel
    expect(createOutputChannelSpy).toHaveBeenCalledTimes(1);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
  });

  it('should log messages to output channel and console if initialized', () => {
    initLogger();
    log('test message');

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringMatching(/\[.*\] test message/)
    );
    expect(consoleSpy).toHaveBeenCalledWith('[Suggestio] test message');
  });

  it('should log only to console if logger not initialized', () => {
    log('console only');

    expect(consoleSpy).toHaveBeenCalledWith('[Suggestio] console only');
    expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
  });
});
