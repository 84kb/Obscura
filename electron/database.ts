import path from 'path'
import { app } from 'electron'
import { getConfig as getClientConfig } from './settings'


import { getMediaMetadata, createThumbnail, extractDominantColor } from './ffmpeg'
import { getThumbnailPath } from './utils'
import crypto from 'crypto'
const fs = require('fs-extra')

// ライブラリ情報を保存するファイル
// ライブラリ情報を保存するファイル
const userDataPath = app ? app.getPath('userData') : '.'
const librariesConfigPath = path.join(userDataPath, 'libraries.json')

// データベース構造
interface Database {
  mediaFiles: any[]
  tags: any[]
  tagFolders: any[]
  folders: any[] // Renamed from genres
  mediaTags: { mediaId: number; tagId: number }[]
  mediaFolders: { mediaId: number; folderId: number }[] // Renamed from mediaGenres
  comments: any[]
  nextMediaId: number
  nextTagId: number
  nextTagFolderId: number
  nextFolderId: number // Renamed from nextGenreId
  nextCommentId: number
}

// ライブラリ管理
interface LibraryConfig {
  libraries: Array<{
    name: string
    path: string
    createdAt: string
  }>
  activeLibraryPath: string | null
}

let librariesConfig: LibraryConfig = {
  libraries: [],
  activeLibraryPath: null,
}

