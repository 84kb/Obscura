import { IMediaLibraryAPI } from './types';
import {
    Library, MediaFile, Tag, TagGroup, Folder, MediaComment,
    AuditLogEntry, ServerConfig, SharedUser, ClientConfig, LibraryTransferSettings
} from '../types';

export class ElectronAdapter implements IMediaLibraryAPI {
    private api = window.electronAPI;

    async selectFile(options?: any): Promise<string | null> {
        return this.api.selectFile(options);
    }

    async createLibrary(name: string, parentPath: string): Promise<Library> {
        return this.api.createLibrary(name, parentPath);
    }

    async openLibrary(): Promise<Library | null> {
        return this.api.openLibrary();
    }

    async getLibraries(): Promise<Library[]> {
        return this.api.getLibraries();
    }

    async setActiveLibrary(libraryPath: string): Promise<void> {
        return this.api.setActiveLibrary(libraryPath);
    }

    async getActiveLibrary(): Promise<Library | null> {
        return this.api.getActiveLibrary();
    }

    async selectFolder(): Promise<string | null> {
        return this.api.selectFolder();
    }

    async scanFolder(folderPath: string): Promise<any[]> {
        return this.api.scanFolder(folderPath);
    }

    async getMediaFiles(page?: number, limit?: number, filters?: any): Promise<any> {
        return this.api.getMediaFiles(page, limit, filters);
    }

    async getMediaFile(id: number): Promise<MediaFile | null> {
        return this.api.getMediaFile(id);
    }

    async getTags(): Promise<Tag[]> {
        return this.api.getTags();
    }

    async createTag(name: string): Promise<Tag> {
        return this.api.createTag(name);
    }

    async deleteTag(id: number): Promise<void> {
        return this.api.deleteTag(id);
    }

    async addTagToMedia(mediaId: number, tagId: number): Promise<void> {
        return this.api.addTagToMedia(mediaId, tagId);
    }

    async addTagsToMedia(mediaIds: number[], tagIds: number[]): Promise<void> {
        return this.api.addTagsToMedia(mediaIds, tagIds);
    }

    async removeTagFromMedia(mediaId: number, tagId: number): Promise<void> {
        return this.api.removeTagFromMedia(mediaId, tagId);
    }

    async getFolders(): Promise<Folder[]> {
        return this.api.getFolders();
    }

    async createFolder(name: string, parentId?: number | null): Promise<Folder> {
        return this.api.createFolder(name, parentId);
    }

    async deleteFolder(id: number): Promise<void> {
        return this.api.deleteFolder(id);
    }

    async renameFolder(id: number, newName: string): Promise<void> {
        return this.api.renameFolder(id, newName);
    }

    async addFolderToMedia(mediaId: number, folderId: number): Promise<void> {
        return this.api.addFolderToMedia(mediaId, folderId);
    }

    async removeFolderFromMedia(mediaId: number, folderId: number): Promise<void> {
        return this.api.removeFolderFromMedia(mediaId, folderId);
    }

    async updateFolderStructure(updates: { id: number; parentId: number | null; orderIndex: number }[]): Promise<void> {
        return this.api.updateFolderStructure(updates);
    }

    async generateThumbnail(mediaId: number, filePath: string): Promise<string | null> {
        return this.api.generateThumbnail(mediaId, filePath);
    }

    async moveToTrash(id: number): Promise<void> {
        return this.api.moveToTrash(id);
    }

    async moveFilesToTrash(ids: number[]): Promise<void> {
        return this.api.moveFilesToTrash(ids);
    }

    async restoreFromTrash(id: number): Promise<void> {
        return this.api.restoreFromTrash(id);
    }

    async restoreFilesFromTrash(ids: number[]): Promise<void> {
        return this.api.restoreFilesFromTrash(ids);
    }

    async deletePermanently(id: number): Promise<void> {
        return this.api.deletePermanently(id);
    }

    async deleteFilesPermanently(ids: number[]): Promise<void> {
        return this.api.deleteFilesPermanently(ids);
    }

    async updateLastPlayed(id: number): Promise<void> {
        return this.api.updateLastPlayed(id);
    }

