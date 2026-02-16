import { RemoteLibrary } from '../types'
import { getAuthHeaders } from './auth'

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
    let currentUrl = remoteLib.url.replace(/\/$/, '')
    let tryAlternateProtocol = true

    const checkHealth = async (url: string): Promise<boolean> => {
        const healthUrl = `${url}/api/health`
        const authCheckUrl = `${url}/api/profile`
        try {
            // 1. 物理的な接続確認 (Health Check)
            const response = await fetch(healthUrl, {
                headers: getAuthHeaders(remoteLib.token, myUserToken),
                signal: AbortSignal.timeout(3000)
            })
            if (!response.ok) return false

            // 2. 認証確認 (Auth Check)
            // Health Checkが通っても認証が通らないと意味がないため、ここでチェックする
            console.log(`[Remote Health] Checking auth for ${authCheckUrl}. UserToken: ${myUserToken.substring(0, 10)}...`)
            const authResponse = await fetch(authCheckUrl, {
                headers: getAuthHeaders(remoteLib.token, myUserToken),
                signal: AbortSignal.timeout(3000)
            })

            if (!authResponse.ok) {
                if (authResponse.status === 401) {
                    console.warn(`[Remote Health] Auth failed for ${url} (401 Unauthorized)`)
                }
                return false
            }

            return true
        } catch (e) {
            return false
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 現在のURLで試行
        if (await checkHealth(currentUrl)) {
            console.log(`[Remote Health] Connection and Auth established to ${remoteLib.name} (attempt ${attempt}/${maxRetries})`)
            return currentUrl
        }

        console.warn(`[Remote Health] Attempt ${attempt}/${maxRetries} failed for ${currentUrl}`)

        // 失敗した場合、一度だけプロトコルを切り替えて試行
        if (tryAlternateProtocol) {
            const altUrl = currentUrl.startsWith('https://')
                ? currentUrl.replace('https://', 'http://')
                : currentUrl.replace('http://', 'https://')

            console.log(`[Remote Health] Trying alternate protocol: ${altUrl}`)
            const altSuccess = await checkHealth(altUrl)

            if (altSuccess) {
                console.log(`[Remote Health] Connection established using alternate protocol: ${altUrl}`)
                return altUrl
            } else {
                console.warn(`[Remote Health] Alternate protocol also failed: ${altUrl}`)
            }

            // 一度試したらフラグをfalseにして、次回以降は試さない
            tryAlternateProtocol = false
        }

        // 最後の試行でなければ待機
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
    }

    console.error(`[Remote Health] Failed to connect to ${remoteLib.name} after ${maxRetries} attempts`)
    return null
}
