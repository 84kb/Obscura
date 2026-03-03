import { IMediaLibraryAPI } from './types';
import { DesktopAdapter } from './desktop-adapter';
import { AndroidAdapter } from './android-adapter';

import { Capacitor } from '@capacitor/core';

let apiInstance: IMediaLibraryAPI;

const isNative = Capacitor.isNativePlatform();
const hasDesktopBridge = 'obscuraAPI' in (window as any);

if (isNative) {
    console.log('[API] Using Android Adapter');
    apiInstance = new AndroidAdapter();
} else if (hasDesktopBridge) {
    console.log('[API] Using Desktop Adapter');
    apiInstance = new DesktopAdapter();
} else {
    // Fallback for web tests/development where bridge is injected later.
    console.log('[API] Using Desktop Adapter (Fallback)');
    apiInstance = new DesktopAdapter();
}

export const api = apiInstance;


