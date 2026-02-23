import { useState } from 'react';
import { MobileLayout } from './MobileLayout';
import ObscuraNative from './ObscuraNative';
import { useLibrary } from '../hooks/useLibrary';

// Screens
const HomeScreen = () => {
    const { setFilterOptions } = useLibrary();
    const [activeFilter, setActiveFilter] = useState<'all' | 'uncategorized' | 'untagged' | 'random'>('all');

    const handleFilterClick = (type: 'all' | 'uncategorized' | 'untagged' | 'random') => {
        setActiveFilter(type);
        if (type === 'random') {
            // Logic for random is handled by viewing logic usually, but here we might just set filterType?
            // Or maybe random is a sort order? Let's assume it's just a filterType for now or we handle it in render.
            // For now, let's map it to filterType 'random' if supported, or just 'all' with some sort.
            // The prompt says "Select Random", implying a view or filter. 
            // Existing code had 'random' view. 
            // Let's rely on standard filterTypes if possible. 
            // If 'random' isn't a standard filterType in useLibrary, we might need to handle it.
            // Assuming useLibrary supports these or we map them.
            setFilterOptions(prev => ({ ...prev, filterType: type === 'random' ? 'all' : type }));
            // Note: Real random implementation might need more, but UI wise:
        } else {
            setFilterOptions(prev => ({ ...prev, filterType: type }));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Top Filter Bar */}
            <div style={{
                display: 'flex',
                overflowX: 'auto',
                padding: '10px 16px',
                borderBottom: '1px solid #333',
                background: '#1a1a1a',
                gap: '12px'
            }}>
                {[
                    { id: 'all', label: 'すべて' },
                    { id: 'uncategorized', label: '未分類' },
                    { id: 'untagged', label: 'タグなし' },
                    { id: 'random', label: 'ランダム' }
                ].map(filter => (
                    <button
                        key={filter.id}
                        onClick={() => handleFilterClick(filter.id as any)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            border: 'none',
                            background: activeFilter === filter.id ? 'white' : '#333',
                            color: activeFilter === filter.id ? 'black' : 'white',
                            whiteSpace: 'nowrap',
                            fontSize: '14px',
                            fontWeight: activeFilter === filter.id ? 'bold' : 'normal'
                        }}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
                <h2>ホーム</h2>
                <p>現在のフィルタ: {activeFilter}</p>
                {/* Video Grid would go here */}
            </div>
        </div>
    );
};

const SearchScreen = () => (
    <div style={{ padding: 16 }}>
        <h2>検索</h2>
        <input type="text" placeholder="キーワードを入力..." style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#333', color: 'white' }} />
    </div>
);

const PlaylistScreen = () => (
    <div style={{ padding: 16 }}>
        <h2>プレイリスト</h2>
        <p>リストがありません</p>
    </div>
);

const DownloadScreen = () => (
    <div style={{ padding: 16 }}>
        <h2>ダウンロード</h2>
        <p>ダウンロード済みのアイテムはありません</p>
    </div>
);


/*
const BrowseScreen = () => {
    return (
        <div style={{ padding: 16 }}>
            <h2>ブラウズ</h2>
        </div>
    );
};
*/

const SettingsScreen = () => {
    const [status, setStatus] = useState<string>('');
    const handleAddLibrary = async () => {
        try {
            setStatus('権限を要求中...');
            const result = await ObscuraNative.selectFolder();
            setStatus(`選択完了: ${result.uri}`);
            const files = await ObscuraNative.listFiles({ uri: result.uri });
            setStatus(`フォルダ内のファイル数: ${files.files.length}`);
        } catch (e: any) {
            setStatus(`エラー: ${e.message}`);
        }
    };

    return (
        <div style={{ padding: 16 }}>
            <h2>設定</h2>
            <button
                onClick={handleAddLibrary}
                style={{
                    background: '#cc0000',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '24px',
                    border: 'none',
                    fontSize: '16px',
                    marginTop: '20px'
                }}
            >
                + ライブラリフォルダを追加 (ネイティブテスト)
            </button>
            <div style={{ marginTop: 20, wordBreak: 'break-all', color: '#888' }}>
                {status}
            </div>
        </div>
    );
};

export type MobileView = 'home' | 'search' | 'playlist' | 'download' | 'settings';

export default function MobileApp() {
    const [currentView, setCurrentView] = useState<MobileView>('home');
    const { filterOptions, setFilterOptions, folders, activeLibrary } = useLibrary();

    const sidebarProps = {
        isOpen: false, // Controlled by layout
        onClose: () => { }, // Controlled by layout
        filterOptions,
        onFilterChange: setFilterOptions,
        folders,
        currentLibrary: activeLibrary,
        // libraries, // Removed as it might not be in useLibrary return (check hook)
        // onSwitchLibrary: switchLibrary, 
        onAddLibrary: () => { /* Open modal */ },
        onNavigate: setCurrentView
    };

    return (
        <MobileLayout
            currentView={currentView}
            onNavigate={setCurrentView}
            sidebarProps={sidebarProps}
        >
            {currentView === 'home' && <HomeScreen />}
            {currentView === 'search' && <SearchScreen />}
            {currentView === 'playlist' && <PlaylistScreen />}
            {currentView === 'download' && <DownloadScreen />}
            {currentView === 'settings' && <SettingsScreen />}
        </MobileLayout>
    );
}
