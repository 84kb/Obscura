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
): Promise<string | null> {
    let userToken = myUserToken
    let accessToken = remoteLib.token
    let currentUrl = remoteLib.url.replace(/\/$/, '')
    let tryAlternateProtocol = true

    if (remoteLib.token.includes(':')) {
        const parts = remoteLib.token.split(':')
        userToken = parts[0]
        accessToken = parts[1]
    }

    const checkHealth = async (url: string): Promise<boolean> => {
        const healthUrl = `${url}/api/health`
        try {
            const response = await fetch(healthUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-User-Token': userToken
                },
                signal: AbortSignal.timeout(3000)
            })
            return response.ok
        } catch (e) {
            return false
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 現在のURLで試行
        if (await checkHealth(currentUrl)) {
            console.log(`[Remote Health] Connection established to ${remoteLib.name} (attempt ${attempt}/${maxRetries})`)
            return currentUrl
        }

        console.warn(`[Remote Health] Attempt ${attempt}/${maxRetries} failed for ${currentUrl}`)

        // 失敗した場合、一度だけプロトコルを切り替えて試行
        if (tryAlternateProtocol) {
            const altUrl = currentUrl.startsWith('https://')
                ? currentUrl.replace('https://', 'http://')
                : currentUrl.replace('http://', 'https://')

            console.log(`[Remote Health] Trying alternate protocol: ${altUrl}`)
            if (await checkHealth(altUrl)) {
                console.log(`[Remote Health] Connection established using alternate protocol: ${altUrl}`)
                return altUrl
            }
            // プロトコル切り替えは各リトライで1回試すが、成功しなかった場合は元のURLでリトライ継続
        }

        // 最後の試行でなければ待機
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
    }

    console.error(`[Remote Health] Failed to connect to ${remoteLib.name} after ${maxRetries} attempts`)
    return null
}
