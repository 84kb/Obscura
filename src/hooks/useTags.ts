import { useState, useCallback } from 'react'
import { Tag, TagGroup, Library, RemoteLibrary } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../api'

export function useTags(
    activeLibrary: Library | null,
    activeRemoteLibrary: RemoteLibrary | null,
    myUserToken: string
) {
    const [tags, setTags] = useState<Tag[]>([])
    const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
    const { addNotification } = useNotification()

    // タグ読み込み
    const loadTags = useCallback(async () => {
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

                const response = await fetch(`${baseUrl}/api/tags`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setTags(data)
                }
            } catch (e) {
                console.error('Failed to load remote tags', e)
            }
        } else {
            try {
                const loadedTags = await api.getTags()
                setTags(loadedTags as Tag[])
            } catch (error) {
                console.error('Failed to load tags:', error)
            }
        }
    }, [activeRemoteLibrary, myUserToken])

    // タググループ読み込み
    const loadTagGroups = useCallback(async () => {
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

                const response = await fetch(`${baseUrl}/api/tag-groups`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setTagGroups(data)
                }
            } catch (e) {
                console.error('Failed to load remote tag groups', e)
            }
            return
        }
        try {
            const loadedGroups = await api.getTagGroups()
            setTagGroups(loadedGroups as TagGroup[])
        } catch (error) {
            console.error('Failed to load tag groups:', error)
        }
    }, [activeRemoteLibrary, myUserToken])

    // タグ作成
    const createTag = useCallback(async (name: string): Promise<Tag | null> => {
        if (!activeLibrary && !activeRemoteLibrary) return null
        try {
            if (activeRemoteLibrary) {
                try {
                    const newTag = await api.createRemoteTag(activeRemoteLibrary.url, activeRemoteLibrary.token, name)
                    await loadTags()
                    return newTag
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ作成の権限がありません。' })
                    }
                    throw e
                }
            }
            const newTag = await api.createTag(name)
            await loadTags()
            return newTag
        } catch (error) {
            console.error('Failed to create tag:', error)
            return null
        }
    }, [loadTags, activeLibrary, activeRemoteLibrary, addNotification])

    // タグ削除
    const deleteTag = useCallback(async (id: number) => {
        try {
            if (activeRemoteLibrary) {
                try {
                    await api.deleteRemoteTag(activeRemoteLibrary.url, activeRemoteLibrary.token, id)
                    await loadTags()
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ削除の権限がありません。' })
                    }
                    throw e
                }
            }
            await api.deleteTag(id)
            await loadTags()
        } catch (error) {
            console.error('Failed to delete tag:', error)
        }
    }, [loadTags, activeRemoteLibrary, addNotification])

    return {
        tags,
        tagGroups,
        setTags, // Exposed for optimistic updates by parent if incredibly necessary (though better to keep internal or expose specific mutators)
        loadTags,
        loadTagGroups,
        createTag,
        deleteTag
    }
}
