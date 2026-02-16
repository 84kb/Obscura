
import { LibraryStore } from './src/core/LibraryStore';
import { ElectronPlatformAdapter } from './electron/ElectronPlatformAdapter';
import * as path from 'path';

// Mock electron shell since we are running in node
jest.mock('electron', () => ({
    shell: {
        trash: jest.fn(),
        openExternal: jest.fn()
    }
}));

async function verify() {
    console.log('Starting verification...');
    try {
        const libraryPath = path.resolve('./verification_lib');
        // Ensure clean state? No, let's just use it.

        const adapter = new ElectronPlatformAdapter(libraryPath);
        const store = new LibraryStore(libraryPath, adapter);

        console.log('LibraryStore instantiated.');

        // Check methods exist
        if (typeof store.getMediaFiles !== 'function') throw new Error('getMediaFiles missing');
        if (typeof store.createTag !== 'function') throw new Error('createTag missing');
        if (typeof store.createFolder !== 'function') throw new Error('createFolder missing');

        console.log('Method existence check passed.');

        // Mock DB load (empty)
        await store.load();
        console.log('Load completed (empty DB).');

        console.log('Verification Success!');
    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

// Just run it if we could, but we need ts-node and mocking.
// Since we might not have jest setup for this file, we can't easily mock electron import.
// But ElectronPlatformAdapter imports 'electron'. This will fail in plain node without electron context if it tries to use it.
// However, the import itself might fail if 'electron' module is not found in node_modules for this script context if not running via electron.
// But we are in the project root, so node_modules should be there.
// The issue is 'electron' module usually exports path to executable, or main process stuff.
// If we just want to verify syntax/types, `tsc` is better.
