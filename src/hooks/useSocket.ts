import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseSocketOptions {
    enabled: boolean
    url?: string
    userToken?: string
    accessToken?: string
}

export function useSocket({ enabled, url, userToken, accessToken }: UseSocketOptions) {
    const socketRef = useRef<Socket | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        if (!enabled || !url || !userToken || !accessToken) {
            // 条件を満たさない場合は切断
            if (socketRef.current) {
                socketRef.current.disconnect()
                socketRef.current = null
                setIsConnected(false)
            }
            return
        }

        // 既に接続済みでURLが変わっていないか確認
        // (厳密には再接続ロジックが必要だが、URLが変われば再作成する)

        try {
            // URLの末尾のスラッシュ削除などの正規化
            const socketUrl = url.replace(/\/$/, '')

            console.log(`Creating socket connection to ${socketUrl}`)

            socketRef.current = io(socketUrl, {
                auth: {
                    token: accessToken,
                    userToken: userToken
                },
                transports: ['websocket'], // WebSocket優先
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            })

            socketRef.current.on('connect', () => {
                console.log('Socket connected:', socketRef.current?.id)
                setIsConnected(true)
            })

            socketRef.current.on('disconnect', (reason) => {
                console.log('Socket disconnected:', reason)
                setIsConnected(false)
            })

            socketRef.current.on('connect_error', (err) => {
                console.error('Socket connect error:', err.message)
                setIsConnected(false)
            })

        } catch (error) {
            console.error('Failed to create socket:', error)
        }

        return () => {
            if (socketRef.current) {
                console.log('Cleaning up socket...')
                socketRef.current.disconnect()
                socketRef.current = null
                setIsConnected(false)
            }
        }
    }, [enabled, url, userToken, accessToken])

    // イベントリスナー登録用ヘルパー
    const subscribe = (event: string, callback: (...args: any[]) => void) => {
        if (!socketRef.current) return () => { }
        socketRef.current.on(event, callback)
        return () => {
            socketRef.current?.off(event, callback)
        }
    }

    return {
        socket: socketRef.current,
        isConnected,
        subscribe
    }
}
