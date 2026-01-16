import React from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { NotificationItem } from './NotificationItem'
import './NotificationContainer.css'

export const NotificationContainer = () => {
    const { notifications } = useNotification()

    return (
        <div className="notification-container">
            {notifications.map(notification => (
                <NotificationItem
                    key={notification.id}
                    notification={notification}
                />
            ))}
        </div>
    )
}
