const DB_NAME = 'ObscuraAudioDB';
const STORE_NAME = 'audio_assets';
const DB_VERSION = 1;

export interface AudioAsset {
    id: string; // e.g. "kernel:accReflex.irs" or "ddc:my_headphone.vdc"
    data: Blob;
    name: string;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

export async function saveAudioAsset(type: 'kernel' | 'ddc', file: File): Promise<string> {
    const db = await openDB();
    const id = `${type}:${file.name}`;
    const asset: AudioAsset = {
        id,
        data: file,
        name: file.name
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(asset);
        request.onsuccess = () => resolve(`idb:${id}`);
        request.onerror = () => reject(request.error);
    });
}

export async function getAudioAsset(idbUri: string): Promise<Blob | null> {
    if (!idbUri.startsWith('idb:')) return null;
    const id = idbUri.slice(4);
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
            const asset = request.result as AudioAsset;
            resolve(asset ? asset.data : null);
        };
        request.onerror = () => reject(request.error);
    });
}
