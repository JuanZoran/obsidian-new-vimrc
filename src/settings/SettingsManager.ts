import { App, Notice, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { VimrcSettings, DEFAULT_SETTINGS } from '../types';
import type { IConfigManager } from '../types/settings';

/**
 * Manages plugin settings
 */
export class SettingsManager {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
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
    createSettingTab(plugin: Plugin): PluginSettingTab {
        return new VimrcSettingTab(plugin.app, plugin);
    }
}

/**
 * Settings tab for the plugin
 * 
 * Supports both legacy plugin interface and new ConfigManager interface.
 */
export class VimrcSettingTab extends PluginSettingTab {
    plugin: Plugin;
    private configManager?: IConfigManager;

    constructor(app: App, plugin: Plugin, configManager?: IConfigManager) {
        super(app, plugin);
        this.plugin = plugin;
        this.configManager = configManager;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Vimrc 插件设置' });

        const settings = this.getSettings();

        // Vimrc file path
        new Setting(containerEl)
            .setName('Vimrc 文件路径')
            .setDesc('相对于 vault 根目录的路径（默认：.obsidian.vimrc）')
            .addText(text => text
                .setPlaceholder('.obsidian.vimrc')
                .setValue(settings.vimrcPath)
                .onChange(async (value) => {
                    await this.updateSetting('vimrcPath', value);
                }));

        // Show load notification
        new Setting(containerEl)
            .setName('显示加载通知')
            .setDesc('加载 vimrc 配置时显示通知消息')
            .addToggle(toggle => toggle
                .setValue(settings.showLoadNotification)
                .onChange(async (value) => {
                    await this.updateSetting('showLoadNotification', value);
                }));

        // Debug mode
        new Setting(containerEl)
            .setName('调试模式')
            .setDesc('在控制台输出详细的调试信息')
            .addToggle(toggle => toggle
                .setValue(settings.debugMode)
                .onChange(async (value) => {
                    await this.updateSetting('debugMode', value);
                }));

        // Reload button
        new Setting(containerEl)
            .setName('重新加载 vimrc')
            .setDesc('立即重新加载配置文件')
            .addButton(button => button
                .setButtonText('重新加载')
                .onClick(async () => {
                    // Trigger reload through plugin if available
                    if ('reloadVimrc' in this.plugin) {
                        await (this.plugin as { reloadVimrc: () => Promise<void> }).reloadVimrc();
                    }
                    new Notice('Vimrc 已重新加载');
                }));
    }

    /**
     * Get current settings from ConfigManager or legacy plugin
     */
    private getSettings(): VimrcSettings {
        if (this.configManager) {
            return this.configManager.getSettings();
        }
        // Legacy fallback
        const legacyPlugin = this.plugin as unknown as { settings?: VimrcSettings };
        return legacyPlugin.settings || DEFAULT_SETTINGS;
    }

    /**
     * Update a setting value
     */
    private async updateSetting<K extends keyof VimrcSettings>(
        key: K,
        value: VimrcSettings[K]
    ): Promise<void> {
        if (this.configManager) {
            await this.configManager.updateSettings({ [key]: value });
        } else {
            // Legacy fallback
            const legacyPlugin = this.plugin as unknown as {
                settings: VimrcSettings;
                saveSettings: () => Promise<void>;
            };
            legacyPlugin.settings[key] = value;
            await legacyPlugin.saveSettings();
        }
    }
}
