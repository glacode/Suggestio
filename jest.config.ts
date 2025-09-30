import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  
  // ESM configuration
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // Corrected: moduleNameMapper (not moduleNameMapping)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    '^vscode$': '<rootDir>/__mocks__/vscode.ts',
  },

  testPathIgnorePatterns: [
    '/out/',
    '/dist/',
    '/node_modules/'
  ],

  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        diagnostics: {
          warnOnly: process.env.NODE_ENV === 'development',
        },
      },
    ],
  },
  
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Module path configuration
  modulePaths: ['<rootDir>/src'],
  moduleDirectories: ['node_modules', 'src'],
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  resetModules: true,
  
  // Setup files (optional - create jest.setup.ts if needed)
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
  // Verbose output
  verbose: true,
  
  // Force exit to prevent hanging
  forceExit: true,
  
  // Test timeout
  testTimeout: 10000,
};

export default jestConfig;