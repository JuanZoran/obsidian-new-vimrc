import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { VimrcSettings, DEFAULT_SETTINGS } from '../types';

/**
 * Manages plugin settings
 */
export class SettingsManager {
    private plugin: any; // Will be VimrcPlugin

    constructor(plugin: any) {
        this.plugin = plugin;
    }

    /**
     * Load settings from disk
     */
    async loadSettings(): Promise<VimrcSettings> {
        const data = await this.plugin.loadData();
        return Object.assign({}, DEFAULT_SETTINGS, data);
    }

    /**
     * Save settings to disk
     */
    async saveSettings(settings: VimrcSettings): Promise<void> {
        await this.plugin.saveData(settings);
    }

    /**
     * Create settings tab
     */
    createSettingTab(plugin: any): PluginSettingTab {
        return new VimrcSettingTab(plugin.app, plugin);
    }
}

/**
 * Settings tab for the plugin
 */
export class VimrcSettingTab extends PluginSettingTab {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Vimrc 插件设置' });

        // Vimrc file path
        new Setting(containerEl)
            .setName('Vimrc 文件路径')
            .setDesc('相对于 vault 根目录的路径（默认：.obsidian.vimrc）')
            .addText(text => text
                .setPlaceholder('.obsidian.vimrc')
                .setValue(this.plugin.settings.vimrcPath)
                .onChange(async (value) => {
                    this.plugin.settings.vimrcPath = value;
                    await this.plugin.saveSettings();
                }));

        // Show load notification
        new Setting(containerEl)
            .setName('显示加载通知')
            .setDesc('加载 vimrc 配置时显示通知消息')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showLoadNotification)
                .onChange(async (value) => {
                    this.plugin.settings.showLoadNotification = value;
                    await this.plugin.saveSettings();
                }));

        // Debug mode
        new Setting(containerEl)
            .setName('调试模式')
            .setDesc('在控制台输出详细的调试信息')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));

        // Reload button
        new Setting(containerEl)
            .setName('重新加载 vimrc')
            .setDesc('立即重新加载配置文件')
            .addButton(button => button
                .setButtonText('重新加载')
                .onClick(async () => {
                    await this.plugin.reloadVimrc();
                    new Notice('Vimrc 已重新加载');
                }));
    }
}
