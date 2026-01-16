import fs from 'fs'
import path from 'path'

/**
 * URLからファイルをダウンロードして保存する
 * @param url ダウンロード元のURL
 * @param saveDir 保存先ディレクトリ (絶対パス)
 * @param defaultFilename デフォルトのファイル名 (URLから取得できない場合に使用)
 * @returns 保存されたファイルのフルパス
 */
export async function downloadFile(url: string, saveDir: string, defaultFilename: string, onProgress?: (received: number, total: number) => void): Promise<string> {
    try {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
        }

        // ファイル名を決定
        let filename = defaultFilename
        const disposition = response.headers.get('content-disposition')
        if (disposition && disposition.includes('filename=')) {
            const match = disposition.match(/filename="?([^"]+)"?/)
            if (match && match[1]) {
                filename = match[1]
            }
        }

        // 重複チェック
        let savePath = path.join(saveDir, filename)
        let counter = 1
        const ext = path.extname(filename)
        const name = path.basename(filename, ext)

        while (fs.existsSync(savePath)) {
            savePath = path.join(saveDir, `${name} (${counter})${ext}`)
            counter++
        }

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true })
        }

        // Content-Length 取得
        const contentLength = response.headers.get('content-length')
        const totalLength = contentLength ? parseInt(contentLength, 10) : 0
        let receivedLength = 0

        // Node.js Writable Stream
        const fileStream = fs.createWriteStream(savePath)

        // Web Stream (response.body) を Node Stream にパイプしつつ進捗計測
        // @ts-ignore: Readable.fromWeb is available in newer Node versions (Electron uses Node 18+)
        const { Readable } = require('stream')
        const readableWebStream = Readable.fromWeb(response.body)

        readableWebStream.on('data', (chunk: any) => {
            receivedLength += chunk.length
            if (onProgress) onProgress(receivedLength, totalLength)
        })

        await new Promise((resolve, reject) => {
            readableWebStream.pipe(fileStream)
            readableWebStream.on('error', reject)
            fileStream.on('finish', () => resolve(null))
            fileStream.on('error', reject)
        })

        return savePath
    } catch (error) {
        console.error('Download failed:', error)
        throw error
    }
}
