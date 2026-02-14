// logger.ts
import * as vscode from 'vscode';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevelString = typeof LOG_LEVELS[number];

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

const LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  silent: LogLevel.Silent,
};

export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  setLogLevel(level: LogLevel): void;
}

export class Logger implements ILogger {
  private outputChannel: vscode.OutputChannel | undefined;
  private level: LogLevel = LogLevel.Info;

  constructor(level: LogLevel = LogLevel.Info) {
    this.level = level;
  }

  public setLogLevel(level: LogLevel) {
    this.level = level;
  }

  public init(channelName: string = "Suggestio") {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel(channelName);
      this.info("Logger initialized");
    }
  }

  public debug(message: string) {
    this.write(LogLevel.Debug, message);
  }

  public info(message: string) {
    this.write(LogLevel.Info, message);
  }

  public warn(message: string) {
    this.write(LogLevel.Warn, message);
  }

  public error(message: string) {
    this.write(LogLevel.Error, message);
  }

  private write(level: LogLevel, message: string) {
    if (level < this.level) {
      return;
    }

    const levelTag = LogLevel[level].toUpperCase();
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${levelTag}] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    }
    
    // In tests or dev, console.log is still useful if level permits
    console.log(`[Suggestio] [${levelTag}] ${message}`);
  }

  // 👇 Only used in tests to clear the state
  public __reset() {
    this.outputChannel = undefined;
    this.level = LogLevel.Info;
  }
}

export const defaultLogger = new Logger();

export function initLogger() {
  defaultLogger.init();
}

export function setLogLevel(level: LogLevel) {
  defaultLogger.setLogLevel(level);
}

export function parseLogLevel(level: string | undefined): LogLevel {
  return LEVEL_MAP[level?.toLowerCase() || ''] ?? LogLevel.Info;
}

// 👇 Only used in tests to clear the singleton
export function __resetLogger() {
  defaultLogger.__reset();
}
