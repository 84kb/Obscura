import { IMediaLibraryAPI } from './types';
import { ElectronAdapter } from './electron-adapter';
import { AndroidAdapter } from './android-adapter';

import { Capacitor } from '@capacitor/core';

let apiInstance: IMediaLibraryAPI;

const isNative = Capacitor.isNativePlatform();
const isElectron = 'electronAPI' in window;

if (isNative) {
    console.log('[API] Using Android Adapter');
    apiInstance = new AndroidAdapter();
} else if (isElectron) {
    console.log('[API] Using Electron Adapter');
    apiInstance = new ElectronAdapter();
} else {
    // Fallback or should use ElectronMock (which effectively adds electronAPI before this runs? 
    // No, mock adds electronAPI, so isElectron becomes true.
    // We already handle mock injection in main.tsx.
    // If mock is NOT injected but we are on web (e.g. native check failed?)
    // Default to Android/Mock?
    // Let's assume if it's not Native and has electronAPI, it's Electron (or Mock).
    // If neither, we might be in trouble, but let's stick to current logic + Native check.
    console.log('[API] Using Electron Adapter (Fallback)');
    apiInstance = new ElectronAdapter();
}

export const api = apiInstance;
