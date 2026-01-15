/**
 * ローカルファイルパスを media:// プロトコル形式のURLに変換する
 * @param filePath 絶対パス
 * @returns media://<path> 形式のURL
 */
export function toMediaUrl(filePath: string | null): string {
    if (!filePath) return ''

    // HTTP(S) URLの場合はそのまま返す
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath
    }

    // Windowsのバックスラッシュをスラッシュに置換
    const normalizedPath = filePath.replace(/\\/g, '/')

    // パスを分割してエンコード
    // ドライブレター（C:）とスラッシュは保持し、各セグメントをエンコード
    const parts = normalizedPath.split('/')
    const encodedParts = parts.map((part, index) => {
        // ドライブレター（例: "C:"）はそのまま
        if (index === 0 && part.endsWith(':')) {
            return part
        }
        // 空文字列（連続するスラッシュ）はそのまま
        if (part === '') {
            return part
        }
        // それ以外はエンコード
        return encodeURIComponent(part)
    })

    return `media://${encodedParts.join('/')}`
}
