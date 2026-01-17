import { useState } from 'react'
import { Notification, useNotification } from '../../contexts/NotificationContext'
import './NotificationContainer.css'

interface NotificationItemProps {
    notification: Notification
}

export const NotificationItem = ({ notification }: NotificationItemProps) => {
    const { removeNotification } = useNotification()
    const [isExiting, setIsExiting] = useState(false)

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation()
        close()
    }

    const close = () => {
        setIsExiting(true)
        setTimeout(() => {
            removeNotification(notification.id)
        }, 300) // Animation duration
    }

    // アイコンのレンダリング
    const renderIcon = () => {
        switch (notification.type) {
            case 'success':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                )
            case 'error':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                )
            case 'info':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                )
            case 'progress':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                )
            default:
                return null
        }
    }

    return (
        <div
            className={`notification-item ${notification.type} ${isExiting ? 'exiting' : ''}`}
            onClick={close}
        >
            <div className="notification-header">
                <div className="notification-icon">
                    {renderIcon()}
                </div>
                <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    {notification.message && (
                        <div className="notification-message">{notification.message}</div>
                    )}
                </div>
                {notification.type !== 'progress' && (
                    <button className="notification-close" onClick={handleClose}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="6"></line>
                        </svg>
                    </button>
                )}
            </div>

            {notification.type === 'progress' && notification.progress !== undefined && (
                <div className="notification-progress-container">
                    <div
                        className="notification-progress-bar"
                        style={{ width: `${notification.progress}%` }}
                    ></div>
                </div>
            )}
        </div>
    )
}
