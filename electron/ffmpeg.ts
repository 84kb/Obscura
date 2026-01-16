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
