import DiscordRPC from 'discord-rpc'

// これは仮のClient IDです。
// Discord Developer Portalでアプリケーションを作成し、ここを自身のClient IDに置き換えてください。
const CLIENT_ID = '1462710290322952234'

let rpc: DiscordRPC.Client | null = null
let isReady = false

export async function initDiscordRpc() {
    if (rpc) return // 既に初期化済み

    try {
        // 設定を確認
        const { getConfig } = await import('./settings')
        const config = getConfig()
        if (!config.discordRichPresenceEnabled) {
            console.log('[Discord RPC] Disabled by user settings')
            return
        }

        rpc = new DiscordRPC.Client({ transport: 'ipc' })

        rpc.on('ready', () => {
            console.log('[Discord RPC] Connected and ready')
            isReady = true
        })

        rpc.on('disconnected', () => {
            console.log('[Discord RPC] Disconnected')
            isReady = false
            rpc = null
        })

        // タイムアウト付きでログイン試行
        const loginPromise = rpc.login({ clientId: CLIENT_ID })
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        )

        await Promise.race([loginPromise, timeoutPromise])
        console.log('[Discord RPC] Successfully connected')
    } catch (error: any) {
        // エラーを適切に処理(アプリケーションの起動は継続)
        if (error.message === 'Connection timeout') {
            console.log('[Discord RPC] Connection timeout - Discord may not be running')
        } else if (error.message?.includes('ENOENT')) {
            console.log('[Discord RPC] Discord client not found')
        } else if (error.message?.includes('RPC_CONNECTION_TIMEOUT')) {
            console.log('[Discord RPC] RPC connection timeout - Discord may not be running')
        } else {
            console.log('[Discord RPC] Failed to connect:', error.message || error)
        }

        // クリーンアップ
        if (rpc) {
            try {
                rpc.destroy()
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        rpc = null
        isReady = false
    }
}

export function destroyDiscordRpc() {
    if (rpc) {
        try {
            rpc.destroy()
        } catch (e) {
            console.error('[Discord RPC] Error during destroy:', e)
        }
        rpc = null
        isReady = false
        console.log('[Discord RPC] Destroyed')
    }
}

export interface ActivityOptions {
    details?: string
    state?: string
    startTimestamp?: number
    endTimestamp?: number
    largeImageKey?: string
    largeImageText?: string
    smallImageKey?: string
    smallImageText?: string
    instance?: boolean
}

export async function updateActivity(activity: ActivityOptions) {
    if (!rpc || !isReady) return

    try {
        await rpc.setActivity({
            details: activity.details,
            state: activity.state,
            startTimestamp: activity.startTimestamp,
            endTimestamp: activity.endTimestamp,
            largeImageKey: activity.largeImageKey || 'app_icon', // デフォルトのアプリアイコンキー (DevPortalで設定が必要)
            largeImageText: activity.largeImageText || 'バヒューン',
            smallImageKey: activity.smallImageKey,
            smallImageText: activity.smallImageText,
            instance: false,
        })
    } catch (e) {
        console.error('[Discord RPC] Failed to set activity:', e)
    }
}

export async function clearActivity() {
    if (!rpc || !isReady) return

    try {
        await rpc.clearActivity()
    } catch (e) {
        console.error('[Discord RPC] Failed to clear activity:', e)
    }
}
