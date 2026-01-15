import path from 'path'
import { app } from 'electron'
import { getVideoMetadata } from './ffmpeg'
import crypto from 'crypto'
const fs = require('fs-extra')

// ライブラリ情報を保存するファイル
const librariesConfigPath = path.join(app.getPath('userData'), 'libraries.json')

// アクティブなライブラリのパス
let activeLibraryPath: string | null = null

// データベースファイルのパス（ライブラリフォルダ内）
function getDbPath(): string {
  if (!activeLibraryPath) {
    // フォールバック: 旧形式
    return path.join(app.getPath('userData'), 'media-library.json')
  }
  return path.join(activeLibraryPath, 'database.json')
}

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

let db: Database = {
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
      activeLibraryPath = librariesConfig.activeLibraryPath
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

// データベース読み込み
function loadDatabase() {
  try {
    const dbPath = getDbPath()
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf-8')
      db = JSON.parse(data)

      // マイグレーション: 新しいフィールドがない場合は追加
      let changed = false
      db.mediaFiles.forEach(file => {
        if (file.is_deleted === undefined) {
          file.is_deleted = false
          changed = true
        }
        if (file.last_played_at === undefined) {
          file.last_played_at = null
          changed = true
        }
        if (file.file_size === undefined) {
          file.file_size = 0
          changed = true
        }
        if (file.artist === undefined) {
          file.artist = null
          changed = true
        }
        if (file.description === undefined) {
          file.description = null
          changed = true
        }
      })

      if (db.comments === undefined) {
        db.comments = []
        db.nextCommentId = 1
        changed = true
      }

      // タグフォルダのマイグレーション
      if (db.tagFolders === undefined) {
        db.tagFolders = []
        db.nextTagFolderId = 1
        changed = true
      }

      // タグにfolderIdを追加
      db.tags.forEach(tag => {
        if (tag.folderId === undefined) {
          tag.folderId = null
          changed = true
        }
      })

      // ジャンルの階層化マイグレーション
      db.genres.forEach((genre) => {
        if (genre.parentId === undefined) {
          genre.parentId = null
          changed = true
        }
        if (genre.orderIndex === undefined) {
          genre.orderIndex = 0
          changed = true
        }
      })

      if (changed) {
        saveDatabase()
      }
    }
  } catch (error) {
    console.error('Failed to load database:', error)
  }
}

// データベース保存
function saveDatabase() {
  try {
    const dbPath = getDbPath()
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save database:', error)
  }
}

// データベース初期化
export function initDatabase() {
  loadLibrariesConfig()
  loadDatabase()
  console.log('Database initialized')
  console.log('Active library:', activeLibraryPath)
  console.log('Database path:', getDbPath())
}

