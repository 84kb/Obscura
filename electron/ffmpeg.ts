import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs-extra'

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

        const ffmpeg = spawn('ffmpeg', args)

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
 * 動画ファイルからメタデータを取得する
 */
export async function getVideoMetadata(filePath: string): Promise<{ width?: number; height?: number; duration?: number; artist?: string; description?: string }> {
    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration:format_tags=artist,uploader,performer,comment,description,DESCRIPTION',
            '-of', 'json',
            filePath
        ]

        const ffprobe = spawn('ffprobe', args)
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
                    if (json.streams && json.streams[0]) {
                        const s = json.streams[0]
                        width = s.width
                        height = s.height
                        duration = parseFloat(s.duration)
                    }

                    // フォーマットタグからアーティスト/投稿者を取得
                    // 優先順位: artist > uploader > performer
                    if (json.format && json.format.tags) {
                        const tags = json.format.tags
                        artist = tags.artist || tags.ARTIST || tags.Artist ||
                            tags.uploader || tags.UPLOADER || tags.Uploader ||
                            tags.performer || tags.PERFORMER || tags.Performer ||
                            undefined

                        description = tags.description || tags.DESCRIPTION || tags.Description ||
                            tags.comment || tags.COMMENT || tags.Comment ||
                            undefined
                    }

                    resolve({ width, height, duration, artist, description })
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