    async importMedia(filePaths: string[]): Promise<MediaFile[]> {
        return this.api.importMedia(filePaths);
    }

    async checkImportDuplicates(filePaths: string[]): Promise<{ newFile: any; existing: any }[]> {
        return this.api.checkImportDuplicates(filePaths);
    }

    async checkEntryDuplicates(mediaId: number): Promise<{ newMedia: MediaFile; existingMedia: MediaFile }[]> {
        return this.api.checkEntryDuplicates(mediaId);
    }

    async findLibraryDuplicates(criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }): Promise<{ [key: string]: MediaFile[] }[]> {
        return this.api.findLibraryDuplicates(criteria);
    }

    async refreshMetadata(ids: number[]): Promise<void> {
        return this.api.refreshMediaMetadata(ids);
    }

    async scanFileSystemOrphans(): Promise<any[]> {
        return this.api.scanFileSystemOrphans();
    }

    async deleteFileSystemFiles(paths: string[]): Promise<number> {
        return this.api.deleteFileSystemFiles(paths);
    }

    onTriggerFrameCapture(callback: (action: string) => void): () => void {
        return this.api.onTriggerFrameCapture(callback);
    }

    async copyFrameToClipboard(dataUrl: string): Promise<boolean> {
        return this.api.copyFrameToClipboard(dataUrl);
    }

    async saveCapturedFrame(dataUrl: string): Promise<boolean> {
        return this.api.saveCapturedFrame(dataUrl);
    }

    async setCapturedThumbnail(mediaId: number, dataUrl: string): Promise<string | null> {
        return this.api.setCapturedThumbnail(mediaId, dataUrl);
    }

    async addComment(mediaId: number, text: string, time: number): Promise<MediaComment> {
        return this.api.addComment(mediaId, text, time);
    }

    async getComments(mediaId: number): Promise<MediaComment[]> {
        return this.api.getComments(mediaId);
    }

    async generatePreviews(mediaId: number): Promise<string[]> {
        return this.api.generatePreviews(mediaId);
    }

    async openPath(filePath: string): Promise<void> {
        return this.api.openPath(filePath);
    }

    async openExternal(url: string): Promise<void> {
        return this.api.openExternal(url);
    }

    async showItemInFolder(filePath: string): Promise<void> {
        return this.api.showItemInFolder(filePath);
    }

    async openWith(filePath: string): Promise<void> {
        return this.api.openWith(filePath);
    }

    async copyFile(filePath: string): Promise<void> {
        return this.api.copyFile(filePath);
    }

    async copyToClipboard(text: string): Promise<void> {
        return this.api.copyToClipboard(text);
    }

    async renameMedia(mediaId: number, newName: string): Promise<MediaFile | null> {
        return this.api.renameMedia(mediaId, newName);
    }

    async updateRating(mediaId: number, rating: number): Promise<void> {
        return this.api.updateRating(mediaId, rating);
    }

    async backfillMetadata(): Promise<number> {
        return this.api.backfillMetadata();
    }

    async updateArtist(mediaId: number, artist: string | null): Promise<void> {
        return this.api.updateArtist(mediaId, artist);
    }

    async updateDescription(mediaId: number, description: string | null): Promise<void> {
        return this.api.updateDescription(mediaId, description);
    }

    async updateUrl(mediaId: number, url: string | null): Promise<void> {
        return this.api.updateUrl(mediaId, url);
    }

    async updateMediaRelation(childId: number, parentId: number | null): Promise<void> {
        return this.api.updateMediaRelation(childId, parentId);
    }

    async searchMediaFiles(query: string): Promise<{ id: number; file_name: string; title?: string; thumbnail_path?: string | null }[]> {
        return this.api.searchMediaFiles(query); // Argument mismatch in original implementation? Types say (query) in searchMediaFiles, but preload has (query, targets) as well? Let's check type definition.
        // ElectronAPI says: searchMediaFiles: (query: string) => ...
        // Preload says: searchMediaFiles: (query, targets) => ipcRenderer.invoke('search-media-files', query, targets)
        // Main says: ipcMain.handle('search-media-files', query, targets) ... (Not shown in main.ts view, but inferred)
        // src/types/index.ts ElectronAPI says `searchMediaFiles: (query: string) => ...`
        // So I will stick to the interface definition for now.
    }

    async exportMedia(mediaId: number, options?: { notificationId?: string }): Promise<{ success: boolean; message?: string }> {
        return this.api.exportMedia(mediaId, options);
    }

    async copyMediaToLibrary(mediaIds: number[], libraryPath: string, settings: LibraryTransferSettings, options?: { notificationId?: string }): Promise<{ success: boolean; message?: string }> {
        return this.api.copyMediaToLibrary(mediaIds, libraryPath, settings, options);
    }

    async copyFileToClipboard(filePath: string): Promise<boolean> {
        return this.api.copyFileToClipboard(filePath);
    }

    async getTagGroups(): Promise<TagGroup[]> {
        return this.api.getTagGroups();
    }

    async createTagGroup(name: string): Promise<TagGroup> {
        return this.api.createTagGroup(name);
    }

    async deleteTagGroup(id: number): Promise<void> {
        return this.api.deleteTagGroup(id);
    }

    async renameTagGroup(id: number, newName: string): Promise<void> {
        return this.api.renameTagGroup(id, newName);
    }

    async refreshLibrary(): Promise<boolean> {
        return this.api.refreshLibrary();
    }

    onRefreshProgress(callback: (current: number, total: number) => void): void {
        this.api.onRefreshProgress(callback);
    }

    async updateTagGroup(tagId: number, groupId: number | null): Promise<void> {
        return this.api.updateTagGroup(tagId, groupId);
    }

    async getAuditLogs(libraryPath?: string): Promise<AuditLogEntry[]> {
        return this.api.getAuditLogs(libraryPath);
    }

    startDrag(filePaths: string[]): void {
        this.api.startDrag(filePaths);
    }

    async getServerConfig(): Promise<ServerConfig> {
        return this.api.getServerConfig();
    }

    async updateServerConfig(updates: Partial<ServerConfig>): Promise<void> {
        return this.api.updateServerConfig(updates);
    }

    async resetHostSecret(): Promise<string> {
        return this.api.resetHostSecret();
    }

    async startServer(): Promise<{ success: boolean; error?: string }> {
        return this.api.startServer();
    }

    async stopServer(): Promise<{ success: boolean; error?: string }> {
        return this.api.stopServer();
    }

    async getServerStatus(): Promise<boolean> {
        return this.api.getServerStatus();
    }

    async getSharedUsers(): Promise<SharedUser[]> {
        return this.api.getSharedUsers();
    }

    async addSharedUser(user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>): Promise<SharedUser> {
        return this.api.addSharedUser(user);
    }

    async deleteSharedUser(userId: string): Promise<void> {
        return this.api.deleteSharedUser(userId);
    }

    async updateSharedUser(userId: string, updates: Partial<SharedUser>): Promise<void> {
        return this.api.updateSharedUser(userId, updates);
    }

    async getHardwareId(): Promise<string> {
        return this.api.getHardwareId();
    }

    async generateUserToken(): Promise<string> {
        return this.api.generateUserToken();
    }

    async getClientConfig(): Promise<ClientConfig> {
        return this.api.getClientConfig();
    }

    async updateClientConfig(updates: Partial<ClientConfig>): Promise<ClientConfig> {
        return this.api.updateClientConfig(updates);
    }

    async selectDownloadDirectory(): Promise<string | null> {
        return this.api.selectDownloadDirectory();
    }

    async testConnection(url: string, token: string): Promise<{ success: boolean; message?: string }> {
        return this.api.testConnection(url, token);
    }

    async addRemoteLibrary(name: string, url: string, token: string): Promise<any> {
        return this.api.addRemoteLibrary(name, url, token);
    }

    async downloadRemoteMedia(url: string, filename: string, options?: { notificationId?: string }): Promise<{ success: boolean; path?: string; message?: string }> {
        return this.api.downloadRemoteMedia(url, filename, options);
    }

    async uploadRemoteMedia(url: string, token: string, filePaths: string[], metadata?: any, options?: { notificationId?: string }): Promise<{ success: boolean; results?: any[]; message?: string }> {
        return this.api.uploadRemoteMedia(url, token, filePaths, metadata, options);
    }

    async renameRemoteMedia(url: string, token: string, id: number, newName: string): Promise<any> {
        return this.api.renameRemoteMedia(url, token, id, newName);
    }

    async deleteRemoteMedia(url: string, token: string, id: number, options?: { permanent?: boolean }): Promise<any> {
        return this.api.deleteRemoteMedia(url, token, id, options);
    }

    async updateRemoteMedia(url: string, token: string, id: number, updates: any): Promise<any> {
        return this.api.updateRemoteMedia(url, token, id, updates);
    }

    async createRemoteTag(url: string, token: string, name: string): Promise<Tag> {
        return this.api.createRemoteTag(url, token, name);
    }

    async deleteRemoteTag(url: string, token: string, id: number): Promise<void> {
        return this.api.deleteRemoteTag(url, token, id);
    }

    async addRemoteTagToMedia(url: string, token: string, mediaId: number, tagId: number): Promise<void> {
        return this.api.addRemoteTagToMedia(url, token, mediaId, tagId);
    }

    async addRemoteTagsToMedia(url: string, token: string, mediaIds: number[], tagIds: number[]): Promise<void> {
        return this.api.addRemoteTagsToMedia(url, token, mediaIds, tagIds);
    }

    async removeRemoteTagFromMedia(url: string, token: string, mediaId: number, tagId: number): Promise<void> {
        return this.api.removeRemoteTagFromMedia(url, token, mediaId, tagId);
    }

    async checkForUpdates(): Promise<any> {
        return this.api.checkForUpdates();
    }

    async downloadUpdate(): Promise<any> {
        return this.api.downloadUpdate();
    }

    async quitAndInstall(): Promise<void> {
        return this.api.quitAndInstall();
    }

    onUpdateStatus(callback: (data: { status: string; info?: any }) => void): () => void {
        return this.api.onUpdateStatus(callback);
    }

    on(channel: string, func: (...args: any[]) => void): () => void {
        return this.api.on(channel, func);
    }

    async minimizeWindow(): Promise<void> {
        return this.api.minimizeWindow();
    }

    async maximizeWindow(): Promise<void> {
        return this.api.maximizeWindow();
    }

    async closeWindow(): Promise<void> {
        return this.api.closeWindow();
    }

    async getAppVersion(): Promise<string> {
        return this.api.getAppVersion();
    }

    async getFFmpegInfo(): Promise<{ version: string; path: string }> {
        return this.api.getFFmpegInfo();
    }

    async checkFFmpegUpdate(): Promise<{ available: boolean; version?: string; url?: string }> {
        return this.api.checkFFmpegUpdate();
    }

    async updateFFmpeg(url: string): Promise<boolean> {
        return this.api.updateFFmpeg(url);
    }

    onFFmpegUpdateProgress(callback: (progress: number) => void): () => void {
        return this.api.onFFmpegUpdateProgress(callback);
    }

    async focusWindow(): Promise<void> {
        return this.api.focusWindow();
    }

    async updateDiscordActivity(activity: any): Promise<void> {
        return this.api.updateDiscordActivity(activity);
    }

    async clearDiscordActivity(): Promise<void> {
        return this.api.clearDiscordActivity();
    }

    async getAudioDevices(): Promise<{ name: string; description: string }[]> {
        return this.api.getAudioDevices();
    }

    async setAudioDevice(deviceName: string): Promise<void> {
        return this.api.setAudioDevice(deviceName);
    }

    async setExclusiveMode(enabled: boolean): Promise<void> {
        return this.api.setExclusiveMode(enabled);
    }

    async playAudio(filePath?: string): Promise<void> {
        return this.api.playAudio(filePath);
    }

    async pauseAudio(): Promise<void> {
        return this.api.pauseAudio();
    }

    async resumeAudio(): Promise<void> {
        return this.api.resumeAudio();
    }

    async stopAudio(): Promise<void> {
        return this.api.stopAudio();
    }

    async seekAudio(time: number): Promise<void> {
        return this.api.seekAudio(time);
    }

    async setAudioVolume(volume: number): Promise<void> {
        return this.api.setAudioVolume(volume);
    }
}
