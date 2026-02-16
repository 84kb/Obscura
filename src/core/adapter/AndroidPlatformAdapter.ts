import { IPlatformAdapter } from '../types';
import ObscuraNative from '../../mobile/ObscuraNative';

export class AndroidPlatformAdapter implements IPlatformAdapter {
    async readLibraryFile(_relativePath: string): Promise<string | null> {
        return null;
    }

    async writeLibraryFile(_relativePath: string, _content: string): Promise<void> {
    }

    async existsLibraryFile(_relativePath: string): Promise<boolean> {
        return false;
    }

    async getMediaMetadata(absolutePath: string): Promise<Partial<any>> {
        try {
            return await ObscuraNative.getMediaMetadata({ uri: absolutePath });
        } catch (e) {
            console.error('Metadata error:', e);
            return {};
        }
    }

    async generateThumbnail(absolutePath: string, _outputName: string): Promise<string | null> {
        try {
            const result = await ObscuraNative.generateThumbnail({ uri: absolutePath });
            // The native plugin returns a file:// path which the WebView can load
            // However, Capacitor WebView limits file:// access unless configured.
            // We might need to convert using Capacitor.convertFileSrc if simple file:// doesn't work.
            // For now, let's return the path.
            return result.path;
        } catch (e) {
            console.warn('Thumbnail generation failed for', absolutePath, e);
            return null;
        }
    }

    getAbsolutePath(relativePath: string): string {
        return '/data/user/0/com.obscura.medialib/files/' + relativePath;
    }

    async moveToTrash(_absolutePath: string): Promise<void> {
    }

    async openExternal(_url: string): Promise<void> {
    }

    async ensureLibraryDirectory(_relativePath: string): Promise<void> {
    }

    async copyFileToLibrary(_sourceAbsolutePath: string, _destRelativePath: string): Promise<void> {
    }

    async moveFileToLibrary(_sourceAbsolutePath: string, _destRelativePath: string): Promise<void> {
    }

    async getFileStats(_absolutePath: string): Promise<{ size: number; birthtime: Date; mtime: Date }> {
        return { size: 0, birthtime: new Date(), mtime: new Date() };
    }

    isAbsolute(path: string): boolean {
        return path.startsWith('/') || path.startsWith('content://');
    }

    joinPath(...paths: string[]): string {
        return paths.join('/');
    }

    getBasename(path: string): string {
        return path.split('/').pop() || '';
    }

    getExtname(path: string): string {
        const base = this.getBasename(path);
        const idx = base.lastIndexOf('.');
        return idx !== -1 ? base.substring(idx) : '';
    }
}
