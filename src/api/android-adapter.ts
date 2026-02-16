import { IMediaLibraryAPI } from './types';
import {
    Library, MediaFile, Tag, TagGroup, Folder, MediaComment,
    AuditLogEntry, ServerConfig, SharedUser, ClientConfig
} from '../core/types';

export class AndroidAdapter implements IMediaLibraryAPI {
    async selectFile(_options?: any): Promise<string | null> { return null; }
    async selectDownloadDirectory(): Promise<string | null> { return null; }
    async createLibrary(_name: string, _parentPath: string): Promise<Library> { throw new Error('Not implemented'); }
    async openLibrary(): Promise<Library | null> { throw new Error('Not implemented'); }
    async getLibraries(): Promise<Library[]> { return []; }
    async setActiveLibrary(_libraryPath: string): Promise<void> { }
    async getActiveLibrary(): Promise<Library | null> { return null; }
    async refreshLibrary(): Promise<boolean> { return false; }
    onRefreshProgress(_callback: (current: number, total: number) => void): (() => void) { return () => { }; }

    async selectFolder(): Promise<string | null> { return null; }
    async scanFolder(_folderPath: string): Promise<any[]> { return []; }

    async getMediaFiles(_page?: number, _limit?: number, _filters?: any): Promise<any> { return { media: [], total: 0 }; }
    async getMediaFile(_id: number): Promise<MediaFile | null> { return null; }
    async updateRating(_mediaId: number, _rating: number): Promise<void> { }
    async updateArtist(_mediaId: number, _artist: string | null): Promise<void> { }
    async updateDescription(_mediaId: number, _description: string | null): Promise<void> { }
    async updateUrl(_mediaId: number, _url: string | null): Promise<void> { }
    async updateMediaRelation(_childId: number, _parentId: number | null): Promise<void> { }
    async renameMedia(_mediaId: number, _newName: string): Promise<MediaFile | null> { return null; }
    async moveToTrash(_id: number): Promise<void> { }
    async moveFilesToTrash(_ids: number[]): Promise<void> { }
    async restoreFromTrash(_id: number): Promise<void> { }
    async restoreFilesFromTrash(_ids: number[]): Promise<void> { }
    async deletePermanently(_id: number): Promise<void> { }
    async deleteFilesPermanently(_ids: number[]): Promise<void> { }
    async updateLastPlayed(_id: number): Promise<void> { }

    async getTags(): Promise<Tag[]> { return []; }
    async createTag(_name: string): Promise<Tag> { throw new Error('Not implemented'); }
    async deleteTag(_id: number): Promise<void> { }
    async addTagToMedia(_mediaId: number, _tagId: number): Promise<void> { }
    async addTagsToMedia(_mediaIds: number[], _tagIds: number[]): Promise<void> { }
    async removeTagFromMedia(_mediaId: number, _tagId: number): Promise<void> { }

    async getFolders(): Promise<Folder[]> { return []; }
    async createFolder(_name: string, _parentId?: number | null): Promise<Folder> { throw new Error('Not implemented'); }
    async deleteFolder(_id: number): Promise<void> { }
    async renameFolder(_id: number, _newName: string): Promise<void> { }
    async addFolderToMedia(_mediaId: number, _folderId: number): Promise<void> { }
    async removeFolderToMedia(_mediaId: number, _folderId: number): Promise<void> { }
    async removeFolderFromMedia(_mediaId: number, _folderId: number): Promise<void> { }
    async updateFolderStructure(_updates: any[]): Promise<void> { }

    async getTagGroups(): Promise<TagGroup[]> { return []; }
    async createTagGroup(_name: string): Promise<TagGroup> { throw new Error('Not implemented'); }
    async deleteTagGroup(_id: number): Promise<void> { }
    async renameTagGroup(_id: number, _newName: string): Promise<void> { }
    async updateTagGroup(_tagId: number, _groupId: number | null): Promise<void> { }

    async checkImportDuplicates(_filePaths: string[]): Promise<any[]> { return []; }
    async importMedia(_filePaths: string[]): Promise<MediaFile[]> { return []; }
    async checkEntryDuplicates(_mediaId: number): Promise<any[]> { return []; }
    async findLibraryDuplicates(_criteria?: any): Promise<any[]> { return []; }
    async refreshMetadata(_ids: number[]): Promise<void> { }
    async scanFileSystemOrphans(): Promise<any[]> { return []; }
    async deleteFileSystemFiles(_paths: string[]): Promise<number> { return 0; }

    async generateThumbnail(_mediaId: number, _filePath: string): Promise<string | null> { return null; }
    async generatePreviews(_mediaId: number): Promise<string[]> { return []; }
    onTriggerFrameCapture(_callback: (action: string) => void): (() => void) { return () => { }; }
    async copyFrameToClipboard(_dataUrl: string): Promise<boolean> { return false; }
    async saveCapturedFrame(_dataUrl: string): Promise<boolean> { return false; }
    async setCapturedThumbnail(_mediaId: number, _dataUrl: string): Promise<string | null> { return null; }

