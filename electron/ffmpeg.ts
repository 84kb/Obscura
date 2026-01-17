import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs-extra'
import { getFFmpegPath, getFFprobePath } from './ffmpeg-path'

/**
 * 動画ファイルからプレビュー画像を生成する
 * @param videoPath 動画ファイルのパス
 * @param outputDir 出力ディレクトリ
 * @param intervalSec 画像生成間隔（秒）
 * @returns 生成された画像ファイル名のリスト
 */
export async function generatePreviewImages(videoPath: string, outputDir: string, intervalSec: number = 1): Promise<string[]> {
    return new Promise((resolve, reject) => {
        // 出力ディレクトリの作成
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        // ファイル名パターン: preview_001.jpg, preview_002.jpg ...
        const outputPattern = path.join(outputDir, 'preview_%03d.jpg')

        // fps = 1 / intervalSec
        const fps = 1 / intervalSec

        const args = [
            '-i', videoPath,
            '-vf', `fps=${fps},scale=160:-1`, // 幅160px、高さ自動維持
            '-q:v', '5', // 品質設定（低いほど高品質、2-31）
            outputPattern
        ]

        console.log(`[ffmpeg] Generating previews for: ${videoPath}`)
        console.log(`[ffmpeg] Command: ffmpeg ${args.join(' ')}`)

        const ffmpegPath = getFFmpegPath()
        const ffmpeg = spawn(ffmpegPath, args)

        ffmpeg.stdout.on('data', (_data) => {
            // console.log(`[ffmpeg stdout] ${_data}`)
        })

        ffmpeg.stderr.on('data', (_data) => {
            // ffmpegのログは標準エラー出力に出る場合が多い
            // console.error(`[ffmpeg stderr] ${_data}`)
        })

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`[ffmpeg] Preview generation completed.`)
                // 生成されたファイルリストを取得して返す
                try {
                    const files = fs.readdirSync(outputDir)
                        .filter(f => f.startsWith('preview_') && f.endsWith('.jpg'))
                        .sort()
                    resolve(files)
                } catch (err) {
                    reject(err)
                }
            } else {
                console.error(`[ffmpeg] Process exited with code ${code}`)
                reject(new Error(`ffmpeg process exited with code ${code}`))
            }
        })

        ffmpeg.on('error', (err) => {
            console.error(`[ffmpeg] Failed to start process: ${err.message}`)
            reject(err)
        })
    })
}

/**
 * メディアファイルからメタデータを取得する（動画・音声対応）
 */
export async function getMediaMetadata(filePath: string): Promise<{ width?: number; height?: number; duration?: number; artist?: string; description?: string; comment?: string }> {
    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-show_entries', 'stream=width,height,duration:format=duration:format_tags=artist,uploader,performer,comment,description,DESCRIPTION',
            '-of', 'json',
            filePath
        ]

        const ffprobePath = getFFprobePath()
        const ffprobe = spawn(ffprobePath, args)
        let outputData = ''

        ffprobe.stdout.on('data', (data) => {
            outputData += data.toString()
        })

        ffprobe.on('close', (code) => {
            if (code === 0) {
                try {
                    const json = JSON.parse(outputData)
                    let width: number | undefined
                    let height: number | undefined
                    let duration: number | undefined
                    let artist: string | undefined
                    let description: string | undefined

                    // ストリーム情報から解像度とデュレーションを取得
                    if (json.streams && json.streams.length > 0) {
                        // ビデオストリームを優先的に探す
                        const videoStream = json.streams.find((s: any) => s.codec_type === 'video')
                        const firstStream = json.streams[0]

                        if (videoStream) {
                            width = videoStream.width
                            height = videoStream.height
                        }

                        // durationはストリームまたはフォーマットから取得
                        duration = parseFloat(videoStream?.duration || firstStream?.duration || json.format?.duration)
                    } else if (json.format && json.format.duration) {
                        duration = parseFloat(json.format.duration)
                    }

                    // フォーマットタグからアーティスト/投稿者を取得
                    if (json.format && json.format.tags) {
                        const tags = json.format.tags
                        artist = tags.artist || tags.ARTIST || tags.Artist ||
                            tags.uploader || tags.UPLOADER || tags.Uploader ||
                            tags.performer || tags.PERFORMER || tags.Performer ||
                            undefined

                        description = tags.description || tags.DESCRIPTION || tags.Description || undefined

                        // User Request: Comment field is used for URL
                        // If description is empty, check if comment looks like a URL? No, request says "comment field is automatically entered" into URL field.
                        // Assuming comment tag holds the URL.
                        const comment = tags.comment || tags.COMMENT || tags.Comment
                        if (comment) {
                            // Simple heuristic: if it starts with http, treat as URL. 
                            // Or just always assign to url field as per request "comment field automatic input".
                            // Let's pass it as a separate field.
                            // However, getMediaMetadata return type needs update.
                        }
                    }

                    resolve({ width, height, duration, artist, description, comment: (json.format && json.format.tags) ? (json.format.tags.comment || json.format.tags.COMMENT || json.format.tags.Comment) : undefined })
                    return
                } catch (e) {
                    console.error('Failed to parse ffprobe output', e)
                }
            }
            resolve({})
        })

        ffprobe.on('error', (err) => {
            console.error('ffprobe error:', err)
            resolve({})
        })
    })
}

