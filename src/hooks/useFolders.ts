import { useState, useCallback } from 'react'
import { Folder, Library, RemoteLibrary } from '../types'
import { api } from '../api'

export function useFolders(
    activeLibrary: Library | null,
    activeRemoteLibrary: RemoteLibrary | null,
    myUserToken: string
) {
    const [folders, setFolders] = useState<Folder[]>([])

    // フォルダー読み込み
    const loadFolders = useCallback(async () => {
        if (activeRemoteLibrary) {
            try {
                let userToken = myUserToken
                let accessToken = activeRemoteLibrary.token

                if (activeRemoteLibrary.token.includes(':')) {
                    const parts = activeRemoteLibrary.token.split(':')
                    userToken = parts[0]
                    accessToken = parts[1]
                }
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')

                const response = await fetch(`${baseUrl}/api/folders`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setFolders(data)
                }
            } catch (e) {
                console.error('Failed to load remote folders', e)
            }
        } else {
            try {
                const loadedFolders = await api.getFolders()
                setFolders(loadedFolders as Folder[])
            } catch (error) {
                console.error('Failed to load folders:', error)
            }
        }
    }, [activeRemoteLibrary, myUserToken])

    // フォルダー作成
    const createFolder = useCallback(async (name: string, parentId?: number | null) => {
        if (!activeLibrary && !activeRemoteLibrary) return null
        try {
            const newFolder = await api.createFolder(name, parentId)
            await loadFolders()
            return newFolder
        } catch (error) {
            console.error('Failed to create folder:', error)
            return null
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    // フォルダー削除
    const deleteFolder = useCallback(async (id: number) => {
        try {
            await api.deleteFolder(id)
            await loadFolders()
        } catch (error) {
            console.error('Failed to delete folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    // フォルダー名変更
    const renameFolder = useCallback(async (id: number, newName: string) => {
        try {
            await api.renameFolder(id, newName)
            await loadFolders()
        } catch (error) {
            console.error('Failed to rename folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    return {
        folders,
        setFolders,
        loadFolders,
        createFolder,
        deleteFolder,
        renameFolder
    }
}
