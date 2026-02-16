export * from '../types';
import { MediaFile, Tag, TagGroup, Folder, MediaComment, AuditLogEntry } from '../types';

/**
 * Platform Agnostic Adapter Interface
 * This interface abstracts all file system and native operations that might differ
 * between Electron (Node.js) and Android (Capacitor).
 */
export interface IPlatformAdapter {
    /**
     * Read a text file from the library storage
     * @param relativePath Relative path from the library root
     */
    readLibraryFile(relativePath: string): Promise<string | null>;

    /**
     * Write a text file to the library storage
     * @param relativePath Relative path from the library root
     * @param content Content to write
     */
    writeLibraryFile(relativePath: string, content: string): Promise<void>;

    /**
     * Check if a file exists
     * @param relativePath Relative path from the library root
     */
    existsLibraryFile(relativePath: string): Promise<boolean>;

    /**
     * Extract metadata from a media file
     * @param absolutePath Absolute path to the media file
     */
    getMediaMetadata(absolutePath: string): Promise<Partial<MediaFile>>;

    /**
     * Generate a thumbnail for a media file
     * @param absolutePath Absolute path to the media file
     * @param outputName Desired output filename for the thumbnail
     * @returns The relative path to the generated thumbnail, or absolute path/data URL if platform specific
     */
    generateThumbnail(absolutePath: string, outputName: string): Promise<string | null>;

    /**
     * Get the full path for a relative library path (mostly for Electron use)
     * On Android, this might return null or a special URI scheme
     */
    getAbsolutePath(relativePath: string): string;

    /**
     * Move a file to the system trash
     */
    moveToTrash(absolutePath: string): Promise<void>;

    /**
     * Open a file externally
     */
    openExternal(url: string): Promise<void>;

    /**
     * Ensure a directory exists within the library
     * @param relativePath Relative path from library root
     */
    ensureLibraryDirectory(relativePath: string): Promise<void>;

    /**
     * Copy a file from an external source to the library
     * @param sourceAbsolutePath Path to the source file
     * @param destRelativePath relative path to the destination in the library
     */
    copyFileToLibrary(sourceAbsolutePath: string, destRelativePath: string): Promise<void>;

    /**
     * Move a file from an external source to the library
     */
    moveFileToLibrary(sourceAbsolutePath: string, destRelativePath: string): Promise<void>;

    /**
     * Get file statistics
     */
    getFileStats(absolutePath: string): Promise<{ size: number; birthtime: Date; mtime: Date }>;

    /**
     * Check if path is absolute
     */
    isAbsolute(path: string): boolean;

    /**
     * Path join utility
     */
    joinPath(...paths: string[]): string;

    /**
     * Get basename
     */
    getBasename(path: string): string;

    /**
     * Get extension
     */
    getExtname(path: string): string;
}

export interface LibraryDatabase {
    mediaFiles: MediaFile[];
    tags: Tag[];
    tagGroups: TagGroup[];
    folders: Folder[];
    mediaTags: { mediaId: number; tagId: number }[];
    mediaFolders: { mediaId: number; folderId: number }[];
    comments: MediaComment[];
    auditLogs: AuditLogEntry[];
    nextMediaId: number;
    nextTagId: number;
    nextTagGroupId: number;
    nextFolderId: number;
    nextCommentId: number;
}
