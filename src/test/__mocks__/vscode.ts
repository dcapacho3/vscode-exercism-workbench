// The parts of the vscode API that modules under test touch. Settings always return their defaults.
export const workspace = {
  getConfiguration: () => ({ get: <T>(_key: string, fallback?: T) => fallback }),
};

export class RelativePattern {
  constructor(readonly base: string, readonly pattern: string) {}
}

export class TreeItem {
  constructor(readonly label: string, readonly collapsibleState?: number) {}
}
