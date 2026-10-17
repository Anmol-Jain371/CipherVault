import { vi } from 'vitest';

export class MockEventEmitter<T> {
  private listeners: ((e: T) => any)[] = [];

  public event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };

  public fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export const mockVscode = {
  EventEmitter: MockEventEmitter,
  Disposable: class {
    constructor(public call: () => void) {}
    dispose() {
      this.call();
    }
  },
  Uri: {
    parse: (str: string) => {
      const parts = str.split(':');
      return { scheme: parts[0], path: parts.slice(1).join(':'), toString: () => str };
    },
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  FilePermission: {
    Readonly: 1,
  },
  FileChangeType: {
    Changed: 1,
    Created: 2,
    Deleted: 3,
  },
  FileSystemError: {
    FileNotFound: (uri?: any) => new Error(`FileNotFound: ${uri?.path}`),
    FileExists: (uri?: any) => new Error(`FileExists: ${uri?.path}`),
    NoPermissions: (msg?: string) => new Error(`NoPermissions: ${msg}`),
    Unavailable: (uri?: any) => new Error(`Unavailable: ${uri?.path}`),
  },
  env: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
    showSaveDialog: vi.fn(),
    createStatusBarItem: vi.fn().mockReturnValue({
      show: vi.fn(),
      dispose: vi.fn(),
    }),
  },
  workspace: {
    registerFileSystemProvider: vi.fn(),
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
    onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  TreeItem: class {
    constructor(public label: string, public collapsibleState: any) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
};

vi.mock('vscode', () => mockVscode);
