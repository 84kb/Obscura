
/**
 * リモートライブラリのトークンから認証情報を抽出する
 * token format: "accessToken" OR "userToken:accessToken"
 */
export function parseRemoteToken(token: string, fallbackUserToken: string) {
    let userToken = fallbackUserToken
    let accessToken = token

    if (token && token.includes(':')) {
        const parts = token.split(':')
        // トリムして余分なスペースを除去
        userToken = parts[0].trim()
        accessToken = parts[1].trim()
    }

    return { userToken, accessToken }
}

/**
 * リモートAPI呼び出し用のヘッダーを生成する
 */
export function getAuthHeaders(token: string, fallbackUserToken: string) {
    const { userToken, accessToken } = parseRemoteToken(token, fallbackUserToken)
    return {
        'Authorization': `Bearer ${accessToken}`,
        'X-User-Token': userToken
    }
}

/**
 * リモートAPI呼び出し用のクエリパラメータオブジェクトを生成する
 */
export function getAuthQuery(token: string, fallbackUserToken: string) {
    const { userToken, accessToken } = parseRemoteToken(token, fallbackUserToken)
    return { userToken, accessToken }
}
