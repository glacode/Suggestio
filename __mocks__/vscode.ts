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

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export class InlineCompletionItem {
  constructor(public insertText: string, public range?: Range, public command?: any) {}
}

export class InlineCompletionList {
  constructor(public items: InlineCompletionItem[]) {}
}

export const CancellationToken = {
    None: {},
    isCancellationRequested: false,
    onCancellationRequested: (_: any) => ({ dispose: () => { } })
};
