import { useState, useEffect, useCallback } from 'react'
import { ClientConfig } from '@obscura/core'
import { api } from '../api'

export const useSettings = () => {
    const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const config = await api.getClientConfig()
            setClientConfig(config)
        } catch (err: any) {
            console.error('Failed to load settings:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    useEffect(() => {
        return api.on('client-config-updated', (_event: any, config: ClientConfig) => {
            if (config) {
                setClientConfig(config)
                setLoading(false)
                setError(null)
            }
        })
    }, [])

    const updateClientConfig = useCallback(async (updates: Partial<ClientConfig>) => {
        try {
            const newConfig = await api.updateClientConfig(updates)
            setClientConfig(newConfig)
            return newConfig
        } catch (err: any) {
            console.error('Failed to update settings:', err)
            throw err
        }
    }, [])

    return {
        clientConfig,
        loading,
        error,
        updateClientConfig,
        reloadSettings: loadSettings
    }
}