// ライブラリ設定の読み込み
function loadLibrariesConfig() {
  try {
    if (fs.existsSync(librariesConfigPath)) {
      const data = fs.readFileSync(librariesConfigPath, 'utf-8')
      librariesConfig = JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load libraries config:', error)
  }
}

// ライブラリ設定の保存
function saveLibrariesConfig() {
  try {
    fs.writeFileSync(librariesConfigPath, JSON.stringify(librariesConfig, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save libraries config:', error)
  }
}

/**
 * 読み込まれた各ライブラリのインスタンスを管理する
 */
export class MediaLibrary {
  public path: string
  private dbPath: string // Legacy support
  private tagsPath: string
  private foldersPath: string // Was genresPath (now storing Folders)
  private tagFoldersPath: string // Was foldersPath (now storing TagFolders)

  private db: Database

  constructor(libraryPath: string) {
    this.path = libraryPath
    this.dbPath = path.join(libraryPath, 'database.json')
    this.tagsPath = path.join(libraryPath, 'tags.json')
    this.foldersPath = path.join(libraryPath, 'folders.json') // Stores "Folders" (ex-Genres)
    this.tagFoldersPath = path.join(libraryPath, 'tag_folders.json') // Stores "TagFolders"

    this.db = {
      mediaFiles: [],
      tags: [],
      tagFolders: [],
      folders: [],
      mediaTags: [],
      mediaFolders: [],
      comments: [],
      nextMediaId: 1,
      nextTagId: 1,
      nextTagFolderId: 1,
      nextFolderId: 1,
      nextCommentId: 1,
    }
    this.load()
  }

  private load() {
    try {
      // 0. File Migration (Renaming)
      // Migrate old users who had 'folders.json' as TagFolders
      const legacyTagFoldersPath = path.join(this.path, 'folders.json')

      // If we have 'folders.json' but NOT 'tag_folders.json', and we also have 'genres.json' (implying old structure),
      // OR if we just want to be safe: If 'folders.json' exists and 'tag_folders.json' does not.
      // BUT WAIT: 'folders.json' will be the NEW name for genres.
      // So checking if 'genres.json' exists is a good indicator we are in "Old Mode".
      const legacyGenresPath = path.join(this.path, 'genres.json')

      if (fs.existsSync(legacyTagFoldersPath) && !fs.existsSync(this.tagFoldersPath)) {
        // Check if this 'folders.json' is actually TagFolders. 
        // In the previous version, folders.json WAS TagFolders.
        // We must move it to tag_folders.json before we potentially overwrite it with Genres.
        console.log('[MediaLibrary] Migrating folders.json (TagFolders) to tag_folders.json')
        fs.renameSync(legacyTagFoldersPath, this.tagFoldersPath)
      }

      if (fs.existsSync(legacyGenresPath) && !fs.existsSync(this.foldersPath)) {
        console.log('[MediaLibrary] Migrating genres.json to folders.json')
        fs.renameSync(legacyGenresPath, this.foldersPath)
      }

      // 1. Check for legacy database and migrate if needed
      if (fs.existsSync(this.dbPath) && !fs.existsSync(this.tagsPath)) {
        console.log('[MediaLibrary] Legacy database found. Starting migration...')
        this.migrateFromLegacyDatabase()
        console.log('[MediaLibrary] Migration completed.')
      }

      // 2. Load global metadata
      if (fs.existsSync(this.tagsPath)) this.db.tags = fs.readJsonSync(this.tagsPath)
      if (fs.existsSync(this.tagFoldersPath)) this.db.tagFolders = fs.readJsonSync(this.tagFoldersPath)
      if (fs.existsSync(this.foldersPath)) this.db.folders = fs.readJsonSync(this.foldersPath)

      // 3. Load media files metadata from dispersed files
      this.db.mediaFiles = []
      this.db.mediaTags = []
      this.db.mediaGenres = []
      this.db.comments = []

      const imagesDir = path.join(this.path, 'images')
      if (fs.existsSync(imagesDir)) {
        const dirs = fs.readdirSync(imagesDir)
        for (const dir of dirs) {
          const metaPath = path.join(imagesDir, dir, 'metadata.json')
          if (fs.existsSync(metaPath)) {
            try {
              const meta = fs.readJsonSync(metaPath)
              // Ensure required fields exist (migration logic for individual files)
              if (meta.id) {
                this.db.mediaFiles.push(meta)
                // Reconstruct IDs counters if needed (basic max logic)
                this.db.nextMediaId = Math.max(this.db.nextMediaId, meta.id + 1)

                // Restore tags/genres/comments relationships from embedded data if it exists
                // Note: The new design keeps them in metadata.json, so we parse them out to in-memory relations if needed
                // However, for the app to work with existing structure `mediaTags`, we might need to populate them on load
                if (meta.tags) {
                  meta.tags.forEach(() => {
                    // t is Tag object. We need relation.
                    // But we loaded tags from tags.json.
                    // Here we assume metadata.json stores the RELATION or full tag?
                    // Plan says: "metadata.json: per-file metadata".
                    // Usually we store IDs.
                  })
                }
              }
            } catch (e) {
              console.error(`[MediaLibrary] Failed to load metadata from ${metaPath}`, e)
            }
          }
        }
      }

      this.rebuildIndices()

    } catch (error) {
      console.error(`Failed to load database for ${this.path}:`, error)
    }
  }

  // Reload in-memory relations (mediaTags, mediaFolders) from the loaded mediaFiles
  // because existing app relies on this.db.mediaTags
  private rebuildIndices() {
    this.db.mediaTags = []
    this.db.mediaFolders = []
    this.db.comments = []

    this.db.mediaFiles.forEach(media => {
      // Tags
      if (media.tags && Array.isArray(media.tags)) {
        media.tags.forEach((tag: any) => {
          const tagId = typeof tag === 'object' ? tag.id : tag
          if (tagId) {
            this.db.mediaTags.push({ mediaId: media.id, tagId })
          }
        })
      }

      // Folders (previously Genres)
      if (media.folders && Array.isArray(media.folders)) {
        media.folders.forEach((folder: any) => {
          const folderId = typeof folder === 'object' ? folder.id : folder
          if (folderId) {
            this.db.mediaFolders.push({ mediaId: media.id, folderId })
          }
        })
      }

      // Comments
      if (media.comments && Array.isArray(media.comments)) {
        // Ensure comments have mediaId (they should if migrated/saved correctly)
        // If not, we might need to patch them.
        media.comments.forEach((comment: any) => {
          if (!comment.mediaId) comment.mediaId = media.id
          this.db.comments.push(comment)
        })
      }
    })
    console.log(`[MediaLibrary] Indices rebuilt: ${this.db.mediaTags.length} tags, ${this.db.mediaFolders.length} folders, ${this.db.comments.length} comments.`)
  }

  private migrateFromLegacyDatabase() {
    try {
      const legacyData = fs.readJsonSync(this.dbPath)

      // 1. Save globals
      this.db.tags = legacyData.tags || []
      this.db.tagFolders = legacyData.tagFolders || []
      this.db.folders = legacyData.genres || [] // Migrate genres to folders

      this.saveTags()
      this.saveTagFolders() // Was saveFolders() for tagFolders
      this.saveFolders()    // Was saveGenres() for Folders
      this.db.nextMediaId = legacyData.nextMediaId || 1
      this.db.nextTagId = legacyData.nextTagId || 1
      // ... set other counters (will store these in a config file or defaults?) 
      // Ideally we should store counters. Let's create `counters.json` or just derive them.
      // For now, derive them on load (max ID + 1)

      // 2. Iterate media files and save dispersed metadata
      const mediaFiles = legacyData.mediaFiles || []
      const mediaTags = legacyData.mediaTags || []
      const mediaGenres = legacyData.mediaGenres || []
      const comments = legacyData.comments || []

      mediaFiles.forEach((media: any) => {
        // Join data
        const myTags = mediaTags.filter((mt: any) => mt.mediaId === media.id)
          .map((mt: any) => this.db.tags.find(t => t.id === mt.tagId))
          .filter((t: any) => t)

        const myFolders = mediaGenres.filter((mg: any) => mg.mediaId === media.id)
          .map((mg: any) => this.db.folders.find(g => g.id === mg.genreId))
          .filter((g: any) => g)

        const myComments = comments.filter((c: any) => c.mediaId === media.id)

        media.tags = myTags
        media.folders = myFolders // Renamed from genres
        delete media.genres     // Ensure legacy property is removed
        media.comments = myComments

        // Validate uniqueId
        if (!media.uniqueId) {
          // Should not happen for valid files, but just in case
          media.uniqueId = crypto.randomBytes(6).toString('hex')
        }

        // Ensure directory exists (existing logic uses images/uniqueId)
        // But some might be flat? Check `destDir` logic in import.
        // Assumption: logic uses images/<uniqueId>. 

        // Write metadata
        this.saveMediaMetadata(media)
      })

      // 3. Rename old DB
      fs.renameSync(this.dbPath, path.join(this.path, 'database.json.migrated'))

    } catch (e) {
      console.error("Migration failed:", e)
      throw e // Halt if migration fails
    }
  }

  // --- New Save Methods ---

  private saveTags() {
    fs.writeJsonSync(this.tagsPath, this.db.tags, { spaces: 2 })
  }
  private saveTagFolders() { // Renamed from saveFolders to avoid confusion
    fs.writeJsonSync(this.tagFoldersPath, this.db.tagFolders, { spaces: 2 })
  }
  private saveFolders() { // Renamed from saveGenres
    fs.writeJsonSync(this.foldersPath, this.db.folders, { spaces: 2 })
  }

  private saveMediaMetadata(media: any) {
    if (!media.uniqueId) return // Should throw?
    const dirPath = path.join(this.path, 'images', media.uniqueId)
    fs.ensureDirSync(dirPath)
    const metaPath = path.join(dirPath, 'metadata.json')

    // We dump the whole object including joined tags/genres/comments
    fs.writeJsonSync(metaPath, media, { spaces: 2 })
  }

  // メディア操作
  public async importMediaFiles(filePaths: string[]) {
    const importedFiles = []
    for (const srcPath of filePaths) {
      try {
        if (!fs.existsSync(srcPath)) continue
        const ext = path.extname(srcPath).toLowerCase()
        if (!['.mp4', '.mkv', '.avi', '.mov', '.webm', '.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext)) continue

        const fileName = path.basename(srcPath)
        const fileType = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext) ? 'audio' : 'video'

        const id = this.db.nextMediaId++
        const uniqueId = crypto.randomBytes(6).toString('hex')
        const destDir = path.join(this.path, 'images', uniqueId)
        await fs.ensureDir(destDir)

        const destPath = path.join(destDir, fileName)
        await fs.copy(srcPath, destPath)

        const stats = fs.statSync(destPath) // Use destPath for stats
        const { width, height, duration, artist, description, url } = await getMediaMetadata(destPath)
        const artists: string[] = []

        const metadata = {
          id, uniqueId, file_path: destPath, file_name: fileName, file_type: fileType,
          file_size: stats.size, duration, width, height, rating: 0,
          created_date: stats.birthtime.toISOString(), modified_date: stats.mtime.toISOString(),
          thumbnail_path: null as string | null, created_at: new Date().toISOString(), is_deleted: false,
          last_played_at: null, artist, artists, description, url, dominant_color: null as string | null,
          tags: [], folders: [], comments: [] // Renamed genres -> folders
        }

        // サムネイル生成を強制実行
        try {
          const thumbPath = await getThumbnailPath(this.path, id, destPath)
          const mode = getClientConfig().thumbnailMode || 'speed'
          if (await createThumbnail(destPath, thumbPath, mode)) {
            metadata.thumbnail_path = thumbPath

            // ドミナントカラー抽出
            try {
              const color = await extractDominantColor(thumbPath)
              if (color) {
                metadata.dominant_color = color
              }
            } catch (colorError) {
              console.error(`Failed to extract dominant color for ${fileName}:`, colorError)
            }
          }
        } catch (e) {
          console.error(`Failed to generate initial thumbnail for ${fileName}:`, e)
        }

        this.db.mediaFiles.push(metadata)
        this.saveMediaMetadata(metadata)
        importedFiles.push(metadata)
      } catch (error) { console.error(`Failed to import file: ${srcPath}`, error) }
    }
    // No monolithic save needed
    return importedFiles
  }

  public addMediaFile(filePath: string, fileName: string, fileType: string, options: any = {}) {
    const existing = this.db.mediaFiles.find((m) => m.file_path === filePath)
    if (existing) return existing.id
    const id = this.db.nextMediaId++
    const stats = fs.statSync(filePath)
    this.db.mediaFiles.push({
      id, file_path: filePath, file_name: fileName, file_type: fileType,
      file_size: stats.size, duration: options.duration || null,
      width: options.width, height: options.height, rating: 0,
      created_date: stats.birthtime.toISOString(), modified_date: stats.mtime.toISOString(),
      thumbnail_path: null, created_at: new Date().toISOString(), is_deleted: false,
      last_played_at: null, artist: null, artists: [], description: null,
      dominant_color: null, tags: [], folders: [], comments: [] // Renamed genres -> folders
    } as any)
    const newMedia = this.db.mediaFiles.find(m => m.id === id)
    if (newMedia) this.saveMediaMetadata(newMedia)
    return id
  }

  public updateDominantColor(id: number, color: string) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.dominant_color = color; this.saveMediaMetadata(media) }
  }

  public updateRating(id: number, rating: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.rating = rating; this.saveMediaMetadata(media) }
  }

  public getVideosMissingMetadata() {
    return this.db.mediaFiles.filter((m) => m.file_type === 'video' && (!m.duration || m.duration === 0))
  }

  public updateVideoMetadata(id: number, width: number, height: number, duration: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      if (width) media.width = width
      if (height) media.height = height
      if (duration) media.duration = duration
      this.saveMediaMetadata(media)
    }
  }

  public get(id: number) { return this.db.mediaFiles.find((m) => m.id === id) }

  public getAllMediaFiles() {
    return this.db.mediaFiles.map((media) => {
      const tagIds = this.db.mediaTags.filter((mt) => mt.mediaId === media.id).map((mt) => mt.tagId)
      const tags = this.db.tags.filter((t) => tagIds.includes(t.id))
      const folderIds = this.db.mediaFolders.filter((mg) => mg.mediaId === media.id).map((mg) => mg.folderId)
      const folders = this.db.folders.filter((g) => folderIds.includes(g.id))
      return { ...media, tags, folders } // Renamed genres -> folders
    })
  }

  public getMediaFileWithDetails(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (!media) return null
    const tagIds = this.db.mediaTags.filter((mt) => mt.mediaId === id).map((mt) => mt.tagId)
    const tags = this.db.tags.filter((t) => tagIds.includes(t.id))
    const folderIds = this.db.mediaFolders.filter((mg) => mg.mediaId === id).map((mg) => mg.folderId)
    const folders = this.db.folders.filter((g) => folderIds.includes(g.id))
    const comments = this.db.comments.filter((c) => c.mediaId === id)
    return { ...media, tags, folders, comments } // Renamed genres -> folders
  }

  public updateThumbnail(id: number, thumbnailPath: string) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.thumbnail_path = thumbnailPath; this.saveMediaMetadata(media) }
  }

  public moveToTrash(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.is_deleted = true; this.saveMediaMetadata(media) }
  }

  public restoreFromTrash(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.is_deleted = false; this.saveMediaMetadata(media) }
  }

  /**
   * 複数のメディアファイルを一括でゴミ箱へ移動/復元する
   */
  public moveMediaFilesToTrash(ids: number[], isDeleted: boolean) {
    let changed = false
    ids.forEach(id => {
      const media = this.db.mediaFiles.find(m => m.id === id)
      if (media && media.is_deleted !== isDeleted) {
        media.is_deleted = isDeleted
        changed = true
        this.saveMediaMetadata(media) // Loop save? Optimization opportunity but safe for now.
      }
    })
  }

  public async deletePermanently(id: number) {
    // 既存の単一削除も一括削除メソッドを利用するように変更して共通化可能だが、
    // まずは確実に動作する一括削除メソッドを実装する
    await this.deleteMediaFilesPermanently([id])
  }

  /**
   * 複数のメディアファイルを一括で完全に削除する
   */
  public async deleteMediaFilesPermanently(ids: number[]) {
    if (ids.length === 0) return

    // 削除対象のメディア情報を先に取得しておく
    const targets = this.db.mediaFiles.filter(m => ids.includes(m.id))

    // DBから即座に削除することで、後続の同一IDに対する操作を防ぐ（競合対策）
    this.db.mediaFiles = this.db.mediaFiles.filter(m => !ids.includes(m.id))
    this.db.mediaTags = this.db.mediaTags.filter((mt) => !ids.includes(mt.mediaId))
    this.db.mediaFolders = this.db.mediaFolders.filter((mg) => !ids.includes(mg.mediaId))
    // Saved by file deletion below (metadata file gone). 
    // But we should probably explicitly update other files if needed?
    // No, dispersed means deletions are file removals.

    // 物理ファイルの削除（非同期）
    for (const media of targets) {
      try {
        const filePath = media.file_path
        const dirPath = path.dirname(filePath)
        const parentDirName = path.basename(path.dirname(dirPath))

        if (parentDirName === 'images') {
          if (fs.existsSync(dirPath)) {
            console.log(`[Database] Deleting media directory: ${dirPath}`)
            await fs.remove(dirPath)
          }
        } else {
          if (fs.existsSync(filePath)) await fs.remove(filePath)

          const thumbDir = path.join(this.path, 'images', media.id.toString())
          if (fs.existsSync(thumbDir)) {
            console.log(`[Database] Deleting thumbnail directory: ${thumbDir}`)
            await fs.remove(thumbDir)
          }
        }
      } catch (error) {
        console.error('Failed to delete file/directory:', media.file_path, error)
      }
    }
  }

  public updateLastPlayed(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.last_played_at = new Date().toISOString(); this.saveMediaMetadata(media) }
  }

  public updateFileName(id: number, newName: string) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      try {
        const oldPath = media.file_path
        const dir = path.dirname(oldPath)
        const newPath = path.join(dir, newName)
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath)
          media.file_path = newPath
          media.file_name = newName
          this.saveMediaMetadata(media)
        } else { media.file_name = newName; this.saveMediaMetadata(media) }
      } catch (error) { console.error('Failed to rename physical file:', error); throw error }
    }
  }

  public updateArtist(id: number, artist: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.artist = artist; this.saveMediaMetadata(media) }
  }

  public updateDescription(id: number, description: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.description = description; this.saveMediaMetadata(media) }
  }

  public updateUrl(id: number, url: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.url = url; this.saveMediaMetadata(media) }
  }


  public async refreshLibraryMetadata(onProgress?: (current: number, total: number) => void) {
    const total = this.db.mediaFiles.length
    let current = 0

    console.log(`[MediaLibrary] Starting library refresh. Total files: ${total}`)

    for (const media of this.db.mediaFiles) {
      if (media.is_deleted) {
        current++
        if (onProgress) onProgress(current, total)
        continue
      }

      try {
        const filePath = media.file_path
        if (!fs.existsSync(filePath)) {
          console.warn(`[MediaLibrary] File not found during refresh: ${filePath}`)
          current++
          if (onProgress) onProgress(current, total)
          continue
        }

        // 1. メタデータ再取得
        const meta = await getMediaMetadata(filePath)
        if (meta.width) media.width = meta.width
        if (meta.height) media.height = meta.height
        if (meta.duration) media.duration = meta.duration
        if (meta.artist) media.artist = meta.artist
        if (meta.description) media.description = meta.description
        if (meta.url) media.url = meta.url

        // 2. サムネイル再生成 & ドミナントカラー抽出
        const thumbDir = path.dirname(media.thumbnail_path)
        if (!fs.existsSync(thumbDir)) {
          // 古いパス構成の場合や壊れている場合のリカバリ：IDから再構築
          const uniqueId = media.uniqueId || crypto.randomBytes(6).toString('hex')
          media.uniqueId = uniqueId // 保存されていない場合は更新
          const newDestDir = path.join(this.path, 'images', uniqueId)
          await fs.ensureDir(newDestDir)
          // 古いサムネパスが無効なら新しいパスを設定
          media.thumbnail_path = path.join(newDestDir, `thumb_${media.id}.jpg`)
        }

        // パスがnullの場合は構築
        if (!media.thumbnail_path) {
          const uniqueId = media.uniqueId || crypto.randomBytes(6).toString('hex')
          media.uniqueId = uniqueId
          const newDestDir = path.join(this.path, 'images', uniqueId)
          await fs.ensureDir(newDestDir)
          media.thumbnail_path = path.join(newDestDir, `thumb_${media.id}.jpg`)
        }

        const mode = getClientConfig().thumbnailMode || 'speed'
        // createThumbnailは内部でffmpegのgetThumbnailPathを使っているが、ここで明示的にパスを渡している
        // createThumbnail(source, dest, mode)
        if (await createThumbnail(filePath, media.thumbnail_path, mode)) {
          // 3. ドミナントカラー抽出
          try {
            const color = await extractDominantColor(media.thumbnail_path)
            if (color) {
              (media as any).dominant_color = color
            }
          } catch (colorError) {
            console.error(`[MediaLibrary] Failed to extract color for ${media.file_name}`, colorError)
          }
        }

        media.modified_date = fs.statSync(filePath).mtime.toISOString()

      } catch (error) {
        console.error(`[MediaLibrary] Failed to refresh metadata for ${media.file_name}:`, error)
      }

      current++
      if (onProgress) onProgress(current, total)
      // Save individual
      this.saveMediaMetadata(media)
    }

    // this.save() // Removed monolithic save
    console.log('[MediaLibrary] Library refresh completed.')
  }

  // タグ操作
  public getAllTags() { return this.db.tags.sort((a, b) => a.name.localeCompare(b.name)) }
  public createTag(name: string) {
    const existing = this.db.tags.find((t) => t.name === name)
    if (existing) return existing
    const id = this.db.nextTagId++
    const tag = { id, name }
    this.db.tags.push(tag)
    this.saveTags()
    return tag
  }
  public deleteTag(id: number) {
    this.db.tags = this.db.tags.filter((t) => t.id !== id)
    this.db.mediaTags = this.db.mediaTags.filter((mt) => mt.tagId !== id)
    this.saveTags()
    this.db.mediaFiles.forEach(m => {
      if (m.tags) {
        const initial = m.tags.length
        m.tags = m.tags.filter((t: any) => t.id !== id)
        if (m.tags.length !== initial) this.saveMediaMetadata(m)
      }
    })
  }
  public addTagToMedia(mediaId: number, tagId: number) {
    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    const tag = this.db.tags.find(t => t.id === tagId)
    if (media && tag) {
      if (!media.tags) media.tags = []
      if (!media.tags.find((t: any) => t.id === tagId)) {
        media.tags.push(tag)
        this.db.mediaTags.push({ mediaId, tagId }) // Keep for search compatibility
        this.saveMediaMetadata(media)
      }
    }
  }

  public addTagsToMedia(mediaIds: number[], tagIds: number[]) {
    // Group updates by media
    const uniqueTags = tagIds.map(tid => this.db.tags.find(t => t.id === tid)).filter(t => t)

    for (const mediaId of mediaIds) {
      const media = this.db.mediaFiles.find(m => m.id === mediaId)
      if (media && uniqueTags.length > 0) {
        let changed = false
        if (!media.tags) media.tags = []

        uniqueTags.forEach((tag: any) => {
          if (!media.tags.find((t: any) => t.id === tag.id)) {
            media.tags.push(tag)
            this.db.mediaTags.push({ mediaId, tagId: tag.id })
            changed = true
          }
        })

        if (changed) this.saveMediaMetadata(media)
      }
    }
  }
  public removeTagFromMedia(mediaId: number, tagId: number) {
    // this.db.mediaTags = this.db.mediaTags.filter((mt) => !(mt.mediaId === mediaId && mt.tagId === tagId))
    // Update relationships and media objects
    const startLen = this.db.mediaTags.length
    this.db.mediaTags = this.db.mediaTags.filter((mt) => !(mt.mediaId === mediaId && mt.tagId === tagId))

    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    if (media && media.tags) {
      media.tags = media.tags.filter((t: any) => t.id !== tagId)
      this.saveMediaMetadata(media)
    }
  }
  public updateTagFolder(tagId: number, folderId: number | null) {
    const tag = this.db.tags.find((t) => t.id === tagId)
    if (tag) {
      tag.folderId = folderId;
      this.saveTags()
      // Need to update tags in mediaFiles?
      // Since we store COPY of tags in media.tags (full object), yes we do.
      // This is the downside of dispersed denormalized data.
      let changed = false
      this.db.mediaFiles.forEach(m => {
        if (m.tags) {
          const t = m.tags.find((mt: any) => mt.id === tagId)
          if (t) {
            t.folderId = folderId
            this.saveMediaMetadata(m)
          }
        }
      })
    }
  }

  // タグフォルダ
  public getAllTagFolders() { return this.db.tagFolders.sort((a: any, b: any) => a.name.localeCompare(b.name)) }
  public createTagFolder(name: string) {
    const existing = this.db.tagFolders.find((f: any) => f.name === name)
    if (existing) return existing
    const id = this.db.nextTagFolderId++
    const folder = { id, name }
    this.db.tagFolders.push(folder)
    this.saveFolders()
    return folder
  }
  public deleteTagFolder(id: number) {
    this.db.tagFolders = this.db.tagFolders.filter((f: any) => f.id !== id)
    this.db.tags.forEach((t) => { if (t.folderId === id) t.folderId = null })
    this.saveFolders()
    this.saveTags()
    // Need to update tags in mediaFiles?
    // Since we store COPY of tags in media.tags (full object), yes we do.
    this.db.mediaFiles.forEach(m => {
      if (m.tags) {
        let changed = false
        m.tags.forEach((t: any) => {
          if (t.folderId === id) { t.folderId = null; changed = true; }
        })
        if (changed) this.saveMediaMetadata(m)
      }
    })
  }
  public renameTagFolder(id: number, newName: string) {
    const folder = this.db.tagFolders.find((f: any) => f.id === id)
    if (folder) { folder.name = newName; this.saveFolders() }
  }

  // フォルダー (ex-Genres)
  public getAllFolders() {
    return [...this.db.folders].sort((a, b) => {
      // まずorderIndexで比較
      const orderA = a.orderIndex || 0
      const orderB = b.orderIndex || 0
      if (orderA !== orderB) return orderA - orderB
      // 同じなら名前で比較
      return a.name.localeCompare(b.name)
    })
  }
  public createFolder(name: string, parentId: number | null = null) {
    const existing = this.db.folders.find((g) => g.name === name && g.parentId === parentId)
    if (existing) return existing
    const id = this.db.nextFolderId++
    const folder = { id, name, parentId, orderIndex: 0 }
    this.db.folders.push(folder)
    this.saveFolders()
    return folder
  }
  public deleteFolder(id: number) {
    const targetId = Number(id)
    this.db.folders = this.db.folders.filter((g) => Number(g.id) !== targetId)
    this.db.mediaFolders = this.db.mediaFolders.filter((mg) => Number(mg.folderId) !== targetId)
    this.saveFolders()
    // Update media files
    this.db.mediaFiles.forEach(m => {
      if (m.folders) {
        const initial = m.folders.length
        m.folders = m.folders.filter((g: any) => g.id !== targetId)
        if (m.folders.length !== initial) this.saveMediaMetadata(m)
      }
    })
  }
  public addFolderToMedia(mediaId: number, folderId: number) {
    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    const folder = this.db.folders.find(g => g.id === folderId)
    if (media && folder) {
      if (!media.folders) media.folders = []
      if (!media.folders.find((g: any) => g.id === folderId)) {
        media.folders.push(folder)
        this.db.mediaFolders.push({ mediaId, folderId })
        this.saveMediaMetadata(media)
      }
    }
  }
  public removeFolderFromMedia(mediaId: number, folderId: number) {
    this.db.mediaFolders = this.db.mediaFolders.filter((mg) => !(mg.mediaId === mediaId && mg.folderId === folderId))
    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    if (media && media.folders) {
      media.folders = media.folders.filter((g: any) => g.id !== folderId)
      this.saveMediaMetadata(media)
    }
  }
  public renameFolder(id: number, newName: string) {
    const targetId = Number(id)
    const folder = this.db.folders.find((g) => Number(g.id) === targetId)
    if (folder) {
      folder.name = newName;
      this.saveFolders()
      // Update media
      this.db.mediaFiles.forEach(m => {
        if (m.folders) {
          const g = m.folders.find((x: any) => x.id === targetId)
          if (g) { g.name = newName; this.saveMediaMetadata(m) }
        }
      })
    }
  }
  public updateFolderStructure(updates: { id: any; parentId: any; orderIndex: number }[]) {
    updates.forEach((update) => {
      const targetId = update.id === null || update.id === undefined ? null : Number(update.id)
      const targetParentId = update.parentId === null || update.parentId === undefined ? null : Number(update.parentId)

      const folder = this.db.folders.find((g) => Number(g.id) === targetId)
      if (folder) {
        folder.parentId = targetParentId
        folder.orderIndex = Number(update.orderIndex)
      }
    })
    this.saveFolders()
  }

  // コメント
  public addComment(mediaId: number, text: string, time: number, nickname?: string) {
    const id = this.db.nextCommentId++
    const comment = { id, mediaId, text, time, nickname, createdAt: new Date().toISOString() }
    this.db.comments.push(comment)
    // Comments are now stored in metadata.json of the media
    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    if (media) {
      if (!media.comments) media.comments = []
      media.comments.push(comment)
      this.saveMediaMetadata(media)
    }
    return comment
  }
  public getComments(mediaId: number) {
    return this.db.comments.filter((c) => c.mediaId === mediaId).sort((a, b) => a.time - b.time)
  }
}

