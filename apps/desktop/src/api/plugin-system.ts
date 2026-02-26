import { ObscuraPlugin, AppSettings, MediaFile, PlayerOverlayContext, ObscuraAPI } from '@obscura/core';

export function initializePluginSystem() {
    if (window.ObscuraAPI) {
        console.warn('[PluginSystem] ObscuraAPI is already initialized.');
        return;
    }

    const plugins: ObscuraPlugin[] = [];
    const playerOverlays: Map<string, (canvas: HTMLCanvasElement, media: MediaFile, context: PlayerOverlayContext) => void> = new Map();

    const obscuraAPI: ObscuraAPI = {
        registerPlugin: (plugin: ObscuraPlugin) => {
            if (plugins.find(p => p.id === plugin.id)) {
                console.warn(`[PluginSystem] Plugin ${plugin.id} is already registered.`);
                return;
            }
            // 互換性のためのブリッジ処理
            const p = plugin as any;
            // 1. fetchData <-> fetchComments の相互埋め (古い命名のプラグインをサポート)
            if (p.fetchData && !p.fetchComments) p.fetchComments = p.fetchData;
            if (p.fetchComments && !p.fetchData) p.fetchData = p.fetchComments;

            // 2. uiHooks のブリッジ
            if (p.uiHooks) {
                if (p.uiHooks.inspectorActions && !p.uiHooks.inspectorComments) {
                    p.uiHooks.inspectorComments = p.uiHooks.inspectorActions;
                }
                if (p.uiHooks.inspectorComments && !p.uiHooks.inspectorActions) {
                    p.uiHooks.inspectorActions = p.uiHooks.inspectorComments;
                }
            }

            plugins.push(plugin);
            console.log(`[PluginSystem] Registered plugin: ${plugin.name} (${plugin.id})`);
            // React コンポーネント等にプラグインが追加されたことを通知する
            window.dispatchEvent(new Event('plugin-registered'));
        },

        getPlugins: () => {
            return [...plugins];
        },

        // APIとしての登録解除も公開(必要であれば)
        unregisterPlugin: (pluginId: string) => {
            const index = plugins.findIndex(p => p.id === pluginId);
            if (index >= 0) {
                plugins.splice(index, 1);
                console.log(`[PluginSystem] Unregistered Plugin: ${pluginId}`);
                window.dispatchEvent(new Event('plugin-registered'));
            }
        },

        registerPlayerOverlay: (id: string, callback: (canvas: HTMLCanvasElement, media: MediaFile, context: PlayerOverlayContext) => void) => {
            playerOverlays.set(id, callback);
            console.log(`[PluginSystem] Registered player overlay: ${id}`);
        },

        unregisterPlayerOverlay: (id: string) => {
            playerOverlays.delete(id);
            console.log(`[PluginSystem] Unregistered player overlay: ${id}`);
        },

        media: {
            get: async (id: number) => {
                return await window.electronAPI.getMediaFile(id);
            },
            getSelected: async () => {
                const selected = await window.electronAPI.getSelectedMedia();
                return selected[0] || null;
            },
            getSelection: async () => {
                return await window.electronAPI.getSelectedMedia();
            },
            update: async (id: number, updates: Partial<MediaFile>) => {
                return await window.electronAPI.updateMedia(id, updates);
            },
            addTag: async (mediaId: number, tagId: number) => {
                return await window.electronAPI.addTagToMedia(mediaId, tagId);
            },
            removeTag: async (mediaId: number, tagId: number) => {
                return await window.electronAPI.removeTagFromMedia(mediaId, tagId);
            },
            import: async (filePaths: string[]) => {
                return await window.electronAPI.importMedia(filePaths);
            }
        },

        ui: {
            showNotification: (options: any) => {
                window.electronAPI.showNotification({
                    title: options.title,
                    message: options.description || options.message || ''
                });
            },
            showMessageBox: async (options: any) => {
                return await window.electronAPI.showMessageBox(options);
            },
            copyToClipboard: async (text: string) => {
                await window.electronAPI.copyToClipboard(text);
            }
        },

        system: {
            fetch: async (url: string, options?: any) => {
                return await window.electronAPI.pluginFetch(url, options);
            },
            saveMediaData: async (mediaId: number, pluginId: string, data: any) => {
                return await window.electronAPI.savePluginMediaData(mediaId, pluginId, data);
            },
            loadMediaData: async (mediaId: number, pluginId: string) => {
                return await window.electronAPI.loadPluginMediaData(mediaId, pluginId);
            },
            saveAssociatedData: async (mediaFilePath: string, data: any) => {
                return await window.electronAPI.saveAssociatedData(mediaFilePath, data);
            },
            loadAssociatedData: async (mediaFilePath: string) => {
                return await window.electronAPI.loadAssociatedData(mediaFilePath);
            },
            openPath: async (path: string) => {
                await window.electronAPI.openPath(path);
            },
            openExternal: async (url: string) => {
                await window.electronAPI.openExternal(url);
            },
            storage: {
                get: async (_key: string) => null, // TODO
                set: async (_key: string, _value: any) => { } // TODO
            }
        },

        on: (event: any, callback: (...args: any[]) => void) => {
            const wrappedCallback = (_e: any, ...args: any[]) => callback(...args);
            return window.electronAPI.on(event, wrappedCallback);
        }
    };

    window.ObscuraAPI = obscuraAPI;
    // @ts-ignore: Playerで使用するために内部的に露出させる
    window.__obscura_player_overlays = playerOverlays;


    console.log('[PluginSystem] window.ObscuraAPI initialized.');
}

/**
 * 起動時にプラグインフォルダにあるスクリプトを読み込み実行する
 */
// 既に読み込み済みのプラグインスクリプトID
const loadedScripts = new Set<string>();

export async function loadPluginScripts(config?: AppSettings) {
    try {
        const scripts = await window.electronAPI.getPluginScripts();
        if (!scripts || scripts.length === 0) return;

        for (const script of scripts) {
            const pluginId = script.id; // API側で用意したIDを使用
            const scriptId = `plugin-script-${pluginId}`;

            // configが渡されている場合、有効化状況を確認する
            if (config && config.extensions) {
                // Configに該当プラグインが存在するか確認
                const extConfig = config.extensions[pluginId];

                // 設定がない（デフォルト）もしくは enabled: false の場合はスキップ・アンロード
                if (!extConfig || !extConfig.enabled) {
                    if (loadedScripts.has(scriptId)) {
                        loadedScripts.delete(scriptId);
                        if (window.ObscuraAPI && window.ObscuraAPI.unregisterPlugin) {
                            window.ObscuraAPI.unregisterPlugin(pluginId);
                        }
                        const existingScript = document.getElementById(scriptId);
                        if (existingScript) existingScript.remove();
                    }
                    continue; // 無効なプラグインは読み込まない
                }
            }

            if (loadedScripts.has(scriptId)) {
                // 既に読み込み済みの場合はスキップ
                continue;
            }

            try {
                // スクリプトタグを生成してDOMに注入し、即座に評価させる
                const scriptEl = document.createElement('script');
                scriptEl.type = 'text/javascript';
                scriptEl.text = script.code;
                scriptEl.id = scriptId;
                document.body.appendChild(scriptEl);
                loadedScripts.add(scriptId);
                console.log(`[PluginSystem] Loaded plugin: ${script.name}`);
            } catch (err) {
                console.error(`[PluginSystem] Failed to execute plugin: ${script.name}`, err);
            }
        }
    } catch (err) {
        console.error('[PluginSystem] Failed to load plugin scripts', err);
    }
}
