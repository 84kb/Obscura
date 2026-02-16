import { useState, useEffect, useCallback } from 'react'
import { ClientConfig } from '../types'
import { api } from '../api'

export const useSettings = () => {
    const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true)
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