/**
 * サムネイルを生成する（埋め込み画像抽出 -> フレームキャプチャの順で試行）
 * @param sourcePath 元動画/音声ファイルのパス
 * @param destPath 出力先パス
 * @returns 成功した場合はtrue
 */
export async function createThumbnail(sourcePath: string, destPath: string): Promise<boolean> {
    // 埋め込みサムネイル(カバーアート)の抽出を試みる
    const extractEmbedded = (): Promise<boolean> => {
        return new Promise((resolve) => {
            const args = [
                '-i', sourcePath,
                '-an',
                '-vcodec', 'png',
                '-map', '0:v',
                '-map', '-0:V',
                '-vframes', '1',
                '-y',
                destPath
            ]

            const ffmpegPath = getFFmpegPath()
            const ffmpeg = spawn(ffmpegPath, args)

            ffmpeg.on('close', (code: number) => {
                if (code === 0 && fs.existsSync(destPath)) {
                    const stats = fs.statSync(destPath)
                    if (stats.size > 1000) { // 最低1KB以上のファイルを有効とみなす
                        console.log(`[Thumbnail] Extracted embedded cover: ${destPath}`)
                        resolve(true)
                        return
                    }
                }
                // 失敗した場合はファイルを削除
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath)
                }
                resolve(false)
            })

            ffmpeg.on('error', () => {
                resolve(false)
            })
        })
    }

    // フレームからサムネイルを生成
    const generateFromFrame = (): Promise<boolean> => {
        return new Promise((resolve) => {
            const args = [
                '-ss', '3',           // 3秒目から
                '-i', sourcePath,
                '-vframes', '1',
                '-q:v', '3',
                '-vf', 'scale=320:-1',
                '-vcodec', 'png',
                '-y',
                destPath
            ]

            const ffmpegPath = getFFmpegPath()
            const ffmpeg = spawn(ffmpegPath, args)

            ffmpeg.on('close', (code: number) => {
                if (code === 0 && fs.existsSync(destPath)) {
                    console.log(`[Thumbnail] Generated from frame: ${destPath}`)
                    resolve(true)
                } else {
                    console.error(`[Thumbnail] Frame capture failed with code ${code}`)
                    resolve(false)
                }
            })

            ffmpeg.on('error', (err: Error) => {
                console.error(`[Thumbnail] Error: ${err.message}`)
                resolve(false)
            })
        })
    }

    try {
        // 埋め込み抽出
        if (await extractEmbedded()) {
            return true
        }
        // フレーム生成
        return await generateFromFrame()
    } catch (e) {
        console.error('Failed to create thumbnail', e)
        return false
    }
}

export interface MediaMetadata {
    title?: string
    artist?: string
    description?: string
    date?: string
    url?: string // Comment
    thumbnailPath?: string | null
}