    async addComment(_mediaId: number, _text: string, _time: number): Promise<MediaComment> { throw new Error('Not implemented'); }
    async getComments(_mediaId: number): Promise<MediaComment[]> { return []; }

    async getAuditLogs(_libraryPath?: string): Promise<AuditLogEntry[]> { return []; }

    async getServerConfig(): Promise<ServerConfig> { throw new Error('Not implemented'); }
    async updateServerConfig(_updates: Partial<ServerConfig>): Promise<void> { }
    async resetHostSecret(): Promise<string> { return ''; }
    async startServer(): Promise<any> { }
    async stopServer(): Promise<any> { }
    async getServerStatus(): Promise<boolean> { return false; }
    async getSharedUsers(): Promise<SharedUser[]> { return []; }
    async addSharedUser(_user: any): Promise<SharedUser> { throw new Error('Not implemented'); }
    async deleteSharedUser(_userId: string): Promise<void> { }
    async updateSharedUser(_userId: string, _updates: any): Promise<void> { }
    async getHardwareId(): Promise<string> { return 'android'; }
    async generateUserToken(): Promise<string> { return ''; }

    async getClientConfig(): Promise<ClientConfig> { throw new Error('Not implemented'); }
    async updateClientConfig(_updates: Partial<ClientConfig>): Promise<ClientConfig> { throw new Error('Not implemented'); }

    async testConnection(_url: string, _token: string): Promise<any> { }
    async addRemoteLibrary(_name: string, _url: string, _token: string): Promise<any> { }
    async downloadRemoteMedia(_url: string, _filename: string, _options?: any): Promise<any> { }
    async uploadRemoteMedia(_url: string, _token: string, _filePaths: string[], _metadata?: any, _options?: any): Promise<any> { }
    async renameRemoteMedia(_url: string, _token: string, _id: number, _newName: string): Promise<any> { }
    async deleteRemoteMedia(_url: string, _token: string, _id: number, _options?: any): Promise<any> { }
    async updateRemoteMedia(_url: string, _token: string, _id: number, _updates: any): Promise<any> { }
    async createRemoteTag(_url: string, _token: string, _name: string): Promise<Tag> { throw new Error('Not implemented'); }
    async deleteRemoteTag(_url: string, _token: string, _id: number): Promise<void> { }
    async addRemoteTagToMedia(_url: string, _token: string, _mediaId: number, _tagId: number): Promise<void> { }
    async addRemoteTagsToMedia(_url: string, _token: string, _mediaIds: number[], _tagIds: number[]): Promise<void> { }
    async removeRemoteTagFromMedia(_url: string, _token: string, _mediaId: number, _tagId: number): Promise<void> { }

    async openPath(_filePath: string): Promise<void> { }
    async openExternal(_url: string): Promise<void> { }
    async showItemInFolder(_filePath: string): Promise<void> { }
    async openWith(_filePath: string): Promise<void> { }
    async copyFile(_filePath: string): Promise<void> { }
    async copyToClipboard(_text: string): Promise<void> { }
    async copyFileToClipboard(_filePath: string): Promise<boolean> { return false; }
    async startDrag(_filePaths: string[]): Promise<void> { }

    async checkForUpdates(): Promise<any> { return { available: false }; }
    async downloadUpdate(): Promise<any> { }
    async quitAndInstall(): Promise<void> { }
    onUpdateStatus(_callback: (data: any) => void): (() => void) { return () => { }; }
    async getAppVersion(): Promise<string> { return '1.0.0'; }

    async minimizeWindow(): Promise<void> { }
    async maximizeWindow(): Promise<void> { }
    async closeWindow(): Promise<void> { }
    async focusWindow(): Promise<void> { }

    async updateDiscordActivity(_activity: any): Promise<void> { }
    async clearDiscordActivity(): Promise<void> { }

    async getFFmpegInfo(): Promise<any> { return {}; }
    async checkFFmpegUpdate(): Promise<any> { return {}; }
    async updateFFmpeg(_url: string): Promise<boolean> { return false; }
    onFFmpegUpdateProgress(_callback: (progress: number) => void): (() => void) { return () => { }; }

    on(_channel: string, _func: (...args: any[]) => void): (() => void) { return () => { }; }

    async getAudioDevices(): Promise<any[]> { return []; }
    async setAudioDevice(_deviceName: string): Promise<void> { }
    async setExclusiveMode(_enabled: boolean): Promise<void> { }
    async playAudio(_filePath?: string): Promise<void> { }
    async pauseAudio(): Promise<void> { }
    async resumeAudio(): Promise<void> { }
    async stopAudio(): Promise<void> { }
    async seekAudio(_time: number): Promise<void> { }
    async setAudioVolume(_volume: number): Promise<void> { }

    async exportMedia(_mediaId: number, _options?: any): Promise<any> { return { success: false }; }
    async copyMediaToLibrary(_mediaIds: number[], _libraryPath: string, _settings: any, _options?: any): Promise<any> { return { success: false }; }
    async backfillMetadata(): Promise<number> { return 0; }
    async searchMediaFiles(_query: string): Promise<any[]> { return []; }
}
