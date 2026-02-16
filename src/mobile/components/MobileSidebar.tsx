import React from 'react';
import { X, Folder, Library, Tag, Trash2, Settings } from 'lucide-react';
import { MobileView } from '../MobileApp';
import { motion } from 'framer-motion';
import { FilterOptions, Folder as FolderType, Library as LibraryType } from '../../types';

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    filterOptions: FilterOptions;
    onFilterChange: (options: FilterOptions) => void;
    folders: FolderType[];
    // library switching props
    currentLibrary: LibraryType | null;
    libraries?: LibraryType[];
    onSwitchLibrary?: (lib: LibraryType) => void;
    onAddLibrary?: () => void;
    onNavigate?: (view: MobileView) => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({
    isOpen,
    onClose,
    filterOptions,
    onFilterChange,
    folders,
    currentLibrary,
    onAddLibrary,
    onNavigate
}) => {
    // const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

    const handleFilter = (updates: Partial<FilterOptions>) => {
        onFilterChange({ ...filterOptions, ...updates });
        onClose();
    };

    const SidebarItem = ({ active, onClick, icon: Icon, label, count }: any) => (
        <button
            className={`sidebar-item ${active ? 'active' : ''}`}
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', width: '100%', padding: '12px 16px',
                background: active ? '#333' : 'transparent', border: 'none', color: 'white',
                textAlign: 'left', borderBottom: '1px solid #222'
            }}
        >
            {Icon && <Icon size={18} style={{ marginRight: 12 }} />}
            <span style={{ flex: 1 }}>{label}</span>
            {count !== undefined && <span style={{ opacity: 0.5, fontSize: '0.9em' }}>{count}</span>}
        </button>
    );

    if (!isOpen) return null;

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.5)', zIndex: 999
            }} />
            <motion.div
                className="mobile-sidebar"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                style={{
                    position: 'fixed', top: 0, left: 0, width: '80%', maxWidth: '300px', height: '100%',
                    background: '#1a1a1a', zIndex: 1000, overflowY: 'auto',
                    paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
                    paddingBottom: 'env(safe-area-inset-bottom)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #333' }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        <Library size={20} style={{ marginRight: 8 }} />
                        {currentLibrary ? currentLibrary.name : 'No Library'}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Library Switcher (Simplified) */}
                <div style={{ padding: '8px 16px' }}>
                    <button onClick={onAddLibrary} style={{ fontSize: '12px', padding: '4px 8px', background: '#333', color: 'white', border: 'none', borderRadius: '4px' }}>
                        + ライブラリ変更
                    </button>
                </div>

                <div className="sidebar-section">
                    <div style={{ padding: '8px 16px', opacity: 0.7, fontSize: '12px', letterSpacing: '1px' }}>MENU</div>
                    <SidebarItem
                        label="すべてのタグ"
                        icon={Tag}
                        onClick={() => handleFilter({ selectedTags: [] })}
                    />
                    <SidebarItem
                        label="ゴミ箱"
                        icon={Trash2}
                        active={filterOptions.filterType === 'trash'}
                        onClick={() => handleFilter({ filterType: 'trash', selectedFolders: [], selectedTags: [] })}
                    />
                    <SidebarItem
                        label="設定"
                        icon={Settings}
                        onClick={() => {
                            if (onNavigate) onNavigate('settings');
                            onClose();
                        }}
                    />
                </div>

                <div className="sidebar-section">
                    <div style={{ padding: '8px 16px', opacity: 0.7, fontSize: '12px', letterSpacing: '1px', marginTop: 16 }}>FILTERS</div>
                    <SidebarItem
                        label="すべての動画"
                        active={filterOptions.filterType === 'all' && filterOptions.selectedFolders.length === 0}
                        onClick={() => handleFilter({ filterType: 'all', selectedFolders: [], selectedTags: [] })}
                    />
                    <SidebarItem
                        label="未分類"
                        active={filterOptions.filterType === 'uncategorized'}
                        onClick={() => handleFilter({ filterType: 'uncategorized', selectedFolders: [], selectedTags: [] })}
                    />
                    <SidebarItem
                        label="タグなし"
                        active={filterOptions.filterType === 'untagged'}
                        onClick={() => handleFilter({ filterType: 'untagged', selectedFolders: [], selectedTags: [] })}
                    />
                </div>

                <div className="sidebar-section">
                    <div style={{ padding: '8px 16px', opacity: 0.7, fontSize: '12px', letterSpacing: '1px', marginTop: 16 }}>FOLDERS</div>
                    {folders.map(folder => (
                        <SidebarItem
                            key={folder.id}
                            label={folder.name}
                            icon={Folder}
                            active={filterOptions.selectedFolders.includes(folder.id)}
                            onClick={() => handleFilter({
                                filterType: 'all',
                                selectedFolders: [folder.id],
                                // If we want to support multi-select later we can toggle
                                // but for now behave like desktop single folder select usually does in simple view
                            })}
                        />
                    ))}
                    {folders.length === 0 && <div style={{ padding: '0 16px', opacity: 0.5 }}>フォルダなし</div>}
                </div>

            </motion.div>
        </>
    );
};