// ライブラリ操作
export const libraryDB = {
  // ライブラリ作成
  createLibrary(name: string, parentPath: string) {
    const libraryPath = path.join(parentPath, `${name}.library`)

    // ディレクトリ作成
    if (!fs.existsSync(libraryPath)) {
      fs.mkdirSync(libraryPath, { recursive: true })
    }

    const library = {
      name,
      path: libraryPath,
      createdAt: new Date().toISOString(),
    }

    // ライブラリリストに追加
    librariesConfig.libraries.push(library)
    librariesConfig.activeLibraryPath = libraryPath
    activeLibraryPath = libraryPath
    saveLibrariesConfig()

    // 新しいデータベースを初期化
    db = {
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
    saveDatabase()

    return library
  },

  // ライブラリ一覧取得
  getLibraries() {
    return librariesConfig.libraries
  },

  // アクティブなライブラリ設定
  setActiveLibrary(libraryPath: string) {
    activeLibraryPath = libraryPath
    librariesConfig.activeLibraryPath = libraryPath
    saveLibrariesConfig()

    // データベースを再読み込み
    loadDatabase()
  },

  // アクティブなライブラリ取得
  getActiveLibrary() {
    if (!activeLibraryPath) return null
    return librariesConfig.libraries.find(lib => lib.path === activeLibraryPath) || null
  },
}


// メディアファイル操作
export const mediaDB = {
  // メディアファイルインポート
  async importMediaFiles(filePaths: string[]) {
    if (!activeLibraryPath) return []

    const importedFiles = []

    for (const srcPath of filePaths) {
      try {
        if (!fs.existsSync(srcPath)) continue

        const ext = path.extname(srcPath).toLowerCase()
        // 対応拡張子チェック (簡易)
        if (!['.mp4', '.mkv', '.avi', '.mov', '.webm', '.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext)) {
          console.warn(`Unsupported file type: ${srcPath}`)
          continue
        }

        const fileName = path.basename(srcPath)
        const fileType = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext) ? 'audio' : 'video'

        // ID生成
        const id = db.nextMediaId++
        const uniqueId = crypto.randomBytes(6).toString('hex') // ランダムID (12文字)

        // 保存先ディレクトリ: <Library>/images/<UniqueID>/
        const destDir = path.join(activeLibraryPath, 'images', uniqueId)
        await fs.ensureDir(destDir)

        // ファイルコピー
        const destPath = path.join(destDir, fileName)
        await fs.copy(srcPath, destPath)

        // メタデータ作成
        const metadata = {
          id,
          uniqueId,
          originalName: fileName,
          importedAt: new Date().toISOString(),
          tags: [], // 初期は空
          genres: [] // 初期は空
        }
        await fs.writeJson(path.join(destDir, 'metadata.json'), metadata, { spaces: 2 })

        // DB登録
        const stats = await fs.stat(destPath)
        let width: number | undefined
        let height: number | undefined
        let duration: number | null = null
        let artist: string | null = null
        let description: string | null = null

        if (fileType === 'video') {
          try {
            const meta = await getVideoMetadata(destPath)
            width = meta.width
            height = meta.height
            if (meta.duration) duration = meta.duration
            artist = meta.artist || null
            description = meta.description || null
          } catch (e) {
            console.error('Failed to get video metadata:', e)
          }
        }

        const mediaFile = {
          id,
          file_path: destPath,
          file_name: fileName,
          file_type: fileType,
          file_size: stats.size,
          duration,
          width,
          height,
          rating: 0,
          created_date: stats.birthtime.toISOString(),
          modified_date: stats.mtime.toISOString(),
          thumbnail_path: null,
          created_at: new Date().toISOString(),
          is_deleted: false,
          last_played_at: null,
          artist,
          description,
        }
        db.mediaFiles.push(mediaFile)
        importedFiles.push(mediaFile)

      } catch (error) {
        console.error(`Failed to import file: ${srcPath}`, error)
      }
    }

    if (importedFiles.length > 0) {
      saveDatabase()
    }
    return importedFiles
  },

  // メディアファイル追加 (互換性のため残すが、importを使用推奨)
  addMediaFile(filePath: string, fileName: string, fileType: string, options: { width?: number; height?: number; duration?: number } = {}) {
    // 既存チェック
    const existing = db.mediaFiles.find((m) => m.file_path === filePath)
    if (existing) {
      return existing.id
    }

    const id = db.nextMediaId++
    const stats = fs.statSync(filePath)
    // addMediaFileは既存のスキャンロジック用なので、単純に追加のみ
    db.mediaFiles.push({
      id,
      file_path: filePath,
      file_name: fileName,
      file_type: fileType,
      file_size: stats.size,
      duration: options.duration || null,
      width: options.width,
      height: options.height,
      rating: 0,
      created_date: stats.birthtime.toISOString(),
      modified_date: stats.mtime.toISOString(),
      thumbnail_path: null,
      created_at: new Date().toISOString(),
      is_deleted: false,
      last_played_at: null,
      artist: null,
      description: null,
    })
    saveDatabase()
    return id
  },

  updateRating(id: number, rating: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.rating = rating
      saveDatabase()
    }
  },

  getVideosMissingMetadata() {
    return db.mediaFiles.filter((m) =>
      m.file_type === 'video' &&
      (!m.duration || m.duration === 0)
    )
  },

  updateVideoMetadata(id: number, width: number, height: number, duration: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      if (width) media.width = width
      if (height) media.height = height
      if (duration) media.duration = duration
      saveDatabase()
    }
  },

  // メディアファイル取得
  get(id: number) {
    return db.mediaFiles.find((m) => m.id === id)
  },

  // 全メディアファイル取得
  getAllMediaFiles() {
    return db.mediaFiles.map((media) => {
      const tagIds = db.mediaTags
        .filter((mt) => mt.mediaId === media.id)
        .map((mt) => mt.tagId)
      const tags = db.tags.filter((t) => tagIds.includes(t.id))

      const genreIds = db.mediaGenres
        .filter((mg) => mg.mediaId === media.id)
        .map((mg) => mg.genreId)
      const genres = db.genres.filter((g) => genreIds.includes(g.id))

      return { ...media, tags, genres }
    })
  },

  // メディアファイル取得(タグ・ジャンル付き)
  getMediaFileWithDetails(id: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (!media) return null

    const tagIds = db.mediaTags.filter((mt) => mt.mediaId === id).map((mt) => mt.tagId)
    const tags = db.tags.filter((t) => tagIds.includes(t.id))

    const genreIds = db.mediaGenres.filter((mg) => mg.mediaId === id).map((mg) => mg.genreId)
    const genres = db.genres.filter((g) => genreIds.includes(g.id))

    const comments = db.comments.filter((c) => c.mediaId === id)

    return { ...media, tags, genres, comments }
  },

  // サムネイルパス更新
  updateThumbnail(id: number, thumbnailPath: string) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.thumbnail_path = thumbnailPath
      saveDatabase()
    }
  },

  // メディアファイル削除 (互換性のため残すが、基本的には使わない想定)
  deleteMediaFile(id: number) {
    db.mediaFiles = db.mediaFiles.filter((m) => m.id !== id)
    db.mediaTags = db.mediaTags.filter((mt) => mt.mediaId !== id)
    db.mediaGenres = db.mediaGenres.filter((mg) => mg.mediaId !== id)
    saveDatabase()
  },

  // ゴミ箱へ移動
  moveToTrash(id: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.is_deleted = true
      saveDatabase()
    }
  },

  // ゴミ箱から復元
  restoreFromTrash(id: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.is_deleted = false
      saveDatabase()
    }
  },

  // 完全削除 (ファイルも削除)
  async deletePermanently(id: number) {
    const mediaIdx = db.mediaFiles.findIndex((m) => m.id === id)
    if (mediaIdx !== -1) {
      const media = db.mediaFiles[mediaIdx]

      try {
        // 親ディレクトリ (images/<UniqueID>) を削除
        // file_path が .../images/<UniqueID>/filename.ext であることを前提
        // もし古い形式のパスならファイルのみ削除
        const dirPath = path.dirname(media.file_path)
        const grandParentDir = path.basename(path.dirname(dirPath))

        if (grandParentDir === 'images') {
          // 新しい構造ならディレクトリごと削除
          if (fs.existsSync(dirPath)) {
            await fs.remove(dirPath)
          }
        } else {
          // 古い構造ならファイルのみ削除
          if (fs.existsSync(media.file_path)) {
            await fs.remove(media.file_path)
          }
        }
      } catch (error) {
        console.error('Failed to delete file/directory:', media.file_path, error)
      }

      // DB削除
      db.mediaFiles.splice(mediaIdx, 1)
      db.mediaTags = db.mediaTags.filter((mt) => mt.mediaId !== id)
      db.mediaGenres = db.mediaGenres.filter((mg) => mg.mediaId !== id)
      saveDatabase()
    }
  },

  // 最終再生日時更新
  updateLastPlayed(id: number) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.last_played_at = new Date().toISOString()
      saveDatabase()
    }
  },

  // ファイル名更新
  updateFileName(id: number, newName: string) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      try {
        const oldPath = media.file_path
        const dir = path.dirname(oldPath)
        const newPath = path.join(dir, newName)

        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath)
          media.file_path = newPath
          media.file_name = newName
          saveDatabase()
        } else {
          // ファイルがない場合はDBのみ更新
          media.file_name = newName
          saveDatabase()
        }
      } catch (error) {
        console.error('Failed to rename physical file:', error)
        throw error
      }
    }
  },

  // 投稿者更新
  updateArtist(id: number, artist: string | null) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.artist = artist
      saveDatabase()
    }
  },

  // 説明更新
  updateDescription(id: number, description: string | null) {
    const media = db.mediaFiles.find((m) => m.id === id)
    if (media) {
      media.description = description
      saveDatabase()
    }
  },
}

