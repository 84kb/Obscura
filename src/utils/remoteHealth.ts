import { RemoteLibrary } from '../types'

/**
 * リモートライブラリへの接続確認（ヘルスチェック）
 * 
 * @param remoteLib リモートライブラリ情報
 * @param myUserToken ユーザートークン
 * @param maxRetries 最大リトライ回数（デフォルト: 5）
 * @param retryDelay リトライ間隔（ミリ秒、デフォルト: 1000）
 * @returns 接続成功時は true、失敗時は false
 */
export async function waitForRemoteConnection(
    remoteLib: RemoteLibrary,
    myUserToken: string,
    maxRetries: number = 5,
    retryDelay: number = 1000
): Promise<boolean> {
    let userToken = myUserToken
    let accessToken = remoteLib.token

    if (remoteLib.token.includes(':')) {
        const parts = remoteLib.token.split(':')
        userToken = parts[0]
        accessToken = parts[1]
    }

    const baseUrl = remoteLib.url.replace(/\/$/, '')
    const healthUrl = `${baseUrl}/api/health`

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(healthUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-User-Token': userToken
                },
                signal: AbortSignal.timeout(3000) // 3秒タイムアウト
            })

            if (response.ok) {
                console.log(`[Remote Health] Connection established to ${remoteLib.name} (attempt ${attempt}/${maxRetries})`)
                return true
            }

            console.warn(`[Remote Health] Attempt ${attempt}/${maxRetries} failed: ${response.status} ${response.statusText}`)
        } catch (error: any) {
            console.warn(`[Remote Health] Attempt ${attempt}/${maxRetries} failed:`, error.message)
        }

        // 最後の試行でなければ待機
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
    }

    console.error(`[Remote Health] Failed to connect to ${remoteLib.name} after ${maxRetries} attempts`)
    return false
}
