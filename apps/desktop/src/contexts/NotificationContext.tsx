import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type NotificationType = 'info' | 'success' | 'error' | 'progress'

export interface Notification {
    id: string
    type: NotificationType
    title: string
    message?: string
    progress?: number // 0-100
    duration?: number // ms, null/undefined for default, 0 for sticky
}

interface NotificationContextType {
    notifications: Notification[]
    addNotification: (notification: Omit<Notification, 'id'>) => string
    removeNotification: (id: string) => void
    updateProgress: (id: string, progress: number) => void
    clearNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const useNotification = () => {
    const context = useContext(NotificationContext)
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider')
    }
    return context
}

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const [notifications, setNotifications] = useState<Notification[]>([])

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])

    const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        const id = crypto.randomUUID()
        const newNotification = { ...notification, id }

        setNotifications(prev => {
            // Maximum 5 notifications at a time to prevent clutter
            const current = [...prev, newNotification]
            if (current.length > 5) {
                return current.slice(current.length - 5)
            }
            return current
        })

        // Auto-dismiss logic
        if (notification.type !== 'progress' && notification.duration !== 0) {
            const duration = notification.duration || 5000
            setTimeout(() => {
                removeNotification(id)
            }, duration)
        }

        return id
    }, [removeNotification])

    const updateProgress = useCallback((id: string, progress: number) => {
        setNotifications(prev => prev.map(n =>
            n.id === id ? { ...n, progress } : n
        ))
    }, [])

    const clearNotifications = useCallback(() => {
        setNotifications([])
    }, [])

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, updateProgress, clearNotifications }}>
            {children}
        </NotificationContext.Provider>
    )
}
