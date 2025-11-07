import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

type FsModule = {
    existsSync: (path: fs.PathLike) => boolean;
    readFileSync: (path: fs.PathOrFileDescriptor, options: BufferEncoding) => string;
};

type VscodeModule = {
    workspace: {
        workspaceFolders?: readonly vscode.WorkspaceFolder[];
    };
    window: {
        showErrorMessage: (message: string) => void;
    };
};

function getConfigPath(context: vscode.ExtensionContext, fs: FsModule, vscodeModule: VscodeModule): string {
  const workspaceConfig = vscodeModule.workspace.workspaceFolders?.[0]
    ? path.join(vscodeModule.workspace.workspaceFolders[0].uri.fsPath, 'suggestio.config.json')
    : null;

  if (workspaceConfig && fs.existsSync(workspaceConfig)) { return workspaceConfig; }

  const globalConfig = path.join(context.globalStorageUri.fsPath, 'config.json');
  if (fs.existsSync(globalConfig)) { return globalConfig; }

  return path.join(context.extensionPath, 'config.json');
}

export async function readConfig(
    context: vscode.ExtensionContext,
    fsModule: FsModule = fs,
    vscodeModule: VscodeModule = vscode
): Promise<string> {
    const configPath = getConfigPath(context, fsModule, vscodeModule);
    try {
        return fsModule.readFileSync(configPath, 'utf8');
    } catch (err) {
        vscodeModule.window.showErrorMessage(`Failed to load config.json: ${err}`);
        return JSON.stringify({
            activeProvider: '',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        });
    }
}