/**
 * ライブラリのリポジトリ
 */
class LibraryRegistry {
  private instances: Map<string, MediaLibrary> = new Map()

  public getLibrary(libraryPath: string): MediaLibrary {
    if (!this.instances.has(libraryPath)) {
      this.instances.set(libraryPath, new MediaLibrary(libraryPath))
    }
    return this.instances.get(libraryPath)!
  }

  // メモリ節約のため、使われていないインスタンスをクリーンアップする仕組みが将来的に必要かも
}

export const libraryRegistry = new LibraryRegistry()

// 後方互換性のためのデフォルトインスタンス管理
let activeLibraryPath: string | null = null

export function initDatabase() {
  loadLibrariesConfig()
  activeLibraryPath = librariesConfig.activeLibraryPath
  console.log('Database initialized')
  console.log('Active library:', activeLibraryPath)
}

// アクティブライブラリ取得ヘルパー
export function getActiveMediaLibrary(): MediaLibrary | null {
  if (!activeLibraryPath) return null
  return libraryRegistry.getLibrary(activeLibraryPath)
}

// ライブラリリスト操作
export const libraryDB = {
  createLibrary(name: string, parentPath: string) {
    const libraryPath = path.join(parentPath, `${name}.library`)
    if (!fs.existsSync(libraryPath)) fs.mkdirSync(libraryPath, { recursive: true })

    const library = { name, path: libraryPath, createdAt: new Date().toISOString() }
    librariesConfig.libraries.push(library)
    this.setActiveLibrary(libraryPath)
    return library
  },
  addLibraryPath(libraryPath: string) {
    if (!fs.existsSync(libraryPath)) throw new Error('Library directory not found')
    const existing = librariesConfig.libraries.find(l => l.path === libraryPath)
    if (existing) { this.setActiveLibrary(libraryPath); return existing }

    const name = path.basename(libraryPath).replace(/\.library$/i, '')
    const library = { name, path: libraryPath, createdAt: new Date().toISOString() }
    librariesConfig.libraries.push(library)
    this.setActiveLibrary(libraryPath)
    return library
  },
  getLibraries() { return librariesConfig.libraries },
  setActiveLibrary(libraryPath: string) {
    activeLibraryPath = libraryPath
    librariesConfig.activeLibraryPath = libraryPath
    saveLibrariesConfig()
  },
  getActiveLibrary() {
    if (!activeLibraryPath) return null
    return librariesConfig.libraries.find(lib => lib.path === activeLibraryPath) || null
  },
  getLibraryName() {
    const lib = this.getActiveLibrary()
    return lib ? lib.name : 'Unknown Library'
  },
}