// タグ操作
export const tagDB = {
  // 全タグ取得
  getAllTags() {
    return db.tags.sort((a, b) => a.name.localeCompare(b.name))
  },

  // タグ作成
  createTag(name: string) {
    const existing = db.tags.find((t) => t.name === name)
    if (existing) {
      return existing
    }

    const id = db.nextTagId++
    const tag = { id, name }
    db.tags.push(tag)
    saveDatabase()
    return tag
  },

  // タグ削除
  deleteTag(id: number) {
    db.tags = db.tags.filter((t) => t.id !== id)
    db.mediaTags = db.mediaTags.filter((mt) => mt.tagId !== id)
    saveDatabase()
  },

  // メディアにタグ追加
  addTagToMedia(mediaId: number, tagId: number) {
    const existing = db.mediaTags.find((mt) => mt.mediaId === mediaId && mt.tagId === tagId)
    if (!existing) {
      db.mediaTags.push({ mediaId, tagId })
      saveDatabase()
    }
  },

  // メディアからタグ削除
  removeTagFromMedia(mediaId: number, tagId: number) {
    db.mediaTags = db.mediaTags.filter((mt) => !(mt.mediaId === mediaId && mt.tagId === tagId))
    saveDatabase()
  },

  // タグのフォルダを更新
  updateTagFolder(tagId: number, folderId: number | null) {
    const tag = db.tags.find((t) => t.id === tagId)
    if (tag) {
      tag.folderId = folderId
      saveDatabase()
    }
  },
}

