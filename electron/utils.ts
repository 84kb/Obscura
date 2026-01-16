import * as path from 'path'
import * as fs from 'fs-extra'

/**
 * サムネイルの保存先パスを計算する
 * @param libraryPath ライブラリのルートパス
 * @param mediaId メディアID
 * @param originalFilePath メディアファイルのフルパス
 * @returns サムネイルの保存先フルパス
 */
export async function getThumbnailPath(libraryPath: string, mediaId: number, originalFilePath: string): Promise<string> {
    const fileName = path.basename(originalFilePath)
    const baseName = path.basename(originalFilePath, path.extname(originalFilePath))

    // メディアファイルが既に images/ 配下のフォルダにあるかチェック (インポート済み)
    const dirPath = path.dirname(originalFilePath)
    const parentDir = path.basename(path.dirname(dirPath))

    let destDir: string
    if (parentDir === 'images') {
        // インポート済みメディア: 同じディレクトリに保存
        destDir = dirPath
    } else {
        // 外部ファイルまたは旧形式: images/<mediaId>/ に保存
        destDir = path.join(libraryPath, 'images', mediaId.toString())
        await fs.ensureDir(destDir)
    }

    return path.join(destDir, `${baseName}_thumbnail.png`)
}
