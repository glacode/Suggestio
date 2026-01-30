import { describe, beforeEach, test, expect } from '@jest/globals';
import { IgnoreManager } from '../../src/chat/ignoreManager.js';
import { IWorkspaceProvider, IFileContentReader, IPathResolver } from '../../src/types.js';
import { createMockPathResolver } from '../testUtils.js';
import * as path from 'path';

describe('IgnoreManager', () => {
  let ignoreManager: IgnoreManager;
  let rootPathValue: string | undefined;
  let fileContents: { [path: string]: string };

  const workspaceRoot = '/project/folder1';

  let mockWorkspaceProvider: IWorkspaceProvider;
  let mockFileContentProvider: IFileContentReader;
  let mockPathResolver: IPathResolver;

  beforeEach(() => {
    rootPathValue = workspaceRoot;
    fileContents = {};
    
    mockWorkspaceProvider = {
      rootPath: () => rootPathValue,
    };
    mockFileContentProvider = {
      read: (p: string) => fileContents[p],
    };
    mockPathResolver = createMockPathResolver();
  });
  
  const createManager = () => new IgnoreManager(mockWorkspaceProvider, mockFileContentProvider, mockPathResolver);

  const setupIgnoreFile = (fileName: string, content: string) => {
    const filePath = path.join(workspaceRoot, fileName);
    fileContents[filePath] = content;
  };

  test('should not ignore files when no workspace is open', async () => {
    rootPathValue = undefined;
    ignoreManager = createManager();
    const filePath = path.join(workspaceRoot, 'some-file.ts');
    expect(await ignoreManager.shouldIgnore(filePath)).toBe(false);
  });

  test('should not ignore files when no ignore files exist', async () => {
    ignoreManager = createManager();
    const filePath = path.join(workspaceRoot, 'some-file.ts');
    expect(await ignoreManager.shouldIgnore(filePath)).toBe(false);
  });

  test('should ignore files listed in .gitignore', async () => {
    setupIgnoreFile('.gitignore', `\
node_modules
*.log
skip
avoid*
dist/`);
    ignoreManager = createManager();

    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'node_modules/express/index.js'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'debug.log'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'skip.ts'))).resolves.toBe(false);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'avoid.ts'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'dist/bundle.js'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/index.ts'))).resolves.toBe(false);
  });

  test('should ignore files listed in .vscodeignore', async () => {
    setupIgnoreFile('.vscodeignore', '*.test.ts\ncoverage/');
    ignoreManager = createManager();

    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/app.test.ts'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'coverage/report.html'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/app.ts'))).resolves.toBe(false);
  });
  
  test('should ignore files from both .gitignore and .vscodeignore', async () => {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const vscodeignorePath = path.join(workspaceRoot, '.vscodeignore');
    
    fileContents[gitignorePath] = '*.log';
    fileContents[vscodeignorePath] = '*.tmp';
    
    ignoreManager = createManager();
    
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'debug.log'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'temp.tmp'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'main.ts'))).resolves.toBe(false);
  });

  test('should handle comments and empty lines in ignore files', async () => {
    const ignoreContent = `
      # This is a comment
      *.log

      # Another comment
      dist/
    `;
    setupIgnoreFile('.gitignore', ignoreContent);
    ignoreManager = createManager();

    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'test.log'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'dist/app.js'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/main.js'))).resolves.toBe(false);
  });

  test('should ignore .env file by default', async () => {
    ignoreManager = createManager();
    
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, '.env'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/subdir/.env'))).resolves.toBe(true);
    await expect(ignoreManager.shouldIgnore(path.join(workspaceRoot, 'src/app.py'))).resolves.toBe(false);
  });
});