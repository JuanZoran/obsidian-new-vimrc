/**
 * Mock Obsidian API for testing
 */

export class Plugin {
    app: App;
    manifest: any;

    constructor(app: App, manifest: any) {
        this.app = app;
        this.manifest = manifest;
    }

    async loadData(): Promise<any> {
        return {};
    }

    async saveData(data: any): Promise<void> {
        // Mock implementation
    }

    registerEvent(event: any): void {
        // Mock implementation
    }

    addCommand(command: any): void {
        // Mock implementation
    }
}

export class App {
    vault: Vault;
    commands: Commands;

    constructor() {
        this.vault = new Vault();
        this.commands = new Commands();
    }
}

export class Vault {
    adapter: any;

    constructor() {
        this.adapter = {
            exists: async (path: string) => false,
            read: async (path: string) => '',
        };
    }

    on(event: string, callback: Function): any {
        return {};
    }

    async read(file: any): Promise<string> {
        return '';
    }
}

export class Commands {
    commands: Record<string, any> = {};

    executeCommandById(id: string): void {
        // Mock implementation
    }
}

export class PluginSettingTab {
    app: App;
    plugin: any;
    containerEl: HTMLElement;

    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = document.createElement('div');
    }

    display(): void {
        // Mock implementation
    }

    hide(): void {
        // Mock implementation
    }
}

export class Setting {
    constructor(containerEl: HTMLElement) {
        // Mock implementation
    }

    setName(name: string): this {
        return this;
    }

    setDesc(desc: string): this {
        return this;
    }

    addText(callback: (text: any) => void): this {
        callback({
            setPlaceholder: () => ({ setValue: () => ({ onChange: () => {} }) }),
        });
        return this;
    }

    addToggle(callback: (toggle: any) => void): this {
        callback({
            setValue: () => ({ onChange: () => {} }),
        });
        return this;
    }

    addButton(callback: (button: any) => void): this {
        callback({
            setButtonText: () => ({ onClick: () => {} }),
        });
        return this;
    }
}

export class Notice {
    constructor(message: string, timeout?: number) {
        // Mock implementation
    }
}

export interface TAbstractFile {
    path: string;
    name: string;
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}
