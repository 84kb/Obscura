import { LibraryStore } from '../src/core/LibraryStore';
import { ElectronPlatformAdapter } from './ElectronPlatformAdapter';

// Backward compatibility exports - LegacyMediaLibrary の実装をそのまま使用
// 注意: getActiveMediaLibrary は database.legacy.ts の実装が使用される
// LibraryStore は将来の完全移行時に使用予定だが、現在は未完成（メディアファイルのロードが未実装）
export * from './database.legacy';

// LibraryStore のインスタンス管理（将来使用予定）
const libraryInstances = new Map<string, LibraryStore>();

export function getLibraryStore(libraryPath: string): LibraryStore {
    if (libraryInstances.has(libraryPath)) {
        return libraryInstances.get(libraryPath)!;
    }

    // Create new instance
    const adapter = new ElectronPlatformAdapter(libraryPath);
    const store = new LibraryStore(libraryPath, adapter);

    // Initialize/Load
    store.load();

    libraryInstances.set(libraryPath, store);
    return store;
}

export const libraryStoreManager = {
    getLibrary: getLibraryStore,
};

// libraryRegistry は LegacyMediaLibrary の registry を使用するように修正
// これにより Watcher(自動インポート) と UI でインスタンスが共有され、状態の同期が行われるようになる
import { libraryRegistry as legacyRegistry } from './database.legacy';

export const libraryRegistry = {
    getLibrary: (path: string) => legacyRegistry.getLibrary(path),
    has: (path: string) => (legacyRegistry as any).instances?.has(path) || false // Legacy側の内部Mapに合わせる
};
