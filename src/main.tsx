import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initMockElectronAPI } from './utils/mockElectronAPI'

// ブラウザ環境でElectron APIがない場合はモックを注入
initMockElectronAPI()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
