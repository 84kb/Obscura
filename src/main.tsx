import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initMockElectronAPI } from './utils/mockElectronAPI'

import { NotificationProvider } from './contexts/NotificationContext'
import { NotificationContainer } from './components/Notification/NotificationContainer'

// ブラウザ環境でElectron APIがない場合はモックを注入
initMockElectronAPI()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <NotificationProvider>
            <App />
            <NotificationContainer />
        </NotificationProvider>
    </React.StrictMode>,
)
