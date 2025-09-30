// __mocks__/vscode.ts
export const window = {
  createOutputChannel: (_: string) => ({
    appendLine: (_: string) => { /* no-op */ },
  }),
};

export type OutputChannel = {
  appendLine: (value: string) => void;
};
