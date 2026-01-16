import path from 'path'
import { app } from 'electron'
import { generatePreviewImages, getMediaMetadata } from './ffmpeg'
import crypto from 'crypto'
const fs = require('fs-extra')

// ライブラリ情報を保存するファイル
const librariesConfigPath = path.join(app.getPath('userData'), 'libraries.json')

// データベース構造
interface Database {
  mediaFiles: any[]
  tags: any[]
  tagFolders: any[]
  genres: any[]
  mediaTags: { mediaId: number; tagId: number }[]
  mediaGenres: { mediaId: number; genreId: number }[]
  comments: any[]
  nextMediaId: number
  nextTagId: number
  nextTagFolderId: number
  nextGenreId: number
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
  private dbPath: string
  private db: Database

  constructor(libraryPath: string) {
    this.path = libraryPath
    this.dbPath = path.join(libraryPath, 'database.json')
    this.db = {
      mediaFiles: [],
      tags: [],
      tagFolders: [],
      genres: [],
      mediaTags: [],
      mediaGenres: [],
      comments: [],
      nextMediaId: 1,
      nextTagId: 1,
      nextTagFolderId: 1,
      nextGenreId: 1,
      nextCommentId: 1,
    }
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf-8')
        this.db = JSON.parse(data)

        // マイグレーション
        let changed = false
        this.db.mediaFiles.forEach(file => {
          if (file.is_deleted === undefined) { file.is_deleted = false; changed = true; }
          if (file.last_played_at === undefined) { file.last_played_at = null; changed = true; }
          if (file.file_size === undefined) { file.file_size = 0; changed = true; }
          if (file.artist === undefined) { file.artist = null; changed = true; }
          if (file.description === undefined) { file.description = null; changed = true; }
        })

        if (this.db.comments === undefined) {
          this.db.comments = []
          this.db.nextCommentId = 1
          changed = true
        }
        if (this.db.tagFolders === undefined) {
          this.db.tagFolders = []
          this.db.nextTagFolderId = 1
          changed = true
        }

        this.db.tags.forEach(tag => {
          if (tag.folderId === undefined) { tag.folderId = null; changed = true; }
        })

        this.db.genres.forEach((genre) => {
          if (genre.parentId === undefined) { genre.parentId = null; changed = true; }
          if (genre.orderIndex === undefined) { genre.orderIndex = 0; changed = true; }
        })

        if (changed) {
          this.save()
        }
      }
    } catch (error) {
      console.error(`Failed to load database for ${this.path}:`, error)
    }
  }

  public save() {
    try {
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf-8')
    } catch (error) {
      console.error(`Failed to save database for ${this.path}:`, error)
    }
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

        const metadata = {
          id,
          uniqueId,
          originalName: fileName,
          importedAt: new Date().toISOString(),
          tags: [],
          genres: []
        }
        await fs.writeJson(path.join(destDir, 'metadata.json'), metadata, { spaces: 2 })

        const stats = await fs.stat(destPath)
        let width = 0
        let height = 0
        let duration: number | null = null
        let artist: string | null = null
        let description: string | null = null

        // 動画・音声両方のメタデータを取得
        try {
          const meta = await getMediaMetadata(destPath)
          if (fileType === 'video') {
            width = meta.width || 0
            height = meta.height || 0
          }
          if (meta.duration) duration = meta.duration
          artist = meta.artist || null
          description = meta.description || null
        } catch (e) {
          console.error(`Failed to get ${fileType} metadata:`, e)
        }

        const mediaFile = {
          id, uniqueId, file_path: destPath, file_name: fileName, file_type: fileType,
          file_size: stats.size, duration, width, height, rating: 0,
          created_date: stats.birthtime.toISOString(), modified_date: stats.mtime.toISOString(),
          thumbnail_path: null, created_at: new Date().toISOString(), is_deleted: false,
          last_played_at: null, artist, description,
        }
        this.db.mediaFiles.push(mediaFile)
        importedFiles.push(mediaFile)
      } catch (error) { console.error(`Failed to import file: ${srcPath}`, error) }
    }
    if (importedFiles.length > 0) this.save()
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
      last_played_at: null, artist: null, description: null,
    })
    this.save()
    return id
  }

  public updateRating(id: number, rating: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.rating = rating; this.save() }
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
      this.save()
    }
  }

  public get(id: number) { return this.db.mediaFiles.find((m) => m.id === id) }

  public getAllMediaFiles() {
    return this.db.mediaFiles.map((media) => {
      const tagIds = this.db.mediaTags.filter((mt) => mt.mediaId === media.id).map((mt) => mt.tagId)
      const tags = this.db.tags.filter((t) => tagIds.includes(t.id))
      const genreIds = this.db.mediaGenres.filter((mg) => mg.mediaId === media.id).map((mg) => mg.genreId)
      const genres = this.db.genres.filter((g) => genreIds.includes(g.id))
      return { ...media, tags, genres }
    })
  }

  public getMediaFileWithDetails(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (!media) return null
    const tagIds = this.db.mediaTags.filter((mt) => mt.mediaId === id).map((mt) => mt.tagId)
    const tags = this.db.tags.filter((t) => tagIds.includes(t.id))
    const genreIds = this.db.mediaGenres.filter((mg) => mg.mediaId === id).map((mg) => mg.genreId)
    const genres = this.db.genres.filter((g) => genreIds.includes(g.id))
    const comments = this.db.comments.filter((c) => c.mediaId === id)
    return { ...media, tags, genres, comments }
  }

  public updateThumbnail(id: number, thumbnailPath: string) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.thumbnail_path = thumbnailPath; this.save() }
  }

  public moveToTrash(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.is_deleted = true; this.save() }
  }

  public restoreFromTrash(id: number) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.is_deleted = false; this.save() }
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
      }
    })
    if (changed) this.save()
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
    this.db.mediaGenres = this.db.mediaGenres.filter((mg) => !ids.includes(mg.mediaId))
    this.save()

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
    if (media) { media.last_played_at = new Date().toISOString(); this.save() }
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
          this.save()
        } else { media.file_name = newName; this.save() }
      } catch (error) { console.error('Failed to rename physical file:', error); throw error }
    }
  }

  public updateArtist(id: number, artist: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.artist = artist; this.save() }
  }

  public updateDescription(id: number, description: string | null) {
    const media = this.db.mediaFiles.find((m) => m.id === id)
    if (media) { media.description = description; this.save() }
  }

  // タグ操作
  public getAllTags() { return this.db.tags.sort((a, b) => a.name.localeCompare(b.name)) }
  public createTag(name: string) {
    const existing = this.db.tags.find((t) => t.name === name)
    if (existing) return existing
    const id = this.db.nextTagId++
    const tag = { id, name }
    this.db.tags.push(tag)
    this.save()
    return tag
  }
  public deleteTag(id: number) {
    this.db.tags = this.db.tags.filter((t) => t.id !== id)
    this.db.mediaTags = this.db.mediaTags.filter((mt) => mt.tagId !== id)
    this.save()
  }
  public addTagToMedia(mediaId: number, tagId: number) {
    const existing = this.db.mediaTags.find((mt) => mt.mediaId === mediaId && mt.tagId === tagId)
    if (!existing) { this.db.mediaTags.push({ mediaId, tagId }); this.save() }
  }
  public removeTagFromMedia(mediaId: number, tagId: number) {
    this.db.mediaTags = this.db.mediaTags.filter((mt) => !(mt.mediaId === mediaId && mt.tagId === tagId))
    this.save()
  }
  public updateTagFolder(tagId: number, folderId: number | null) {
    const tag = this.db.tags.find((t) => t.id === tagId)
    if (tag) { tag.folderId = folderId; this.save() }
  }

  // タグフォルダ
  public getAllTagFolders() { return this.db.tagFolders.sort((a: any, b: any) => a.name.localeCompare(b.name)) }
  public createTagFolder(name: string) {
    const existing = this.db.tagFolders.find((f: any) => f.name === name)
    if (existing) return existing
    const id = this.db.nextTagFolderId++
    const folder = { id, name }
    this.db.tagFolders.push(folder)
    this.save()
    return folder
  }
  public deleteTagFolder(id: number) {
    this.db.tagFolders = this.db.tagFolders.filter((f: any) => f.id !== id)
    this.db.tags.forEach((t) => { if (t.folderId === id) t.folderId = null })
    this.save()
  }
  public renameTagFolder(id: number, newName: string) {
    const folder = this.db.tagFolders.find((f: any) => f.id === id)
    if (folder) { folder.name = newName; this.save() }
  }

  // ジャンル
  public getAllGenres() { return this.db.genres.sort((a, b) => a.name.localeCompare(b.name)) }
  public createGenre(name: string, parentId: number | null = null) {
    const existing = this.db.genres.find((g) => g.name === name && g.parentId === parentId)
    if (existing) return existing
    const id = this.db.nextGenreId++
    const genre = { id, name, parentId, orderIndex: 0 }
    this.db.genres.push(genre)
    this.save()
    return genre
  }
  public deleteGenre(id: number) {
    this.db.genres = this.db.genres.filter((g) => g.id !== id)
    this.db.mediaGenres = this.db.mediaGenres.filter((mg) => mg.genreId !== id)
    this.save()
  }
  public addGenreToMedia(mediaId: number, genreId: number) {
    const existing = this.db.mediaGenres.find((mg) => mg.mediaId === mediaId && mg.genreId === genreId)
    if (!existing) { this.db.mediaGenres.push({ mediaId, genreId }); this.save() }
  }
  public removeGenreFromMedia(mediaId: number, genreId: number) {
    this.db.mediaGenres = this.db.mediaGenres.filter((mg) => !(mg.mediaId === mediaId && mg.genreId === genreId))
    this.save()
  }
  public renameGenre(id: number, newName: string) {
    const genre = this.db.genres.find((g) => g.id === id)
    if (genre) { genre.name = newName; this.save() }
  }
  public updateGenreStructure(updates: { id: number; parentId: number | null; orderIndex: number }[]) {
    updates.forEach((update) => {
      const genre = this.db.genres.find((g) => g.id === update.id)
      if (genre) { genre.parentId = update.parentId; genre.orderIndex = update.orderIndex }
    })
    this.save()
  }

  // コメント
  public addComment(mediaId: number, text: string, time: number, nickname?: string) {
    const id = this.db.nextCommentId++
    const comment = { id, mediaId, text, time, nickname, createdAt: new Date().toISOString() }
    this.db.comments.push(comment)
    this.save()
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
  moveMediaFilesToTrash: (ids: number[], isDeleted: boolean) => getActiveMediaLibrary()?.moveMediaFilesToTrash(ids, isDeleted),
  deleteMediaFilesPermanently: (ids: number[]) => getActiveMediaLibrary()?.deleteMediaFilesPermanently(ids) || Promise.resolve(),
}

