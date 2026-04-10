import { ObscuraPlugin, AppSettings, MediaFile, PlayerOverlayContext, ObscuraAPI } from '@obscura/core';
import { api } from './index';

const ENABLE_PLUGIN_SCRIPT_FETCH = true;
const ENABLE_PLUGIN_SCRIPT_EXECUTION = true;
const ENABLED_PLUGIN_SCRIPT_IDS = new Set<string>();
const STARTUP_DEFERRED_PLUGIN_SCRIPT_IDS = new Set<string>(['niconico']);

const getAssociatedDataCache = (): Map<string, any> => {
    return ((window as any).__obscura_associated_data_cache ||= new Map<string, any>()) as Map<string, any>;
};

const loadAssociatedDataCached = async (mediaFilePath: string) => {
    const cache = getAssociatedDataCache();
    if (cache.has(mediaFilePath)) {
        return await cache.get(mediaFilePath);
    }

    const loadPromise = api.loadAssociatedData(mediaFilePath).then((data) => {
        cache.set(mediaFilePath, data);
        return data;
    }).catch((error) => {
        cache.delete(mediaFilePath);
        throw error;
    });
    cache.set(mediaFilePath, loadPromise);
    return await loadPromise;
};

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
                if (p.uiHooks.inspectorInfo && !p.uiHooks.inspectorInfoRows) {
                    p.uiHooks.inspectorInfoRows = p.uiHooks.inspectorInfo;
                }
            }

            if (!p.hooks || typeof p.hooks !== 'object') {
                p.hooks = {};
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

        registerCommentProvider: (plugin: ObscuraPlugin) => {
            obscuraAPI.registerPlugin(plugin);
        },

        unregisterCommentProvider: (pluginId: string) => {
            obscuraAPI.unregisterPlugin?.(pluginId);
        },

        media: {
            get: async (id: number) => {
                return await api.getMediaFile(id);
            },
            list: async (page?: number, limit?: number, filters?: any) => {
                return await api.getMediaFiles(page, limit, filters);
            },
            getSelected: async () => {
                const selected = await api.getSelectedMedia();
                return selected[0] || null;
            },
            getSelection: async () => {
                return await api.getSelectedMedia();
            },
            update: async (id: number, updates: Partial<MediaFile>) => {
                return await api.updateMedia(id, updates);
            },
            rename: async (id: number, newName: string) => {
                return await api.renameMedia(id, newName);
            },
            addTag: async (mediaId: number, tagId: number) => {
                return await api.addTagToMedia(mediaId, tagId);
            },
            removeTag: async (mediaId: number, tagId: number) => {
                return await api.removeTagFromMedia(mediaId, tagId);
            },
            import: async (filePaths: string[], options?: { deleteSource?: boolean; importSource?: string }) => {
                return await api.importMedia(filePaths, options);
            }
        },

        tags: {
            list: async () => await api.getTags(),
            create: async (name: string) => await api.createTag(name),
            delete: async (id: number) => await api.deleteTag(id),
            addToMedia: async (mediaId: number, tagId: number) => await api.addTagToMedia(mediaId, tagId),
            removeFromMedia: async (mediaId: number, tagId: number) => await api.removeTagFromMedia(mediaId, tagId),
        },

        folders: {
            list: async () => await api.getFolders(),
            create: async (name: string, parentId?: number | null) => await api.createFolder(name, parentId),
            rename: async (id: number, newName: string) => await api.renameFolder(id, newName),
            delete: async (id: number) => await api.deleteFolder(id),
            addToMedia: async (mediaId: number, folderId: number) => await api.addFolderToMedia(mediaId, folderId),
            removeFromMedia: async (mediaId: number, folderId: number) => await api.removeFolderFromMedia(mediaId, folderId),
        },

        libraries: {
            list: async () => await api.getLibraries(),
            getActive: async () => await api.getActiveLibrary(),
            open: async () => await api.openLibrary(),
            setActive: async (libraryPath: string) => await api.setActiveLibrary(libraryPath),
            refresh: async () => await api.refreshLibrary(),
        },

        config: {
            getClientConfig: async () => await api.getClientConfig(),
            updateClientConfig: async (updates: any) => await api.updateClientConfig(updates),
        },

        ui: {
            showNotification: (options: any) => {
                api.showNotification({
                    title: options.title,
                    message: options.description || options.message || ''
                });
            },
            showMessageBox: async (options: any) => {
                return await api.showMessageBox(options);
            },
            copyToClipboard: async (text: string) => {
                await api.copyToClipboard(text);
            },
            openMainView: (pluginId: string, viewId: string) => {
                window.dispatchEvent(new CustomEvent('obscura:open-plugin-main-view', {
                    detail: { pluginId, viewId }
                }));
            },
            closeMainView: () => {
                window.dispatchEvent(new CustomEvent('obscura:close-plugin-main-view'));
            }
        },

        system: {
            fetch: async (url: string, options?: any) => {
                return await api.pluginFetch(url, options);
            },
            saveMediaData: async (mediaId: number, pluginId: string, data: any) => {
                return await api.savePluginMediaData(mediaId, pluginId, data);
            },
            loadMediaData: async (mediaId: number, pluginId: string) => {
                return await api.loadPluginMediaData(mediaId, pluginId);
            },
            saveAssociatedData: async (mediaFilePath: string, data: any) => {
                const saved = await api.saveAssociatedData(mediaFilePath, data);
                if (saved) {
                    getAssociatedDataCache().set(mediaFilePath, data);
                }
                return saved;
            },
            loadAssociatedData: async (mediaFilePath: string) => {
                return await loadAssociatedDataCached(mediaFilePath);
            },
            saveCommentFile: async (mediaFilePath: string, data: any) => {
                const saved = await api.saveAssociatedData(mediaFilePath, data);
                if (saved) {
                    getAssociatedDataCache().set(mediaFilePath, data);
                }
                return saved;
            },
            loadCommentFile: async (mediaFilePath: string) => {
                return await loadAssociatedDataCached(mediaFilePath);
            },
            openPath: async (path: string) => {
                await api.openPath(path);
            },
            openExternal: async (url: string) => {
                await api.openExternal(url);
            },
            storage: {
                get: async (key: string) => {
                    try {
                        const raw = localStorage.getItem(`obscura_plugin_storage:${key}`);
                        return raw == null ? null : JSON.parse(raw);
                    } catch {
                        return null;
                    }
                },
                set: async (key: string, value: any) => {
                    try {
                        localStorage.setItem(`obscura_plugin_storage:${key}`, JSON.stringify(value));
                    } catch {
                        // Ignore storage failures to keep plugin runtime stable.
                    }
                }
            }
        },

        on: (event: any, callback: (...args: any[]) => void) => {
            const wrappedCallback = (_e: any, ...args: any[]) => callback(...args);
            return api.on(event, wrappedCallback);
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

export async function loadPluginScripts(config?: AppSettings, options?: { includeDeferred?: boolean; ids?: string[] }) {
    if (!ENABLE_PLUGIN_SCRIPT_FETCH) {
        console.warn('[PluginSystem] Plugin runtime is temporarily disabled.');
        return;
    }
    try {
        const requestedIds = options?.ids?.filter(Boolean) || [];
        const scripts = await api.getPluginScripts(requestedIds.length > 0 ? { ids: requestedIds } : undefined);
        if (!scripts || scripts.length === 0) return;
        if (!ENABLE_PLUGIN_SCRIPT_EXECUTION) {
            console.warn(`[PluginSystem] Plugin scripts fetched (${scripts.length}) but execution is temporarily disabled.`);
            return;
        }

        const priorityIds = requestedIds.length > 0 ? requestedIds : ['niconico'];
        const priorityIndex = (pluginId: string) => {
            const index = priorityIds.indexOf(pluginId);
            return index === -1 ? Number.MAX_SAFE_INTEGER : index;
        };
        const orderedScripts = [...scripts].sort((left, right) => priorityIndex(left.id) - priorityIndex(right.id));

        for (const script of orderedScripts) {
            const pluginId = script.id; // API側で用意したIDを使用
            const scriptId = `plugin-script-${pluginId}`;
            if (options?.ids && options.ids.length > 0 && !options.ids.includes(pluginId)) {
                continue;
            }
            if (ENABLED_PLUGIN_SCRIPT_IDS.size > 0 && !ENABLED_PLUGIN_SCRIPT_IDS.has(pluginId)) {
                continue;
            }
            if (!options?.includeDeferred && STARTUP_DEFERRED_PLUGIN_SCRIPT_IDS.has(pluginId)) {
                continue;
            }

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
