import { useState, useEffect } from 'react'
import { CommentProvider } from '@obscura/core'

export function useCommentProviders(): CommentProvider[] {
    const [providers, setProviders] = useState<CommentProvider[]>(() => {
        return window.ObscuraAPI ? [...window.ObscuraAPI.getCommentProviders()] : []
    })

    useEffect(() => {
        const handlePluginRegistered = () => {
            if (window.ObscuraAPI) {
                setProviders([...window.ObscuraAPI.getCommentProviders()])
            }
        }

        window.addEventListener('plugin-registered', handlePluginRegistered)

        // 初回マウント時にも念のため確認する
        handlePluginRegistered()

        return () => {
            window.removeEventListener('plugin-registered', handlePluginRegistered)
        }
    }, [])

    return providers
}