// タグフォルダ操作
export const tagFolderDB = {
  // 全タグフォルダ取得
  getAllTagFolders() {
    return db.tagFolders.sort((a: any, b: any) => a.name.localeCompare(b.name))
  },

  // タグフォルダ作成
  createTagFolder(name: string) {
    const existing = db.tagFolders.find((f: any) => f.name === name)
    if (existing) {
      return existing
    }

    const id = db.nextTagFolderId++
    const folder = { id, name }
    db.tagFolders.push(folder)
    saveDatabase()
    return folder
  },

  // タグフォルダ削除
  deleteTagFolder(id: number) {
    db.tagFolders = db.tagFolders.filter((f: any) => f.id !== id)
    // フォルダ内のタグのfolderIdをnullに設定
    db.tags.forEach((t) => {
      if (t.folderId === id) {
        t.folderId = null
      }
    })
    saveDatabase()
  },

  // タグフォルダ名変更
  renameTagFolder(id: number, newName: string) {
    const folder = db.tagFolders.find((f: any) => f.id === id)
    if (folder) {
      folder.name = newName
      saveDatabase()
    }
  },
}

// ジャンル操作
export const genreDB = {
  // 全ジャンル取得
  getAllGenres() {
    return db.genres.sort((a, b) => a.name.localeCompare(b.name))
  },

  // ジャンル作成
  createGenre(name: string, parentId: number | null = null) {
    const existing = db.genres.find((g) => g.name === name && g.parentId === parentId)
    // 同名でも親が違えばOKとするか、同一階層で重複不可とするか。
    // 既存ロジックは名前だけで検索していたが、階層化に伴い親IDも考慮すべき。
    if (existing) {
      return existing
    }

    const id = db.nextGenreId++
    const genre = { id, name, parentId, orderIndex: 0 }
    db.genres.push(genre)
    saveDatabase()
    return genre
  },

  // ジャンル削除
  deleteGenre(id: number) {
    db.genres = db.genres.filter((g) => g.id !== id)
    db.mediaGenres = db.mediaGenres.filter((mg) => mg.genreId !== id)
    saveDatabase()
  },

  // メディアにジャンル追加
  addGenreToMedia(mediaId: number, genreId: number) {
    const existing = db.mediaGenres.find((mg) => mg.mediaId === mediaId && mg.genreId === genreId)
    if (!existing) {
      db.mediaGenres.push({ mediaId, genreId })
      saveDatabase()
    }
  },

  // メディアからジャンル削除
  removeGenreFromMedia(mediaId: number, genreId: number) {
    db.mediaGenres = db.mediaGenres.filter(
      (mg) => !(mg.mediaId === mediaId && mg.genreId === genreId)
    )
    saveDatabase()
  },

  // ジャンル名変更
  renameGenre(id: number, newName: string) {
    const genre = db.genres.find((g) => g.id === id)
    if (genre) {
      genre.name = newName
      saveDatabase()
    }
  },

  // ジャンル構造更新
  updateGenreStructure(updates: { id: number; parentId: number | null; orderIndex: number }[]) {
    updates.forEach((update) => {
      const genre = db.genres.find((g) => g.id === update.id)
      if (genre) {
        genre.parentId = update.parentId
        genre.orderIndex = update.orderIndex
      }
    })
    saveDatabase()
  },
}

// コメント操作
export const commentDB = {
  addComment(mediaId: number, text: string, time: number) {
    const id = db.nextCommentId++
    const comment = {
      id,
      mediaId,
      text,
      time,
      createdAt: new Date().toISOString(),
    }
    db.comments.push(comment)
    saveDatabase()
    return comment
  },

  getComments(mediaId: number) {
    return db.comments.filter((c) => c.mediaId === mediaId).sort((a, b) => a.time - b.time)
  },
}
