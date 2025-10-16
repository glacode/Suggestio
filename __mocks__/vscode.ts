// __mocks__/vscode.ts
export const window = {
  createOutputChannel: (_: string) => ({
    appendLine: (_: string) => { /* no-op */ },
  }),
  showInformationMessage: (_: string) => { /* no-op */ },
  onDidChangeActiveTextEditor: (_listener: (e: any) => any) => {
    // For tests, you might want to manually trigger the listener
    // For now, just returning a disposable no-op
    return {
      dispose: () => { /* no-op */ },
    };
  },
  activeTextEditor: undefined,
  visibleTextEditors: [],
};

export const workspace = {
  textDocuments: [],
};

export type OutputChannel = {
  appendLine: (value: string) => void;
};
