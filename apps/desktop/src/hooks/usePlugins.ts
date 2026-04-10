import { useState, useEffect } from 'react'
import { ObscuraPlugin } from '@obscura/core'

export function usePlugins(): ObscuraPlugin[] {
    const [plugins, setPlugins] = useState<ObscuraPlugin[]>(() => {
        return window.ObscuraAPI ? [...window.ObscuraAPI.getPlugins()] : []
    })

    useEffect(() => {
        const handlePluginRegistered = () => {
            if (window.ObscuraAPI) {
                setPlugins([...window.ObscuraAPI.getPlugins()])
            }
        }

        window.addEventListener('plugin-registered', handlePluginRegistered)

        // 初回マウント時にも念のため確認する
        handlePluginRegistered()

        return () => {
            window.removeEventListener('plugin-registered', handlePluginRegistered)
        }
    }, [])

    return plugins
}

export function useCommentProviders(): ObscuraPlugin[] {
    return usePlugins().filter((plugin) => (
        typeof plugin.canHandle === 'function' &&
        (typeof plugin.fetchData === 'function' || typeof (plugin as any).fetchComments === 'function')
    ))
}
