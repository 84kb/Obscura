import { CommentProvider, AppSettings, MediaFile, PlayerOverlayContext, ObscuraAPI } from '@obscura/core';

export function initializePluginSystem() {
    if (window.ObscuraAPI) {
        console.warn('[PluginSystem] ObscuraAPI is already initialized.');
        return;
    }

    const commentProviders: CommentProvider[] = [];
    const playerOverlays: Map<string, (canvas: HTMLCanvasElement, media: MediaFile, context: PlayerOverlayContext) => void> = new Map();

    const obscuraAPI: ObscuraAPI = {
        registerCommentProvider: (provider: CommentProvider) => {
            if (commentProviders.find(p => p.id === provider.id)) {
                console.warn(`[PluginSystem] Provider ${provider.id} is already registered.`);
                return;
            }
            commentProviders.push(provider);
            console.log(`[PluginSystem] Registered comment provider: ${provider.name} (${provider.id})`);
            // React コンポーネント等にプラグインが追加されたことを通知する
            window.dispatchEvent(new Event('plugin-registered'));
        },

        getCommentProviders: () => {
            return [...commentProviders];
        },

        // APIとしての登録解除も公開(必要であれば)
        unregisterCommentProvider: (pluginId: string) => {
            const index = commentProviders.findIndex(p => p.id === pluginId);
            if (index >= 0) {
                commentProviders.splice(index, 1);
                console.log(`[PluginSystem] Unregistered CommentProvider: ${pluginId}`);
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
            saveCommentFile: async (mediaFilePath: string, data: any) => {
                return await window.electronAPI.saveCommentFile(mediaFilePath, data);
            },
            loadCommentFile: async (mediaFilePath: string) => {
                return await window.electronAPI.loadCommentFile(mediaFilePath);
            }
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
                        if (window.ObscuraAPI && window.ObscuraAPI.unregisterCommentProvider) {
                            window.ObscuraAPI.unregisterCommentProvider(pluginId);
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
