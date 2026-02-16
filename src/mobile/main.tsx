import React from 'react'
import ReactDOM from 'react-dom/client'
import MobileApp from './MobileApp'
import { NotificationProvider } from '../contexts/NotificationContext'
import { NotificationContainer } from '../components/Notification/NotificationContainer'
import '../styles/mobile.css'

// Simple Error Boundary to catch render crashes
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("MobileApp Crash:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: 'white', background: '#333', height: '100vh' }}>
                    <h1>Something went wrong.</h1>
                    <pre style={{ whiteSpace: 'pre-wrap', color: '#ff5555' }}>
                        {this.state.error?.toString()}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <NotificationProvider>
                <MobileApp />
                <NotificationContainer />
            </NotificationProvider>
        </ErrorBoundary>
    </React.StrictMode>
)
