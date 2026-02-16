import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
// import App from './App' // Lazy loaded below
import { initMockElectronAPI } from './utils/mockElectronAPI'

import { NotificationProvider } from './contexts/NotificationContext'
import { NotificationContainer } from './components/Notification/NotificationContainer'

import { Capacitor } from '@capacitor/core';
import './styles/mobile.css' // Ensure mobile styles are available if needed, though MobileApp imports them too.

// Lazy load components to avoid importing heavy dependencies for the wrong platform
const App = lazy(() => import('./App'))
const MobileApp = lazy(() => import('./mobile/MobileApp'))

// ブラウザ環境でElectron APIがない場合はモックを注入
if (!Capacitor.isNativePlatform()) {
    initMockElectronAPI()
}

// Check for mobile platform
const isMobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <NotificationProvider>
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white' }}>Loading...</div>}>
                {isMobile ? <MobileApp /> : <App />}
            </Suspense>
            <NotificationContainer />
        </NotificationProvider>
    </React.StrictMode>
)