// プロキシオブジェクト
// 既存のコードがメディア、タグなどの操作を直接インポートしているため、
// 内部で getActiveMediaLibrary() を使用する形で維持する。

export const mediaDB = {
  importMediaFiles: (paths: string[]) => getActiveMediaLibrary()?.importMediaFiles(paths) || Promise.resolve([]),
  addMediaFile: (path: string, name: string, type: string, opts: any) => getActiveMediaLibrary()?.addMediaFile(path, name, type, opts),
  updateRating: (id: number, val: number) => getActiveMediaLibrary()?.updateRating(id, val),
  getVideosMissingMetadata: () => getActiveMediaLibrary()?.getVideosMissingMetadata() || [],
  updateVideoMetadata: (id: number, w: number, h: number, d: number) => getActiveMediaLibrary()?.updateVideoMetadata(id, w, h, d),
  get: (id: number) => getActiveMediaLibrary()?.get(id),
  getAllMediaFiles: () => getActiveMediaLibrary()?.getAllMediaFiles() || [],
  getMediaFileWithDetails: (id: number) => getActiveMediaLibrary()?.getMediaFileWithDetails(id) || null,
  updateThumbnail: (id: number, path: string) => getActiveMediaLibrary()?.updateThumbnail(id, path),
  moveToTrash: (id: number) => getActiveMediaLibrary()?.moveToTrash(id),
  restoreFromTrash: (id: number) => getActiveMediaLibrary()?.restoreFromTrash(id),
  deletePermanently: (id: number) => getActiveMediaLibrary()?.deletePermanently(id) || Promise.resolve(),
  updateLastPlayed: (id: number) => getActiveMediaLibrary()?.updateLastPlayed(id),
  updateFileName: (id: number, name: string) => getActiveMediaLibrary()?.updateFileName(id, name),
  updateArtist: (id: number, artist: string | null) => getActiveMediaLibrary()?.updateArtist(id, artist),
  updateDescription: (id: number, desc: string | null) => getActiveMediaLibrary()?.updateDescription(id, desc),
  updateUrl: (id: number, url: string | null) => getActiveMediaLibrary()?.updateUrl(id, url),
  moveMediaFilesToTrash: (ids: number[], isDeleted: boolean) => getActiveMediaLibrary()?.moveMediaFilesToTrash(ids, isDeleted),
  deleteMediaFilesPermanently: (ids: number[]) => getActiveMediaLibrary()?.deleteMediaFilesPermanently(ids) || Promise.resolve(),
  updateDominantColor: (id: number, color: string) => getActiveMediaLibrary()?.updateDominantColor(id, color),
  refreshLibraryMetadata: (onProgress: (c: number, t: number) => void) => getActiveMediaLibrary()?.refreshLibraryMetadata(onProgress) || Promise.resolve(),
}

