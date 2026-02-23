import React, { useState } from 'react';
import { Search, Menu } from 'lucide-react';
import { MobileView } from './MobileApp';
import { MobileSidebar } from './components/MobileSidebar';
import '../styles/mobile.css';

interface MobileLayoutProps {
    children: React.ReactNode;
    currentView: MobileView;
    onNavigate: (view: MobileView) => void;
    // Sidebar Props
    sidebarProps: React.ComponentProps<typeof MobileSidebar>;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
    children,
    currentView,
    onNavigate,
    sidebarProps
}) => {
    // We lift sidebar open state to Layout or let Parent handle it? 
    // Usually Layout handles UI state like drawer.
    // However sidebarProps includes 'isOpen'. Let's strip isOpen from sidebarProps and control it here
    // OR just control it here and allow parent to override?
    // Let's control it here for simplicity, but sidebarProps needs to be flexible.
    // Actually, parent (MobileEntry) might want to open sidebar programmatically?
    // Let's keep state here.

    // override isOpen and onClose
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    return (
        <div className="mobile-app-container">
            {/* Top Bar */}
            <header className="mobile-header">
                <button className="icon-btn" onClick={toggleSidebar}>
                    <Menu size={24} />
                </button>
                <div className="mobile-logo">Obscura</div>
                <button className="icon-btn">
                    <Search size={24} />
                </button>
            </header>

            {/* Sidebar Drawer */}
            <MobileSidebar
                {...sidebarProps}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Content */}
            <main className="mobile-content">
                {children}
            </main>

            {/* Bottom Navigation */}
            <nav className="mobile-bottom-nav">
                <button
                    className={currentView === 'home' ? 'active' : ''}
                    onClick={() => onNavigate('home')}
                >
                    <div style={{ fontSize: '24px' }}>🏠</div>
                    <span>ホーム</span>
                </button>
                <button
                    className={currentView === 'search' ? 'active' : ''}
                    onClick={() => onNavigate('search')}
                >
                    <Search size={24} />
                    <span>検索</span>
                </button>
                <button
                    className={currentView === 'playlist' ? 'active' : ''}
                    onClick={() => onNavigate('playlist')}
                >
                    <div style={{ fontSize: '24px' }}>▶️</div>
                    <span>リスト</span>
                </button>
                <button
                    className={currentView === 'download' ? 'active' : ''}
                    onClick={() => onNavigate('download')}
                >
                    <div style={{ fontSize: '24px' }}>⬇️</div>
                    <span>保存</span>
                </button>
            </nav>
        </div>
    );
};