/**
 * 動画ファイルにメタデータを埋め込む
 * @param sourcePath 元ファイルのパス
 * @param destPath 出力先パス
 * @param metadata 埋め込むメタデータ
 * @param onProgress 進捗コールバック (0-100)
 * @returns 成功した場合はtrue
 */
export async function embedMetadata(
    sourcePath: string,
    destPath: string,
    metadata: MediaMetadata,
    onProgress?: (progress: number) => void
): Promise<boolean> {
    // 進捗計算のために動画の長さを取得
    let duration = 0
    try {
        const info = await getMediaMetadata(sourcePath)
        if (info && info.duration) {
            duration = info.duration
        }
    } catch (e) {
        console.warn('[ffmpeg] Failed to get duration for progress:', e)
    }

    return new Promise((resolve) => {
        // 基本オプション: ビデオ・オーディオはコピー
        const args = [
            '-i', sourcePath,
        ]

        // サムネイルがある場合、入力として追加
        const hasThumbnail = metadata.thumbnailPath && fs.existsSync(metadata.thumbnailPath)
        if (hasThumbnail) {
            args.push('-i', metadata.thumbnailPath!)
        }

        // マップ設定
        args.push('-map', '0') // 元ファイルの全ストリーム
        if (hasThumbnail) {
            args.push('-map', '1') // サムネイル画像
            args.push('-c:v:1', 'png') // サムネイルはpng
            args.push('-disposition:v:1', 'attached_pic') // カバーアートとして設定
        }

        args.push('-c:v:0', 'copy') // メイン映像はコピー
        args.push('-c:a', 'copy')   // 音声はコピー

        // メタデータ設定
        // 注意: FFmpegの引数順序は重要。出力ファイルの直前に配置する。
        if (metadata.title) {
            args.push('-metadata', `title=${metadata.title}`)
            // Movieタグはmp4等で有効な場合があるが、FFmpegの標準キーではない場合も。
        }

        if (metadata.artist) {
            args.push('-metadata', `artist=${metadata.artist}`)
            args.push('-metadata', `performer=${metadata.artist}`) // 投稿者
        }

        if (metadata.description) {
            args.push('-metadata', `description=${metadata.description}`)
        }

        if (metadata.date) {
            args.push('-metadata', `date=${metadata.date}`)
            args.push('-metadata', `creation_time=${metadata.date}`)
        }

        if (metadata.url) {
            args.push('-metadata', `comment=${metadata.url}`)
        }

        args.push('-y', destPath)

        console.log(`[ffmpeg] Embedding metadata for: ${sourcePath}`)

        const ffmpegPath = getFFmpegPath()
        const ffmpeg = spawn(ffmpegPath, args)

        if (onProgress && duration > 0) {
            ffmpeg.stderr.on('data', (data) => {
                const str = data.toString()
                // time=00:00:00.00 を解析
                const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/)
                if (timeMatch) {
                    const hours = parseFloat(timeMatch[1])
                    const minutes = parseFloat(timeMatch[2])
                    const seconds = parseFloat(timeMatch[3])
                    const currentTime = (hours * 3600) + (minutes * 60) + seconds

                    const progress = Math.min(100, Math.round((currentTime / duration) * 100))
                    onProgress(progress)
                }
            })
        }

        ffmpeg.on('close', (code: number) => {
            if (code === 0 && fs.existsSync(destPath)) {
                console.log(`[ffmpeg] Metadata embedding completed: ${destPath}`)
                if (onProgress) onProgress(100)
                resolve(true)
            } else {
                console.error(`[ffmpeg] Metadata embedding failed with code ${code}`)
                // 失敗した場合はファイルを削除
                if (fs.existsSync(destPath)) {
                    try {
                        fs.unlinkSync(destPath)
                    } catch (e) {
                        console.error('Failed to delete incomplete file:', e)
                    }
                }
                resolve(false)
            }
        })

        ffmpeg.on('error', (err: Error) => {
            console.error(`[ffmpeg] Error: ${err.message}`)
            resolve(false)
        })
    })
}