export const tagDB = {
  getAllTags: () => getActiveMediaLibrary()?.getAllTags() || [],
  createTag: (name: string) => getActiveMediaLibrary()?.createTag(name),
  deleteTag: (id: number) => getActiveMediaLibrary()?.deleteTag(id),
  addTagToMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.addTagToMedia(mId, tId),
  addTagsToMedia: (mIds: number[], tIds: number[]) => getActiveMediaLibrary()?.addTagsToMedia(mIds, tIds),
  removeTagFromMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.removeTagFromMedia(mId, tId),
  updateTagFolder: (tId: number, fId: number | null) => getActiveMediaLibrary()?.updateTagFolder(tId, fId),
}

export const tagFolderDB = {
  getAllTagFolders: () => getActiveMediaLibrary()?.getAllTagFolders() || [],
  createTagFolder: (name: string) => getActiveMediaLibrary()?.createTagFolder(name),
  deleteTagFolder: (id: number) => getActiveMediaLibrary()?.deleteTagFolder(id),
  renameTagFolder: (id: number, name: string) => getActiveMediaLibrary()?.renameTagFolder(id, name),
}

export const folderDB = {
  getAllFolders: () => getActiveMediaLibrary()?.getAllFolders() || [],
  createFolder: (name: string, pId: number | null) => getActiveMediaLibrary()?.createFolder(name, pId),
  deleteFolder: (id: number) => getActiveMediaLibrary()?.deleteFolder(id),
  addFolderToMedia: (mId: number, fId: number) => getActiveMediaLibrary()?.addFolderToMedia(mId, fId),
  removeFolderFromMedia: (mId: number, fId: number) => getActiveMediaLibrary()?.removeFolderFromMedia(mId, fId),
  renameFolder: (id: number, name: string) => getActiveMediaLibrary()?.renameFolder(id, name),
  updateFolderStructure: (updates: any) => getActiveMediaLibrary()?.updateFolderStructure(updates),
}

export const commentDB = {
  addComment: (mediaId: number, text: string, time: number) => getActiveMediaLibrary()?.addComment(mediaId, text, time),
  getComments: (mediaId: number) => getActiveMediaLibrary()?.getComments(mediaId) || [],
}
