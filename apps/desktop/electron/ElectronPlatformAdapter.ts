import { IPlatformAdapter, MediaFile } from '../src/core/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import { shell } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

export class ElectronPlatformAdapter implements IPlatformAdapter {
    private libraryPath: string;

    constructor(libraryPath: string) {
        this.libraryPath = libraryPath;
    }

    private getFullPath(relativePath: string): string {
        return path.join(this.libraryPath, relativePath);
    }

    public getAbsolutePath(relativePath: string): string {
        return this.getFullPath(relativePath);
    }

    public async readLibraryFile(relativePath: string): Promise<string | null> {
        const fullPath = this.getFullPath(relativePath);
        if (await fs.pathExists(fullPath)) {
            return await fs.readFile(fullPath, 'utf-8');
        }
        return null;
    }

    public async writeLibraryFile(relativePath: string, content: string): Promise<void> {
        const fullPath = this.getFullPath(relativePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    public async existsLibraryFile(relativePath: string): Promise<boolean> {
        return await fs.pathExists(this.getFullPath(relativePath));
    }

    public async ensureLibraryDirectory(relativePath: string): Promise<void> {
        await fs.ensureDir(this.getFullPath(relativePath));
    }

    public async getMediaMetadata(absolutePath: string): Promise<Partial<MediaFile>> {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(absolutePath, (err: Error | null, metadata: any) => {
                if (err) {
                    console.error('FFprobe error:', err);
                    resolve({}); // Return empty on error to avoid crash
                    return;
                }

                // Logic adapted from database.ts
                const format = metadata.format || {};
                const streams = metadata.streams || [];
                const videoStream = streams.find((s: any) => s.codec_type === 'video');
                // const audioStream = streams.find((s: any) => s.codec_type === 'audio'); // Unused

                const width = videoStream ? videoStream.width : undefined;
                const height = videoStream ? videoStream.height : undefined;
                const duration = format.duration ? parseFloat(format.duration) : 0;

                // ffmpeg.ts と同等の詳細なタグ収集ロジック
                const combinedTags: Record<string, string> = {}
                const addTags = (tags: any) => {
                    if (!tags) return
                    for (const [key, val] of Object.entries(tags)) {
                        const lowKey = key.toLowerCase()
                        const strVal = String(val)
                        if (!combinedTags[lowKey] || combinedTags[lowKey].length < strVal.length) {
                            combinedTags[lowKey] = strVal
                        }
                    }
                }

                if (format.tags) addTags(format.tags)
                if (metadata.streams) {
                    metadata.streams.forEach((s: any) => addTags(s.tags))
                }

                const getTag = (keys: string[]): string | undefined => {
                    for (const key of keys) {
                        const val = combinedTags[key.toLowerCase()]
                        if (val) return val.trim()
                    }
                    return undefined
                }

                let artist = getTag(['artist', 'uploader', 'performer', 'composer'])
                let description = getTag(['description', 'synopsis', 'comment'])
                let comment = getTag(['comment', 'url'])

                // URL抽出ロジック
                let url: string | undefined = undefined;
                const textToSearch = [comment, description].filter(Boolean).join('\n')
                const urlMatch = textToSearch.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                    const foundUrl = urlMatch[0];
                    url = foundUrl;
                    // DescriptionやCommentがURLのみの場合は削除する（URLフィールド単体で管理したいため）
                    if (description && description.trim() === url) description = undefined;
                    if (comment && comment.trim() === url) comment = undefined;
                }

                resolve({
                    width,
                    height,
                    duration,
                    artist,
                    description,
                    url,
                });
            });
        });
    }

    public async generateThumbnail(absolutePath: string, outputName: string): Promise<string | null> {
        // Thumbnail generation logic using fluent-ffmpeg
        // Output to a temp folder or cache? 
        // Logic from database.ts: saved to images/<id>/thumb.jpg or similar.
        // The LibraryStore asks to generate `outputName`. 
        // But `fluent-ffmpeg` takes an output folder and filename.
        // We need to know WHERE to put it. 
        // The interface says `generateThumbnail(absolutePath, outputName)`.
        // The caller (LibraryStore) expects a relative path back? 

        // Actually LibraryStore passed `destAbsPath` as source. 
        // We probably want to save the thumbnail NEXT TO the file.
        const outputDir = path.dirname(absolutePath);
        const outputPath = path.join(outputDir, outputName);

        return new Promise((resolve) => {
            ffmpeg(absolutePath)
                .screenshots({
                    timestamps: ['10%'], // Capture at 10%
                    filename: outputName,
                    folder: outputDir,
                    size: '320x?'
                })
                .on('end', () => {
                    // Return relative path from library root?
                    // No, LibraryStore handles paths. 
                    // If we return just the filename (bucket relative?)
                    // The caller called it with `destAbsPath` which is `images/<uuid>/<file>`.
                    // Thumbnail will be `images/<uuid>/<outputName>`.
                    // We should return `images/<uniqueId>/<outputName>`.

                    // Calculate relative path from libraryRoot
                    const rel = path.relative(this.libraryPath, outputPath);
                    // Verify separation is /
                    resolve(rel.split(path.sep).join('/'));
                })
                .on('error', (err: any) => {
                    console.error('Thumbnail gen error:', err);
                    resolve(null);
                });
        });
    }

    public async moveToTrash(absolutePath: string): Promise<void> {
        await shell.trashItem(absolutePath);
    }

    public async openExternal(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    public async copyFileToLibrary(sourceAbsolutePath: string, destRelativePath: string): Promise<void> {
        const destFullPath = this.getFullPath(destRelativePath);
        await fs.ensureDir(path.dirname(destFullPath));
        await fs.copy(sourceAbsolutePath, destFullPath);
    }

    public async moveFileToLibrary(sourceAbsolutePath: string, destRelativePath: string): Promise<void> {
        const destFullPath = this.getFullPath(destRelativePath);
        await fs.ensureDir(path.dirname(destFullPath));
        await fs.move(sourceAbsolutePath, destFullPath, { overwrite: true });
    }

    public async getFileStats(absolutePath: string): Promise<{ size: number; birthtime: Date; mtime: Date }> {
        const stats = await fs.stat(absolutePath);
        return {
            size: stats.size,
            birthtime: stats.birthtime,
            mtime: stats.mtime
        };
    }

    public isAbsolute(p: string): boolean {
        return path.isAbsolute(p);
    }

    public joinPath(...paths: string[]): string {
        return path.join(...paths);
    }

    public getBasename(p: string): string {
        return path.basename(p);
    }

    public getExtname(p: string): string {
        return path.extname(p);
    }
}
