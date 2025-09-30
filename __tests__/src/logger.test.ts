// __tests__/logger.test.ts
import { jest } from '@jest/globals';
import { window } from 'vscode';
import { initLogger, log, __resetLogger } from '../../src/logger.js';

describe('logger', () => {
  let mockOutputChannel: { appendLine: jest.Mock };
  let createOutputChannelSpy: any;
  let consoleSpy: any;

  beforeEach(() => {
    mockOutputChannel = { appendLine: jest.fn() };
    createOutputChannelSpy = jest
      .spyOn(window, 'createOutputChannel')
      .mockReturnValue(mockOutputChannel as any);

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    __resetLogger(); // reset internal state before each test
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize logger only once', () => {
    initLogger();
    expect(createOutputChannelSpy).toHaveBeenCalledWith('Suggestio');
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
