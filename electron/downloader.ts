import fs from 'fs'
import path from 'path'

/**
 * URLからファイルをダウンロードして保存する
 * @param url ダウンロード元のURL
 * @param saveDir 保存先ディレクトリ (絶対パス)
 * @param defaultFilename デフォルトのファイル名 (URLから取得できない場合に使用)
 * @returns 保存されたファイルのフルパス
 */
export async function downloadFile(url: string, saveDir: string, defaultFilename: string): Promise<string> {
    try {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
        }

        // ファイル名を決定
        // Content-Dispositionヘッダーがあればそこから取得、なければURLの最後、それもなければデフォルト
        let filename = defaultFilename
        const disposition = response.headers.get('content-disposition')
        if (disposition && disposition.includes('filename=')) {
            const match = disposition.match(/filename="?([^"]+)"?/)
            if (match && match[1]) {
                filename = match[1]
            }
        } else {
            // URLからファイル名抽出を試みる (http://host/stream/123 -> 123.mp4 とは限らない)
            // Obscuraの場合は /api/stream/:id なので、ファイル名はメタデータから決まる...
            // しかしここではURLしか渡されないので、呼び出し元からファイル名を渡してもらう方が安全。
            // 引数の defaultFilename を優先して使う設計にする。
        }

        // 重複チェック: 数字を付加して回避
        let savePath = path.join(saveDir, filename)
        let counter = 1
        const ext = path.extname(filename)
        const name = path.basename(filename, ext)

        while (fs.existsSync(savePath)) {
            savePath = path.join(saveDir, `${name} (${counter})${ext}`)
            counter++
        }

        // ディレクトリ生成
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true })
        }

        // ストリームで保存 (Node.js Stream)
        // fetchのbodyはWeb Streamなので、Node Streamに変換が必要、またはarrayBufferを使う
        // Electron Main Process (Node) なので、bodyは ReadableStream (Web API)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        await fs.promises.writeFile(savePath, buffer)

        return savePath
    } catch (error) {
        console.error('Download failed:', error)
        throw error
    }
}