export const tagDB = {
  getAllTags: () => getActiveMediaLibrary()?.getAllTags() || [],
  createTag: (name: string) => getActiveMediaLibrary()?.createTag(name),
  deleteTag: (id: number) => getActiveMediaLibrary()?.deleteTag(id),
  addTagToMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.addTagToMedia(mId, tId),
  removeTagFromMedia: (mId: number, tId: number) => getActiveMediaLibrary()?.removeTagFromMedia(mId, tId),
  updateTagFolder: (tId: number, fId: number | null) => getActiveMediaLibrary()?.updateTagFolder(tId, fId),
}

export const tagFolderDB = {
  getAllTagFolders: () => getActiveMediaLibrary()?.getAllTagFolders() || [],
  createTagFolder: (name: string) => getActiveMediaLibrary()?.createTagFolder(name),
  deleteTagFolder: (id: number) => getActiveMediaLibrary()?.deleteTagFolder(id),
  renameTagFolder: (id: number, name: string) => getActiveMediaLibrary()?.renameTagFolder(id, name),
}

export const genreDB = {
  getAllGenres: () => getActiveMediaLibrary()?.getAllGenres() || [],
  createGenre: (name: string, pId: number | null) => getActiveMediaLibrary()?.createGenre(name, pId),
  deleteGenre: (id: number) => getActiveMediaLibrary()?.deleteGenre(id),
  addGenreToMedia: (mId: number, gId: number) => getActiveMediaLibrary()?.addGenreToMedia(mId, gId),
  removeGenreFromMedia: (mId: number, gId: number) => getActiveMediaLibrary()?.removeGenreFromMedia(mId, gId),
  renameGenre: (id: number, name: string) => getActiveMediaLibrary()?.renameGenre(id, name),
  updateGenreStructure: (updates: any) => getActiveMediaLibrary()?.updateGenreStructure(updates),
}

export const commentDB = {
  addComment: (mId: number, txt: string, time: number, nick?: string) => getActiveMediaLibrary()?.addComment(mId, txt, time, nick),
  getComments: (mId: number) => getActiveMediaLibrary()?.getComments(mId) || [],
}
