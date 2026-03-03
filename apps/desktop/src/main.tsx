import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
// import App from './App' // Lazy loaded below
import { initMockDesktopAPI } from './utils/mockDesktopAPI'
import { initTauriDesktopBridge } from './utils/tauriDesktopBridge'

import { NotificationProvider } from './contexts/NotificationContext'
import { NotificationContainer } from './components/Notification/NotificationContainer'

import { Capacitor } from '@capacitor/core';
import './styles/mobile.css' // Ensure mobile styles are available if needed, though MobileApp imports them too.

// Lazy load components to avoid importing heavy dependencies for the wrong platform
const App = lazy(() => import('./App'))
const MobileApp = lazy(() => import('./mobile/MobileApp'))

// 繝悶Λ繧ｦ繧ｶ迺ｰ蠅・〒Desktop API縺後↑縺・ｴ蜷医・繝｢繝・け繧呈ｳｨ蜈･
initTauriDesktopBridge()

if (!Capacitor.isNativePlatform() && !(window as any).obscuraAPI) {
    initMockDesktopAPI()
}

// 繝・・繝槭・蜊ｳ譎る←逕ｨ縺ｯ index.html 縺ｮ繧､繝ｳ繝ｩ繧､繝ｳ繧ｹ繧ｯ繝ｪ繝励ヨ縺ｧ蜃ｦ逅・ｸ医∩
// ・・SS隱ｭ縺ｿ霎ｼ縺ｿ繧医ｊ蜑阪↓螳溯｡後＆繧後ｋ縺溘ａ縲，trl+R縺ｧ繧ゅヵ繝ｩ繝・す繝･縺励↑縺・ｼ・
// Check for mobile platform
const isMobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

import NiconiComments from '@xpadev-net/niconicomments'
// @ts-ignore expose for plugin runtime
window.NiconiComments = NiconiComments;

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


