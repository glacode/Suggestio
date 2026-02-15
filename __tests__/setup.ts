import { setLogLevel, LogLevel } from '../src/log/logger.js';

// Silence logs by default in tests
setLogLevel(LogLevel.Silent);
