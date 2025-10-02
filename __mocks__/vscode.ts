// __mocks__/vscode.ts
export const window = {
  createOutputChannel: (_: string) => ({
    appendLine: (_: string) => { /* no-op */ },
  }),
  activeTextEditor: undefined,
  visibleTextEditors: [],
};

export const workspace = {
  textDocuments: [],
};

export type OutputChannel = {
  appendLine: (value: string) => void;
};
