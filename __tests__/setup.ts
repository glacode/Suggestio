import { setLogLevel, LogLevel } from '../src/logger.js';

// Silence logs by default in tests
setLogLevel(LogLevel.Silent);
