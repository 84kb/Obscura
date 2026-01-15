import crypto from 'crypto'
import { machineIdSync } from 'node-machine-id'

/**
 * ハードウェアIDを取得
 * セキュリティ: マシン固有のIDを取得し、トークン生成に使用
 */
export function getHardwareId(): string {
    try {
        // マシンIDを取得（CPU ID、MAC Addressなどから生成）
        const machineId = machineIdSync(true)

        // SHA-256でハッシュ化してプライバシーを保護
        const hash = crypto.createHash('sha256')
        hash.update(machineId)
        return hash.digest('hex')
    } catch (error) {
        console.error('Failed to get hardware ID:', error)
        // フォールバック: ランダムなIDを生成（セキュリティ警告）
        console.warn('WARNING: Using random hardware ID. This is less secure.')
        return crypto.randomBytes(32).toString('hex')
    }
}

/**
 * ユーザートークンを生成（外部ユーザー側）
 * セキュリティ: HMAC-SHA256を使用し、タイムスタンプとソルトで一意性を確保
 */
export function generateUserToken(hardwareId: string): string {
    const timestamp = Date.now().toString()
    const salt = crypto.randomBytes(16).toString('hex')

    // HMAC-SHA256でトークン生成
    const hmac = crypto.createHmac('sha256', hardwareId)
    hmac.update(timestamp + salt)
    const token = hmac.digest('hex')

    // トークン形式: timestamp.salt.token（検証用）
    return `${timestamp}.${salt}.${token}`
}

/**
 * アクセストークンを生成（ホスト側）
 * セキュリティ: ユーザートークン、ホストシークレット、権限、タイムスタンプを組み合わせ
 */
export function generateAccessToken(
    userToken: string,
    hostSecret: string,
    permissions: string[],
    userId: string
): string {
    const timestamp = Date.now().toString()

    // HMAC-SHA256でアクセストークン生成
    const hmac = crypto.createHmac('sha256', hostSecret)
    hmac.update(userToken + permissions.join(',') + userId + timestamp)
    const token = hmac.digest('hex')

    // トークン形式: userId.timestamp.token
    return `${userId}.${timestamp}.${token}`
}

/**
 * ユーザートークンを検証
 * セキュリティ: トークンの形式と有効期限をチェック
 * 対応形式: timestamp.salt.token または プレーン16進数
 */
export function validateUserToken(token: string): { valid: boolean; timestamp?: number } {
    try {
        if (!token || typeof token !== 'string') {
            return { valid: false }
        }

        const parts = token.split('.')

        // プレーン16進数形式のサポート (32文字または64文字の16進数)
        if (parts.length === 1 && /^[0-9a-f]{32,64}$/i.test(token)) {
            return { valid: true }
        }

        // timestamp.salt.token 形式
        if (parts.length !== 3) {
            return { valid: false }
        }

        const [timestampStr, _salt, _tokenHash] = parts
        const timestamp = parseInt(timestampStr, 10)

        // タイムスタンプの妥当性チェック（未来の日付でないか - 時刻ズレを考慮して5分猶予）
        // クライアントとサーバーの時刻がずれている可能性があるため
        const allowSkew = 5 * 60 * 1000
        if (timestamp > Date.now() + allowSkew) {
            return { valid: false }
        }

        // トークンが古すぎないかチェック（30日以内）
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000
        if (Date.now() - timestamp > thirtyDaysInMs) {
            return { valid: false }
        }

        return { valid: true, timestamp }
    } catch (error) {
        return { valid: false }
    }
}

/**
 * アクセストークンを検証
 * セキュリティ: トークンの形式と有効期限をチェック
 * 対応形式: userId.timestamp.token または プレーン16進数
 */
export function validateAccessToken(token: string): { valid: boolean; userId?: string; timestamp?: number } {
    try {
        if (!token || typeof token !== 'string') {
            return { valid: false }
        }

        const parts = token.split('.')

        // プレーン16進数形式のサポート (64文字の16進数)
        if (parts.length === 1 && /^[0-9a-f]{64}$/i.test(token)) {
            return { valid: true }
        }

        // userId.timestamp.token 形式
        if (parts.length !== 3) {
            return { valid: false }
        }

        const [userId, timestampStr, _tokenHash] = parts
        const timestamp = parseInt(timestampStr, 10)

        // タイムスタンプの妥当性チェック（時刻ズレを考慮して5分猶予）
        const allowSkew = 5 * 60 * 1000
        if (timestamp > Date.now() + allowSkew) {
            return { valid: false }
        }

        // トークンが古すぎないかチェック（90日以内）
        const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000
        if (Date.now() - timestamp > ninetyDaysInMs) {
            return { valid: false }
        }

        return { valid: true, userId, timestamp }
    } catch (error) {
        return { valid: false }
    }
}

/**
 * ホストシークレットを生成
 * セキュリティ: 暗号学的に安全な乱数を使用
 */
export function generateHostSecret(): string {
    return crypto.randomBytes(64).toString('hex')
}

/**
 * データを暗号化（AES-256-GCM）
 * セキュリティ: 認証付き暗号化で改ざんを防止
 */
export function encryptData(data: string, key: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 64), 'hex'), iv)

    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    // IV + AuthTag + 暗号化データ
    return iv.toString('hex') + '.' + authTag.toString('hex') + '.' + encrypted
}

/**
 * データを復号化（AES-256-GCM）
 * セキュリティ: 認証タグを検証して改ざんを検出
 */
export function decryptData(encryptedData: string, key: string): string | null {
    try {
        const parts = encryptedData.split('.')
        if (parts.length !== 3) {
            return null
        }

        const [ivHex, authTagHex, encrypted] = parts
        const iv = Buffer.from(ivHex, 'hex')
        const authTag = Buffer.from(authTagHex, 'hex')

        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key.slice(0, 64), 'hex'), iv)
        decipher.setAuthTag(authTag)

        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        return decrypted
    } catch (error) {
        console.error('Decryption failed:', error)
        return null
    }
}

/**
 * パスワードベースのキー導出（PBKDF2）
 * セキュリティ: パスワードから安全な暗号鍵を生成
 */
export function deriveKey(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')
}

/**
 * 安全なランダム文字列を生成
 */
export function generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
}
