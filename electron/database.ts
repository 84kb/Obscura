import path from 'path'
import { app, shell } from 'electron'
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
  tagGroups: any[]
  folders: any[]
  mediaTags: { mediaId: number; tagId: number }[]
  mediaFolders: { mediaId: number; folderId: number }[] // Renamed from mediaGenres
  comments: any[]
  auditLogs: any[]
  nextMediaId: number
  nextTagId: number
  nextTagGroupId: number
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
  private foldersPath: string
  private tagGroupsPath: string // Was foldersPath (now storing TagGroups)
  private auditLogsPath: string
  private currentOperator: string = 'System'
  private db: Database
  private importQueue: Promise<any> = Promise.resolve()

  constructor(libraryPath: string) {
    this.path = libraryPath
    this.dbPath = path.join(libraryPath, 'database.json')
    this.tagsPath = path.join(libraryPath, 'tags.json')
    this.foldersPath = path.join(libraryPath, 'folders.json') // Stores "Folders" (ex-Genres)
    this.tagGroupsPath = path.join(libraryPath, 'tag_folders.json') // Stores "TagGroups"
    this.auditLogsPath = path.join(libraryPath, 'audit_logs.json')

    this.db = {
      mediaFiles: [],
      tags: [],
      tagGroups: [],
      folders: [],
      mediaTags: [],
      mediaFolders: [],
      comments: [],
      auditLogs: [],
      nextMediaId: 1,
      nextTagId: 1,
      nextTagGroupId: 1,
      nextFolderId: 1,
      nextCommentId: 1,
    }
    this.load()
  }

  private load() {
    try {
      // 0. Legacy Migration (Removed)
      // Genres are fully migrated to Folders.

      // 1. Check for legacy database and migrate if needed
      if (fs.existsSync(this.dbPath) && !fs.existsSync(this.tagsPath)) {
        console.log('[MediaLibrary] Legacy database found. Starting migration...')
        this.migrateFromLegacyDatabase()
        console.log('[MediaLibrary] Migration completed.')
      }

      // 2. Load global metadata
      if (fs.existsSync(this.tagsPath)) this.db.tags = fs.readJsonSync(this.tagsPath)
      if (fs.existsSync(this.tagGroupsPath)) this.db.tagGroups = fs.readJsonSync(this.tagGroupsPath)
      if (fs.existsSync(this.foldersPath)) this.db.folders = fs.readJsonSync(this.foldersPath)
      if (fs.existsSync(this.auditLogsPath)) this.db.auditLogs = fs.readJsonSync(this.auditLogsPath)

      // 2.5 Migration: Rename folderId to groupId in Tags
      if (this.db.tags) {
        let tagsChanged = false
        this.db.tags.forEach((t: any) => {
          if (t.folderId !== undefined && t.groupId === undefined) {
            t.groupId = t.folderId
            delete t.folderId
            tagsChanged = true
          }
        })
        if (tagsChanged) this.saveTags()
      }

      // 3. Load media files metadata from dispersed files
      this.db.mediaFiles = []
      this.db.mediaTags = []
      this.db.mediaFolders = []
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
                // Migration for tags inside media
                if (meta.tags) {
                  let mediaTagsChanged = false
                  meta.tags.forEach((t: any) => {
                    if (t.folderId !== undefined && t.groupId === undefined) {
                      t.groupId = t.folderId
                      delete t.folderId
                      mediaTagsChanged = true
                    }
                  })
                  if (mediaTagsChanged) {
                    fs.writeJsonSync(metaPath, meta, { spaces: 2 })
                  }
                }
                this.db.mediaFiles.push(meta)
                // Reconstruct IDs counters if needed (basic max logic)
                this.db.nextMediaId = Math.max(this.db.nextMediaId, meta.id + 1)

                // Restore tags/genres/comments relationships from embedded data if it exists
                // Note: The new design keeps them in metadata.json, so we parse them out to in-memory relations if needed
                // However, for the app to work with existing structure `mediaTags`, we might need to populate them on load
                // Restore tags/genres/comments relationships from embedded data if it exists
                // Note: The new design keeps them in metadata.json, so we parse them out to in-memory relations if needed
                if (meta.tags && Array.isArray(meta.tags)) {
                  meta.tags.forEach((t: any) => {
                    const tId = typeof t === 'object' ? t.id : t
                    this.db.mediaTags.push({ mediaId: meta.id, tagId: tId })
                  })
                }
                if (meta.folders && Array.isArray(meta.folders)) {
                  meta.folders.forEach((f: any) => {
                    const fId = typeof f === 'object' ? f.id : f
                    this.db.mediaFolders.push({ mediaId: meta.id, folderId: fId })
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

    // Initialize counters based on loaded data
    if (this.db.mediaFiles.length > 0) {
      this.db.nextMediaId = Math.max(...this.db.mediaFiles.map(m => m.id)) + 1
    }
    // Tag, Folder, TagGroup use random IDs now, so no need to init counters for them.

    if (this.db.comments.length > 0) {
      this.db.nextCommentId = Math.max(...this.db.comments.map(c => c.id)) + 1
    }
    console.log(`[MediaLibrary] Counters initialized: Media=${this.db.nextMediaId}`)
  }

  private migrateFromLegacyDatabase() {
    try {
      const legacyData = fs.readJsonSync(this.dbPath)

      // 1. Save globals
      this.db.tags = legacyData.tags || []
      this.db.tagGroups = legacyData.tagGroups || legacyData.tagFolders || []
      this.db.folders = legacyData.genres || [] // Migrate genres to folders

      this.saveTags()
      this.saveTagGroups() // Was saveFolders() for tagGroups
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
  private saveTagGroups() { // Renamed from saveFolders to avoid confusion
    fs.writeJsonSync(this.tagGroupsPath, this.db.tagGroups, { spaces: 2 })
  }
  private saveFolders() { // Renamed from saveGenres
    fs.writeJsonSync(this.foldersPath, this.db.folders, { spaces: 2 })
  }
  private saveAuditLogs() {
    fs.writeJsonSync(this.auditLogsPath, this.db.auditLogs, { spaces: 2 })
  }

  private saveMediaMetadata(media: any) {
    if (!media.uniqueId) return // Should throw?
    const dirPath = path.join(this.path, 'images', media.uniqueId)
    fs.ensureDirSync(dirPath)
    const metaPath = path.join(dirPath, 'metadata.json')

    // We dump the whole object including joined tags/genres/comments
    fs.writeJsonSync(metaPath, media, { spaces: 2 })
  }

  public addAuditLog(entry: {
    action: string,
    targetId?: number | string,
    targetName: string,
    description: string,
    details?: any,
    userId?: string,
    userNickname?: string
  }) {
    const logEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userNickname: entry.userNickname || this.currentOperator,
      ...entry
    }
    this.db.auditLogs.unshift(logEntry)
    // ログが多くなりすぎないように制限（例: 2000件）
    if (this.db.auditLogs.length > 2000) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 2000)
    }
    this.saveAuditLogs()
  }

  public setCurrentOperator(nickname: string) {
    this.currentOperator = nickname || 'System'
  }

  public getAuditLogs() {
    return this.db.auditLogs
  }

  // メディア操作
  public async importMediaFiles(filePaths: string[], onProgress?: (data: { current: number, total: number, fileName: string, step: string, percentage: number }) => void, options: { checkDuplicates?: boolean } = {}) {
    return (this.importQueue = this.importQueue.then(async () => {
      // 1. 重複チェック (オプション有効時)
      let filesToImport = filePaths
      if (options.checkDuplicates) {
        // 重複チェック (厳密モード: 名前+サイズ)
        const duplicates = await this.checkDuplicates(filePaths, true)
        if (duplicates.length > 0) {
          console.log(`[MediaLibrary] Found ${duplicates.length} duplicates. Skipping...`)
          // 重複しているファイルを除外
          const duplicatePaths = new Set(duplicates.map(d => d.newFile.path))
          filesToImport = filePaths.filter(p => !duplicatePaths.has(p))

          // 全て重複の場合は終了
          if (filesToImport.length === 0) {
            console.log('[MediaLibrary] All files were duplicates. Import skipped.')
            return []
          }
        }
      }

      const importedFiles = []
      const totalFiles = filesToImport.length
      console.log(`[MediaLibrary] Batch import started: ${totalFiles} files. Queueing...`)

      for (let i = 0; i < totalFiles; i++) {
        const srcPath = filesToImport[i]
        const currentFileIndex = i + 1

        const report = (step: string, subStepWeight: number) => {
          if (onProgress) {
            // total percentage = (completed_files / total) + (current_file_progress / total)
            // subStepWeight: 0 (start), 0.2 (moved), 0.4 (meta), 0.8 (thumb), 1.0 (done)
            const fileBaseProgress = i / totalFiles
            const currentFileProgress = subStepWeight / totalFiles
            const percentage = Math.round((fileBaseProgress + currentFileProgress) * 100)
            onProgress({
              current: currentFileIndex,
              total: totalFiles,
              fileName: path.basename(srcPath),
              step,
              percentage
            })
          }
        }

        try {
          if (!fs.existsSync(srcPath)) {
            console.warn(`[MediaLibrary] Source file not found, skipping: ${srcPath}`)
            continue
          }
          const ext = path.extname(srcPath).toLowerCase()
          if (!['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma'].includes(ext)) {
            console.warn(`[MediaLibrary] Unsupported extension, skipping: ${srcPath}`)
            continue
          }

          let fileName = path.basename(srcPath)
          // ファイル名のサニタイズ
          fileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
          if (fileName.length > 200) {
            const namePart = path.parse(fileName).name.substring(0, 150)
            fileName = namePart + ext
          }

          report('Starting...', 0)

          const fileType = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma'].includes(ext) ? 'audio' : 'video'

          // IDの整合性チェック
          if (isNaN(this.db.nextMediaId) || this.db.nextMediaId <= 0) {
            console.warn(`[MediaLibrary] Invalid nextMediaId detected (${this.db.nextMediaId}). Resetting...`)
            this.db.nextMediaId = (this.db.mediaFiles.length > 0) ? Math.max(...this.db.mediaFiles.map(m => m.id)) + 1 : 1
          }

          const id = this.db.nextMediaId++
          const uniqueId = crypto.randomBytes(6).toString('hex')
          const destDir = path.join(this.path, 'images', uniqueId)

          console.log(`[MediaLibrary] [Step 1/5] Starting import ${id}: ${fileName}`)

          await fs.ensureDir(destDir)
          const destPath = path.join(destDir, fileName)

          // 移動/コピー処理 (タイムアウト10分)
          console.log(`[MediaLibrary] [Step 2/5] Moving file to library...`)
          report('Moving...', 0.1)
          await Promise.race([
            fs.move(srcPath, destPath, { overwrite: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('File move timeout (600s)')), 600000))
          ])

          const stats = fs.statSync(destPath)
          console.log(`[MediaLibrary] [Step 3/5] Extracting metadata...`)
          report('Metadata...', 0.3)
          const { width, height, duration, artist, description, url } = await getMediaMetadata(destPath)
          const artists: string[] = []

          const metadata = {
            id, uniqueId, file_path: destPath, file_name: fileName, file_type: fileType,
            file_size: stats.size, duration, width, height, rating: 0,
            created_date: stats.birthtime.toISOString(), modified_date: stats.mtime.toISOString(),
            thumbnail_path: null as string | null, created_at: new Date().toISOString(), is_deleted: false,
            last_played_at: null, artist, artists, description, url, dominant_color: null as string | null,
            tags: [], folders: [], comments: []
          }

          console.log(`[MediaLibrary] [Step 4/5] Generating thumbnail...`)
          report('Thumbnail...', 0.5)
          try {
            const thumbPath = await getThumbnailPath(this.path, id, destPath)
            const mode = getClientConfig().thumbnailMode || 'speed'
            if (await createThumbnail(destPath, thumbPath, mode)) {
              metadata.thumbnail_path = thumbPath

              console.log(`[MediaLibrary] [Step 5/5] Extracting dominant color...`)
              report('Color...', 0.8)
              try {
                const color = await extractDominantColor(thumbPath)
                if (color) metadata.dominant_color = color
              } catch (e) { console.error(`Failed to extract color:`, e) }
            }
          } catch (e) { console.error(`Failed to generate thumbnail:`, e) }

          this.db.mediaFiles.push(metadata)
          this.saveMediaMetadata(metadata)
          importedFiles.push(metadata)

          this.addAuditLog({
            action: 'media_import',
            targetId: id,
            targetName: fileName,
            description: `メディアをインポートしました: ${fileName}`
          })

          report('Done', 1.0)
          console.log(`[MediaLibrary] Import completed: ${id} (${fileName})`)
        } catch (error) {
          console.error(`[MediaLibrary] Failed to import: ${srcPath}`, error)
        }
      }
      return importedFiles
    })).catch(e => {
      console.error("[MediaLibrary] Critical Queue Error:", e)
      return []
    })
  }

  public async checkDuplicates(filePaths: string[], strict: boolean = false) {
    const duplicates = []

    for (const srcPath of filePaths) {
      if (!fs.existsSync(srcPath)) continue
      const stats = fs.statSync(srcPath)
      const fileName = path.basename(srcPath)

      // サイズが一致するファイルを探す
      // strict=true の場合はファイル名も一致する必要がある
      const existing = this.db.mediaFiles.find(m => {
        const sizeMatch = m.file_size === stats.size
        const nameMatch = m.file_name === fileName
        const notDeleted = !m.is_deleted

        if (strict) {
          return sizeMatch && nameMatch && notDeleted
        } else {
          return sizeMatch && notDeleted
        }
      })

      if (existing) {
        duplicates.push({
          newFile: {
            path: srcPath,
            name: fileName,
            size: stats.size,
            btime: stats.birthtime,
            mtime: stats.mtime
          },
          existing
        })
      }
    }
    return duplicates
  }

  /**
   * インポート済みのメディアIDに対して重複をチェックする
   */
  public getDuplicatesForMedia(mediaId: number) {
    const target = this.db.mediaFiles.find(m => m.id === mediaId)
    if (!target || target.is_deleted) return []

    // 自分以外の同じサイズのファイルを探す
    const matches = this.db.mediaFiles.filter(m =>
      m.id !== mediaId &&
      m.file_size === target.file_size &&
      !m.is_deleted
    )

    return matches.map(existing => ({
      newMedia: target,
      existingMedia: existing
    }))
  }

  /**
   * ライブラリ内の重複ファイルを一括検索する
   * Criteriaに基づいて一致するグループを返す
   */
  public async findLibraryDuplicates(criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }) {
    const groups: { [key: string]: any[] } = {}

    // デフォルトは厳密モード (互換性のため)
    // 実際にはUIから必ずcriteriaが渡されるはず
    const useName = criteria ? criteria.name : true
    const useSize = criteria ? criteria.size : true
    const useDuration = criteria ? criteria.duration : false
    const useModified = criteria ? criteria.modified : false

    // 1. グループ化
    for (const media of this.db.mediaFiles) {
      if (media.is_deleted) continue

      const parts = []
      if (useName) parts.push(media.file_name)
      if (useSize) parts.push(media.file_size)
      if (useDuration) parts.push(media.duration || 0) // durationがない場合は0として扱う
      if (useModified) {
        // ミリ秒単位まで一致するか確認 (ISO文字列)
        parts.push(media.modified_date)
      }

      // 条件が一つも指定されていない場合はスキップ（あるいは全件マッチしてしまうのを防ぐ）
      if (parts.length === 0) continue

      const key = parts.join('_')

      if (!groups[key]) groups[key] = []
      groups[key].push(media)
    }

    // 2. 重複のみ抽出
    const duplicateGroups = Object.values(groups).filter(group => group.length > 1)
    return duplicateGroups
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
      dominant_color: null, tags: [], folders: [], comments: [], parentId: null // Renamed genres -> folders
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
    if (media) {
      media.rating = rating;
      this.saveMediaMetadata(media)
      this.addAuditLog({
        action: 'media_update_rating',
        targetId: id,
        targetName: media.file_name,
        description: `評価を ${rating} に更新しました: ${media.file_name}`,
        details: { rating }
      })
    }
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
    const tagMap = new Map(this.db.tags.map(t => [t.id, t]))
    const folderMap = new Map(this.db.folders.map(f => [f.id, f]))
    const mediaMap = new Map(this.db.mediaFiles.map(m => [m.id, m]))

    // Media -> Tags pre-index
    const mediaTagsMap = new Map<number, any[]>()
    this.db.mediaTags.forEach(mt => {
      if (!mediaTagsMap.has(mt.mediaId)) mediaTagsMap.set(mt.mediaId, [])
      const tag = tagMap.get(mt.tagId)
      if (tag) mediaTagsMap.get(mt.mediaId)!.push(tag)
    })

    // Media -> Folders pre-index
    const mediaFoldersMap = new Map<number, any[]>()
    this.db.mediaFolders.forEach(mf => {
      if (!mediaFoldersMap.has(mf.mediaId)) mediaFoldersMap.set(mf.mediaId, [])
      const folder = folderMap.get(mf.folderId)
      if (folder) mediaFoldersMap.get(mf.mediaId)!.push(folder)
    })

    // Media -> Children pre-index (Shallow)
    const childrenMap = new Map<number, any[]>()
    this.db.mediaFiles.forEach(m => {
      if (m.parentId) {
        if (!childrenMap.has(m.parentId)) childrenMap.set(m.parentId, [])
        childrenMap.get(m.parentId)!.push({
          id: m.id,
          title: m.title,
          file_name: m.file_name,
          thumbnail_path: m.thumbnail_path
        })
      }
    })

    return this.db.mediaFiles.map((media) => {
      const tags = mediaTagsMap.get(media.id) || []
      const folders = mediaFoldersMap.get(media.id) || []

      // Resolve Parent (Shallow representation to avoid cycles/heavy payload)
      let parent = null
      if (media.parentId) {
        const p = mediaMap.get(media.parentId)
        if (p) {
          parent = {
            id: p.id,
            title: p.title,
            file_name: p.file_name,
            thumbnail_path: p.thumbnail_path
          }
        }
      }
      const children = childrenMap.get(media.id) || []

      return { ...media, tags, folders, parent, children }
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

    // Resolve Parent
    let parent = null
    if (media.parentId) {
      parent = this.db.mediaFiles.find(m => m.id === media.parentId)
      // Avoid infinite recursion if circular dependency exists (though UI prevents it, safety first)
      // Simple object return is fine here as we are not deeply nesting.
    }

    // Resolve Children
    const children = this.db.mediaFiles.filter(m => m.parentId === id)

    return { ...media, tags, folders, comments, parent, children } // Renamed genres -> folders
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
    ids.forEach(id => {
      const media = this.db.mediaFiles.find(m => m.id === id)
      if (media && media.is_deleted !== isDeleted) {
        media.is_deleted = isDeleted
        this.saveMediaMetadata(media)

        this.addAuditLog({
          action: isDeleted ? 'media_trash' : 'media_restore',
          targetId: id,
          targetName: media.file_name,
          description: isDeleted ? `ゴミ箱に移動しました: ${media.file_name}` : `ゴミ箱から元に戻しました: ${media.file_name}`
        })
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

    // 物理ファイルの削除（非同期でゴミ箱へ）
    for (const media of targets) {
      try {
        const filePath = media.file_path
        const dirPath = path.dirname(filePath)
        const parentDirName = path.basename(path.dirname(dirPath))

        if (parentDirName === 'images') {
          if (fs.existsSync(dirPath)) {
            console.log(`[Database] Trashing media directory: ${dirPath}`)
            await shell.trashItem(dirPath)
          }
        } else {
          // 個別ファイルの場合（レガシー互換など）
          if (fs.existsSync(filePath)) {
            console.log(`[Database] Trashing media file: ${filePath}`)
            await shell.trashItem(filePath)
          }

          const thumbDir = path.join(this.path, 'images', media.id.toString())
          if (fs.existsSync(thumbDir)) {
            console.log(`[Database] Deleting thumbnail directory (direct remove): ${thumbDir}`)
            await fs.remove(thumbDir)
          }
        }

        this.addAuditLog({
          action: 'media_delete_permanent',
          targetId: media.id,
          targetName: media.file_name,
          description: `ファイルを完全に削除しました: ${media.file_name}`
        })
      } catch (error) {
        console.error('Failed to move to trash:', media.file_path, error)
      }
    }
  }

  public updateLastPlayed(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.last_played_at = new Date().toISOString();
      this.saveMediaMetadata(media)
      // 非表示（再生履歴はログに残さない方が良い場合が多いが、必要なら追加可能）
    }
  }

  public updateFileName(id: number, newName: string) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      // Check for invalid filename characters (excluding extension if preserved by logic, but newName includes it)
      // Invalid chars in Windows: < > : " / \ | ? *
      const invalidChars = /[<>:"/\\|?*]/

      if (invalidChars.test(newName)) {
        console.log(`[MediaLibrary] Invalid characters detected in "${newName}". Updating title instead of renaming file.`)
        // 拡張子を除去してタイトルにする
        const ext = path.extname(media.file_name)
        let titleName = newName
        // 拡張子を確実に除去(大文字小文字を区別しない)
        if (ext && titleName.toLowerCase().endsWith(ext.toLowerCase())) {
          titleName = titleName.substring(0, titleName.length - ext.length)
        }
        // 念のため、空白をトリム
        media.title = titleName.trim() || null // Set the virtual name
        this.saveMediaMetadata(media)
        return media // Return updated media
      }

      try {
        const oldPath = media.file_path
        const dir = path.dirname(oldPath)
        const newPath = path.join(dir, newName)
        const oldName = media.file_name
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath)
          media.file_path = newPath
          media.file_name = newName
          media.title = null
          this.saveMediaMetadata(media)
        } else {
          media.file_name = newName
          media.title = null
          this.saveMediaMetadata(media)
        }

        this.addAuditLog({
          action: 'media_rename',
          targetId: id,
          targetName: newName,
          description: `ファイル名を変更しました: ${oldName} -> ${newName}`,
          details: { oldName, newName }
        })

        return media // Return updated media
      } catch (error) { console.error('Failed to rename physical file:', error); throw error }
    }
    return null
  }

  public updateArtist(id: number, artist: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.artist = artist;
      this.saveMediaMetadata(media)
      this.addAuditLog({
        action: 'media_update_artist',
        targetId: id,
        targetName: media.file_name,
        description: `投稿者を "${artist || '設定なし'}" に更新しました: ${media.file_name}`
      })
    }
  }

  public updateDescription(id: number, description: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.description = description;
      this.saveMediaMetadata(media)
      this.addAuditLog({
        action: 'media_update_description',
        targetId: id,
        targetName: media.file_name,
        description: `説明を更新しました: ${media.file_name}`
      })
    }
  }

  public updateUrl(id: number, url: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.url = url;
      this.saveMediaMetadata(media)
      this.addAuditLog({
        action: 'media_update_url',
        targetId: id,
        targetName: media.file_name,
        description: `URLを更新しました: ${media.file_name}`
      })
    }
  }

  public updateParentId(childId: number, parentId: number | null) {
    const media = this.db.mediaFiles.find((m) => m.id === childId)
    if (media) {
      // Prevent self-referencing
      if (parentId === childId) return

      // Prevent circular dependency (Simple check: direct parent)
      if (parentId) {
        const parent = this.db.mediaFiles.find(m => m.id === parentId)
        if (parent && parent.parentId === childId) return // Direct circle
      }

      media.parentId = parentId
      this.saveMediaMetadata(media)
    }
  }

  public searchMedia(query: string, targets?: any) {
    if (!query) return []
    const q = query.toLowerCase()

    // Default to searching by title/file_name if no targets specified
    const searchTargets = targets || { name: true }

    // Exclude deleted files, limit results for performance
    return this.getAllMediaFiles()
      .filter(m => {
        if (m.is_deleted) return false

        const matchName = searchTargets.name && (
          (m.file_name && m.file_name.toLowerCase().includes(q)) ||
          (m.title && m.title.toLowerCase().includes(q))
        )
        const matchArtist = searchTargets.artist && m.artist && m.artist.toLowerCase().includes(q)
        const matchDescription = searchTargets.description && m.description && m.description.toLowerCase().includes(q)
        const matchFolder = searchTargets.folder && m.folders && m.folders.some((f: any) => f.name.toLowerCase().includes(q))
        const matchTags = searchTargets.tags && m.tags && m.tags.some((t: any) => t.name.toLowerCase().includes(q))

        return matchName || matchArtist || matchDescription || matchFolder || matchTags
      })
      .slice(0, 50)
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

  // ヘルパー: ランダムなユニークIDを生成 (1 ~ 1,000,000,000)
  private generateUniqueId(existingItems: { id: number }[]): number {
    let id: number
    do {
      id = Math.floor(Math.random() * 1000000000) + 1
    } while (existingItems.some(item => item.id === id))
    return id
  }

  // タグ操作
  public getAllTags() { return this.db.tags.sort((a, b) => a.name.localeCompare(b.name)) }
  public createTag(name: string) {
    const existing = this.db.tags.find((t) => t.name === name)
    if (existing) return existing

    // ランダムID生成
    const id = this.generateUniqueId(this.db.tags)
    const tag = { id, name }
    this.db.tags.push(tag)
    this.saveTags()

    this.addAuditLog({
      action: 'tag_create',
      targetId: id,
      targetName: name,
      description: `タグを作成しました: ${name}`
    })

    return tag
  }
  public deleteTag(id: number) {
    const tag = this.db.tags.find(t => t.id === id)
    const tagName = tag ? tag.name : 'Unknown'

    this.db.tags = this.db.tags.filter((t) => t.id !== id)
    this.db.mediaTags = this.db.mediaTags.filter((mt) => mt.tagId !== id)
    this.saveTags()

    this.addAuditLog({
      action: 'tag_delete',
      targetId: id,
      targetName: tagName,
      description: `タグを削除しました: ${tagName}`
    })
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

        this.addAuditLog({
          action: 'media_add_tag',
          targetId: mediaId,
          targetName: media.file_name,
          description: `タグを追加しました: ${tag.name} - ${media.file_name}`
        })
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

        if (changed) {
          this.saveMediaMetadata(media)
          this.addAuditLog({
            action: 'media_add_tags_batch',
            targetId: mediaId,
            targetName: media.file_name,
            description: `タグを一括追加しました (${uniqueTags.length}件): ${media.file_name}`
          })
        }
      }
    }
  }
  public removeTagFromMedia(mediaId: number, tagId: number) {
    const mId = Number(mediaId)
    const tId = Number(tagId)

    // Update relationships and media objects
    this.db.mediaTags = this.db.mediaTags.filter((mt) => !(mt.mediaId === mId && mt.tagId === tId))

    const media = this.db.mediaFiles.find(m => m.id === mId)
    if (media) {
      if (media.tags) {
        media.tags = media.tags.filter((t: any) => {
          const id = typeof t === 'object' ? t.id : t
          return id !== tId
        })
      }
      this.saveMediaMetadata(media)
    }
  }
  public updateTagGroup(tagId: number, groupId: number | null) {
    const tag = this.db.tags.find((t) => t.id === tagId)
    if (tag) {
      tag.groupId = groupId;
      this.saveTags()
      // Need to update tags in mediaFiles?
      // Since we store COPY of tags in media.tags (full object), yes we do.
      // This is the downside of dispersed denormalized data.
      this.db.mediaFiles.forEach(m => {
        if (m.tags) {
          const t = m.tags.find((mt: any) => mt.id === tagId)
          if (t) {
            t.groupId = groupId
            this.saveMediaMetadata(m)
          }
        }
      })
    }
  }

  // タググループ
  public getAllTagGroups() { return this.db.tagGroups.sort((a: any, b: any) => a.name.localeCompare(b.name)) }
  public createTagGroup(name: string) {
    const existing = this.db.tagGroups.find((f: any) => f.name === name)
    if (existing) return existing

    // ランダムID生成
    const id = this.generateUniqueId(this.db.tagGroups)
    const group = { id, name }
    this.db.tagGroups.push(group)
    this.saveTagGroups() // Fixed: saveTagGroups

    this.addAuditLog({
      action: 'tag_group_create',
      targetId: id,
      targetName: name,
      description: `タググループを作成しました: ${name}`
    })

    return group
  }
  public deleteTagGroup(id: number) {
    const group = this.db.tagGroups.find(g => g.id === id)
    const groupName = group ? group.name : 'Unknown'

    this.db.tagGroups = this.db.tagGroups.filter((f: any) => f.id !== id)
    this.db.tags.forEach((t) => { if (t.groupId === id) t.groupId = null })
    this.saveTagGroups() // Fixed: saveTagGroups
    this.saveTags()

    this.addAuditLog({
      action: 'tag_group_delete',
      targetId: id,
      targetName: groupName,
      description: `タググループを削除しました: ${groupName}`
    })
    // Need to update tags in mediaFiles?
    // Since we store COPY of tags in media.tags (full object), yes we do.
    this.db.mediaFiles.forEach(m => {
      if (m.tags) {
        let changed = false
        m.tags.forEach((t: any) => {
          if (t.groupId === id) { t.groupId = null; changed = true; }
        })
        if (changed) this.saveMediaMetadata(m)
      }
    })
  }
  public renameTagGroup(id: number, newName: string) {
    const group = this.db.tagGroups.find((f: any) => f.id === id)
    if (group) {
      const oldName = group.name
      group.name = newName;
      this.saveTagGroups()

      this.addAuditLog({
        action: 'tag_group_rename',
        targetId: id,
        targetName: newName,
        description: `タググループ名を変更しました: ${oldName} -> ${newName}`
      })
    }
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
  public createFolder(baseName: string, parentId: number | null = null) {
    let name = baseName
    let counter = 1
    // 同じ名前の兄弟がなくなるまで連番をつける
    while (this.db.folders.find((g) => g.name === name && g.parentId === parentId)) {
      name = `${baseName} (${counter})`
      counter++
    }

    // ランダムID生成
    const id = this.generateUniqueId(this.db.folders)

    // 新しいフォルダーを末尾に追加するため、兄弟の中で最大のorderIndexを取得
    const siblings = this.db.folders.filter(f => f.parentId === parentId)
    const maxOrder = siblings.reduce((max, f) => Math.max(max, f.orderIndex || 0), 0)

    // 他のD&D実装に合わせて +100 しておく
    const folder = { id, name, parentId, orderIndex: maxOrder + 100 }
    this.db.folders.push(folder)
    this.saveFolders()

    this.addAuditLog({
      action: 'folder_create',
      targetId: id,
      targetName: name,
      description: `フォルダーを作成しました: ${name}`
    })

    return folder
  }
  public deleteFolder(id: number) {
    const targetId = Number(id)
    const folder = this.db.folders.find(f => f.id === targetId)
    const folderName = folder ? folder.name : 'Unknown'

    this.db.folders = this.db.folders.filter((g) => Number(g.id) !== targetId)
    this.db.mediaFolders = this.db.mediaFolders.filter((mg) => Number(mg.folderId) !== targetId)
    this.saveFolders()

    this.addAuditLog({
      action: 'folder_delete',
      targetId: targetId,
      targetName: folderName,
      description: `フォルダーを削除しました: ${folderName}`
    })
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

        this.addAuditLog({
          action: 'media_add_folder',
          targetId: mediaId,
          targetName: media.file_name,
          description: `フォルダーを割り当てました: ${folder.name} - ${media.file_name}`
        })
      }
    }
  }
  public removeFolderFromMedia(mediaId: number, folderId: number) {
    this.db.mediaFolders = this.db.mediaFolders.filter((mg) => !(mg.mediaId === mediaId && mg.folderId === folderId))
    const media = this.db.mediaFiles.find(m => m.id === mediaId)
    if (media && media.folders) {
      media.folders = media.folders.filter((g: any) => g.id !== folderId)
      this.saveMediaMetadata(media)

      const folder = this.db.folders.find(f => f.id === folderId)
      this.addAuditLog({
        action: 'media_remove_folder',
        targetId: mediaId,
        targetName: media.file_name,
        description: `メディアからフォルダーを解除しました: ${folder ? folder.name : folderId} - ${media.file_name}`
      })
    }
  }
  public renameFolder(id: number, newName: string) {
    const targetId = Number(id)
    const folder = this.db.folders.find((g) => Number(g.id) === targetId)
    if (folder) {
      const oldName = folder.name
      folder.name = newName;
      this.saveFolders()
      // Update media
      this.db.mediaFiles.forEach(m => {
        if (m.folders) {
          const g = m.folders.find((x: any) => x.id === targetId)
          if (g) { g.name = newName; this.saveMediaMetadata(m) }
        }
      })

      this.addAuditLog({
        action: 'folder_rename',
        targetId: targetId,
        targetName: newName,
        description: `フォルダー名を変更しました: ${oldName} -> ${newName}`
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

    this.addAuditLog({
      action: 'folder_reorder',
      targetName: 'Multiple Folders',
      description: `フォルダー構成/順序を更新しました (${updates.length}件)`
    })
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

      this.addAuditLog({
        action: 'media_comment',
        targetId: mediaId,
        targetName: media.file_name,
        description: `コメントを追加しました: ${media.file_name} - "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"`,
        details: { text, time, nickname }
      })
    }
    return comment
  }
  public getComments(mediaId: number) {
    return this.db.comments.filter((c) => c.mediaId === mediaId).sort((a, b) => a.time - b.time)
  }
  /**
   * 別のライブラリなどからメタデータ付きでインポートする
   */
  public async importMediaBatch(
    items: { sourcePath: string, meta: any }[],
    settings: any,
    onProgress?: (current: number, total: number, fileName: string) => void
  ) {
    const total = items.length
    let current = 0

    // タグ・フォルダーのキャッシュ（名前 -> ID）
    // 毎回検索すると遅いので、インメモリのDB配列から検索するだけなら高速だが、
    // createした場合は反映が必要。

    for (const item of items) {
      current++
      const { sourcePath, meta } = item
      const fileName = path.basename(sourcePath)

      if (onProgress) onProgress(current, total, fileName)

      try {
        if (!fs.existsSync(sourcePath)) {
          console.warn(`[MediaLibrary] Source file not found: ${sourcePath}`)
          continue
        }

        // 1. ファイルコピー
        // ID発行
        const id = this.db.nextMediaId++
        const uniqueId = crypto.randomBytes(6).toString('hex')
        const destDir = path.join(this.path, 'images', uniqueId)
        await fs.ensureDir(destDir)

        // ファイル名処理（衝突回避等はimportMediaFiles同様だが、既存メタデータがあればそれを使うか？）
        // ここではソースのファイル名を維持する
        const cleanFileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
        const destPath = path.join(destDir, cleanFileName)

        await fs.copy(sourcePath, destPath)

        // 2. メタデータの構築
        const stats = fs.statSync(destPath)
        const fileType = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma'].includes(path.extname(destPath).toLowerCase()) ? 'audio' : 'video'

        const newMeta: any = {
          id,
          uniqueId,
          file_path: destPath,
          file_name: cleanFileName,
          file_type: fileType,
          file_size: stats.size,
          duration: meta.duration || 0,
          width: meta.width || 0,
          height: meta.height || 0,
          created_date: stats.birthtime.toISOString(),
          modified_date: stats.mtime.toISOString(),
          created_at: new Date().toISOString(),
          is_deleted: false,
          last_played_at: null,
          // Settings based metadata
          rating: settings.keepRatings ? (meta.rating || 0) : 0,
          artist: settings.keepArtists ? meta.artist : null,
          artists: settings.keepArtists ? (meta.artists || []) : [],
          description: settings.keepDescription ? meta.description : null,
          url: settings.keepUrl ? meta.url : null,
          comments: [], // 後で追加
          tags: [], // 後で追加
          folders: [], // 後で追加
          dominant_color: null
        }

        // 3. サムネイル
        if (settings.keepThumbnails && meta.thumbnail_path && fs.existsSync(meta.thumbnail_path)) {
          const thumbExt = path.extname(meta.thumbnail_path)
          const destThumbPath = path.join(destDir, `thumb_${id}${thumbExt}`)
          await fs.copy(meta.thumbnail_path, destThumbPath)
          newMeta.thumbnail_path = destThumbPath
          // Colorもコピー
          if (meta.dominant_color) newMeta.dominant_color = meta.dominant_color
        } else {
          // 再生成
          // generate
          // (非同期でやるべきだが、ここでは直列実行)
          try {
            const thumbPath = await getThumbnailPath(this.path, id, destPath)
            const mode = getClientConfig().thumbnailMode || 'speed'
            if (await createThumbnail(destPath, thumbPath, mode)) {
              newMeta.thumbnail_path = thumbPath
              try {
                const color = await extractDominantColor(thumbPath)
                if (color) newMeta.dominant_color = color
              } catch (e) { console.error('Color extraction failed', e) }
            }
          } catch (e) { console.error('Thumb generation failed', e) }
        }

        // 4. コメント
        if (settings.keepComments && meta.comments && Array.isArray(meta.comments)) {
          newMeta.comments = meta.comments.map((c: any) => ({
            ...c,
            id: this.db.nextCommentId++, // IDリナンバリング
            mediaId: id
          }))
          // DBのcomments配列にも追加
          this.db.comments.push(...newMeta.comments)
        }

        // 5. タグ
        if (settings.keepTags && meta.tags && Array.isArray(meta.tags)) {
          const newTags: any[] = []
          for (const tag of meta.tags) {
            // 名前で検索
            let targetTag = this.db.tags.find(t => t.name === tag.name)
            if (!targetTag) {
              // なければ作成
              targetTag = this.createTag(tag.name)
            }
            newTags.push(targetTag)
            this.db.mediaTags.push({ mediaId: id, tagId: targetTag.id })
          }
          newMeta.tags = newTags
        }

        // 6. フォルダー
        if (settings.keepFolders && meta.folders && Array.isArray(meta.folders)) {
          const newFolders: any[] = []
          for (const folder of meta.folders) {
            // 名前で検索 (階層は無視してフラットに検索・作成)
            let targetFolder = this.db.folders.find(f => f.name === folder.name)
            if (!targetFolder) {
              targetFolder = this.createFolder(folder.name, null)
            }
            newFolders.push(targetFolder)
            this.db.mediaFolders.push({ mediaId: id, folderId: targetFolder.id })
          }
          newMeta.folders = newFolders
        }

        this.db.mediaFiles.push(newMeta)
        this.saveMediaMetadata(newMeta)

      } catch (e) {
        console.error(`[MediaLibrary] Failed to copy item: ${fileName}`, e)
      }
    }
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
  const lib = libraryRegistry.getLibrary(activeLibraryPath)
  if (lib) {
    const config = getClientConfig()
    lib.setCurrentOperator(config.nickname || 'Local User')
  }
  return lib
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
  checkDuplicates: (filePaths: string[]) => getActiveMediaLibrary()?.checkDuplicates(filePaths) || Promise.resolve([]),
  getDuplicatesForMedia: (mediaId: number) => getActiveMediaLibrary()?.getDuplicatesForMedia(mediaId) || [],
  findLibraryDuplicates: (criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }) => getActiveMediaLibrary()?.findLibraryDuplicates(criteria) || Promise.resolve([]),
  refreshLibraryMetadata: (onProgress: (c: number, t: number) => void) => getActiveMediaLibrary()?.refreshLibraryMetadata(onProgress) || Promise.resolve(),
  searchMedia: (query: string, targets?: any) => getActiveMediaLibrary()?.searchMedia(query, targets) || [],
  updateParentId: (childId: number, parentId: number | null) => getActiveMediaLibrary()?.updateParentId(childId, parentId),
}

export const tagDB = {
  getAllTags: () => getActiveMediaLibrary()?.getAllTags() || [],
  createTag: (name: string) => getActiveMediaLibrary()?.createTag(name),
  deleteTag: (id: number) => getActiveMediaLibrary()?.deleteTag(id),
  addTagToMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.addTagToMedia(mId, tId),
  addTagsToMedia: (mIds: number[], tIds: number[]) => getActiveMediaLibrary()?.addTagsToMedia(mIds, tIds),
  removeTagFromMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.removeTagFromMedia(mId, tId),
  updateTagGroup: (tId: number, gId: number | null) => getActiveMediaLibrary()?.updateTagGroup(tId, gId),
}

export const tagGroupDB = {
  getAllTagGroups: () => getActiveMediaLibrary()?.getAllTagGroups() || [],
  createTagGroup: (name: string) => getActiveMediaLibrary()?.createTagGroup(name),
  deleteTagGroup: (id: number) => getActiveMediaLibrary()?.deleteTagGroup(id),
  renameTagGroup: (id: number, name: string) => getActiveMediaLibrary()?.renameTagGroup(id, name),
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
  addComment: (mediaId: number, text: string, time: number, nickname?: string) => getActiveMediaLibrary()?.addComment(mediaId, text, time, nickname),
  getComments: (mediaId: number) => getActiveMediaLibrary()?.getComments(mediaId) || [],
}
