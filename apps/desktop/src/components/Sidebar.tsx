import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition } from '../hooks/useFloatingPosition'
import AuditLogModal from './AuditLogModal'
import { FilterOptions, Library, RemoteLibrary, Folder } from '@obscura/core'
import { api } from '../api'
import './Sidebar.css'

import { ConfirmModal } from './ConfirmModal'

interface SidebarProps {
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    folders: Folder[]
    libraries: Library[]
    remoteLibraries: RemoteLibrary[] // Added
    activeLibrary: Library | null
    activeRemoteLibrary: RemoteLibrary | null // Added
    onCreateFolder: (name: string, parentId?: number | null) => Promise<Folder | null>
    onDeleteFolder: (id: number) => Promise<void>
    onRenameFolder: (id: number, newName: string) => void
    onOpenLibraryModal: () => void
    onOpenLibrary: () => Promise<any>
    onSwitchLibrary: (lib: Library) => void
    onRemoveLocalLibraryHistory: (libraryPath: string) => Promise<void>
    onSwitchRemoteLibrary: (lib: RemoteLibrary) => void
    onOpenSettings: () => void
    hasActiveLibrary: boolean
    onRefreshFolders?: () => void
    onDropFileOnFolder?: (folderId: number, files?: FileList | null, mediaIds?: number[]) => void
    onInternalDragStart?: (mediaIds?: number[]) => void
    onInternalDragEnd?: () => void
    externalDropFolderId?: number | null
    itemCounts?: { [key: string]: number }
    language?: 'ja' | 'en'
}

interface FolderWithChildren extends Folder {
    children: FolderWithChildren[]
    level: number
}

const buildFolderTree = (folders: Folder[]): FolderWithChildren[] => {
    const folderMap = new Map<number, FolderWithChildren>()
    const roots: FolderWithChildren[] = []

    folders.forEach(f => {
        folderMap.set(f.id, { ...f, children: [], level: 0 })
    })

    folders.forEach(f => {
        const node = folderMap.get(f.id)!
        if (f.parentId && folderMap.has(f.parentId)) {
            const parent = folderMap.get(f.parentId)!
            node.level = parent.level + 1
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    })

    const sortNodes = (nodes: FolderWithChildren[]) => {
        nodes.sort((a, b) => {
            const orderA = a.orderIndex || 0
            const orderB = b.orderIndex || 0
            if (orderA !== orderB) return orderA - orderB
            return a.name.localeCompare(b.name)
        })
        nodes.forEach(n => sortNodes(n.children))
    }
    sortNodes(roots)

    return roots
}

const Icons = {
    All: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
    Uncategorized: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    Untagged: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>,
    Recent: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Random: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>,
    Tags: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><path d="M7 7h.01"></path></svg>,
    Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
    Folder: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    FolderOpen: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    Cloud: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>,
    Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
}

function RenameInput({
    initialValue,
    onSubmit,
    onCancel
}: {
    initialValue: string,
    onSubmit: (value: string) => void,
    onCancel: () => void
}) {
    const [value, setValue] = useState(initialValue)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputRef.current) {
                console.log('[RenameInput] Focusing...')
                inputRef.current.focus()
                inputRef.current.select()
            }
        }, 50) // 鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｬ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｳ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｰ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｨ鬯ｯ・ｯ繝ｻ・ｲ髫ｰ繝ｻ竏槭・・ｽ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｴ驛｢譎｢・ｽ・ｻ驍ｵ・ｺ繝ｻ・､繝ｻ縺､ﾂ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｪ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｳ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｧ鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｰ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｮ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｯ鬯ｮ・ｫ繝ｻ・ｶ髯ｷ・ｴ郢晢ｽｻ繝ｻ・ｽ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｸ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｳ鬯ｯ・ｯ繝ｻ・ｮ郢晢ｽｻ繝ｻ・ｯ鬮ｮ荵昴・繝ｻ・ｽ繝ｻ・ｷ鬮ｫ・ｴ繝ｻ・ｯ驕ｶ荳橸ｽ｣・ｹ郢晢ｽｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｡鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｺ鬯ｯ・ｯ繝ｻ・ｩ髯晢ｽｷ繝ｻ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬯ｮ・ｫ繝ｻ・ｴ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｯ繝ｻ・ｩ髯具ｽｹ郢晢ｽｻ繝ｻ・ｽ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｶ鬯ｯ・ｯ繝ｻ・ｮ郢晢ｽｻ繝ｻ・ｮ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｰ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・､鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｹ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｧ鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・､鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬮｣蛹・ｽｽ・ｳ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ鬯ｮ・ｯ繝ｻ・ｷ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｮ繝ｻ・ｮ髫ｲ蟷｢・ｽ・ｶ郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｣鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｦ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬮｣蛹・ｽｽ・ｳ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ鬯ｮ・ｫ繝ｻ・ｶ髫ｰ謦ｰ・ｽ・ｺ郢晢ｽｻ繝ｻ・ｺ髯区ｻゑｽｽ・･驛｢譎｢・ｽ・ｻ鬯ｮ・ｯ繝ｻ・ｷ郢晢ｽｻ繝ｻ・ｿ鬯ｯ・ｮ繝ｻ・｢繝ｻ縺､ﾂ鬮ｫ・ｴ鬲・ｼ夲ｽｽ・ｽ繝ｻ・ｭ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｹ鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｼ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬮ｫ・ｲ繝ｻ・ｰ郢晢ｽｻ繝ｻ・ｹ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｸ鬮ｫ・ｶ陷ｴ繝ｻ・ｽ・ｽ繝ｻ・ｸ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｹ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｲ鬯ｯ・ｯ繝ｻ・ｩ髯晢ｽｷ繝ｻ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬯ｮ・ｫ繝ｻ・ｴ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｧ鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｯ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｪ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｼ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬯ｮ・ｮ隲幢ｽｶ繝ｻ・ｽ繝ｻ・｣驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｳ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｧ鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｴ鬮ｫ・ｰ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｾ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｴ鬯ｯ・ｩ陝ｷ・｢繝ｻ・ｽ繝ｻ・｢鬮ｫ・ｴ髮懶ｽ｣繝ｻ・ｽ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｯ繝ｻ・ｩ髯晢ｽｷ繝ｻ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬯ｮ・ｫ繝ｻ・ｴ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｩ鬮ｯ譎｢・ｽ・ｷ郢晢ｽｻ繝ｻ・｢驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・｢鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｧ鬯ｯ・ｯ繝ｻ・ｯ郢晢ｽｻ繝ｻ・ｮ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｮ鬯ｮ・ｯ陷茨ｽｷ繝ｻ・ｽ繝ｻ・ｹ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｺ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｩ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｸ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｾ鬯ｯ・ｯ繝ｻ・ｩ髯晢ｽｷ繝ｻ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬯ｮ・ｫ繝ｻ・ｴ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・｢鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｻ鬯ｯ・ｯ繝ｻ・ｮ郢晢ｽｻ繝ｻ・ｫ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｨ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｽ
        return () => clearTimeout(timer)
    }, [])

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
                console.log('[RenameInput] Blurred')
                onSubmit(value)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    onSubmit(value)
                } else if (e.key === 'Escape') {
                    onCancel()
                }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="sidebar-input-tiny"
            style={{ flex: 1, height: '22px', minWidth: 0, position: 'relative', zIndex: 10001 }}
        />
    )
}

export function Sidebar({
    filterOptions,
    onFilterChange,
    folders,
    libraries,
    remoteLibraries,
    activeLibrary,
    activeRemoteLibrary,
    onCreateFolder,
    onDeleteFolder,
    onRenameFolder,
    onOpenLibraryModal,
    onOpenLibrary,
    onSwitchLibrary,
    onRemoveLocalLibraryHistory,
    onSwitchRemoteLibrary,
    onOpenSettings,
    hasActiveLibrary,
    onRefreshFolders,
    onDropFileOnFolder,
    onInternalDragStart,
    onInternalDragEnd,
    externalDropFolderId = null,
    itemCounts,
    language = 'ja'
}: SidebarProps) {
    const parseDraggedMediaIds = (dataTransfer: DataTransfer): number[] => {
        const customData = dataTransfer.getData('application/x-obscura-media-ids')
        if (customData) {
            try {
                const parsed = JSON.parse(customData)
                if (Array.isArray(parsed)) {
                    return parsed.map((id) => Number(id)).filter(Number.isFinite)
                }
            } catch (err) {
                console.error('Failed to parse media drag data', err)
            }
        }

        return []
    }

    const isEnglish = language === 'en'
    const t = {
        selectLibrary: isEnglish ? 'Select library...' : 'ライブラリを選択...',
        search: isEnglish ? 'Search...' : '検索...',
        createNewLibrary: isEnglish ? 'Create new library...' : '新しいライブラリを作成...',
        openExistingLibrary: isEnglish ? 'Open existing library...' : '既存のライブラリを開く...',
        localLibraries: isEnglish ? 'Local Libraries' : 'ローカルライブラリ',
        remoteLibraries: isEnglish ? 'Remote Libraries' : 'リモートライブラリ',
        all: isEnglish ? 'All' : 'すべて',
        uncategorized: isEnglish ? 'Uncategorized' : '未分類',
        untagged: isEnglish ? 'Untagged' : 'タグなし',
        recent: isEnglish ? 'Recent' : '最近',
        random: isEnglish ? 'Random' : 'ランダム',
        allTags: isEnglish ? 'All Tags' : 'すべてのタグ',
        trash: isEnglish ? 'Trash' : 'ゴミ箱',
        folders: isEnglish ? 'Folders' : 'フォルダー',
        noLibrarySelected: isEnglish ? 'No library selected' : 'ライブラリが選択されていません',
        createFolder: isEnglish ? 'Create folder' : 'フォルダーを作成',
        settings: isEnglish ? 'Settings' : '設定',
        rename: isEnglish ? 'Rename' : '名前を変更',
        newFolder: isEnglish ? 'New folder' : '新しいフォルダー',
        newSubfolder: isEnglish ? 'New subfolder' : '新しいサブフォルダー',
        delete: isEnglish ? 'Delete' : '削除',
        deleteFolder: isEnglish ? 'Delete folder' : 'フォルダーを削除',
        deleteFolderMessage: isEnglish ? 'Delete this folder?' : 'このフォルダーを削除しますか？',
        cancel: isEnglish ? 'Cancel' : 'キャンセル',
        showAuditLog: isEnglish ? 'Show audit log' : '監査ログを表示',
        removeFromHistory: isEnglish ? 'Remove from history' : '履歴から削除',
        removeFromHistoryTitle: isEnglish ? 'Remove from history' : '履歴から削除',
        removeFromHistoryMessage: isEnglish
            ? 'from local history?\nLibrary files will not be deleted.'
            : 'をローカル履歴から削除しますか？\nライブラリファイル自体は削除されません。',
        remove: isEnglish ? 'Remove' : '削除'
    }
    const defaultFolderName = isEnglish ? 'New Folder' : '新しいフォルダー'
    const toDisplayLibraryName = (name: string) => String(name || '').replace(/\.library$/i, '')
    const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null)
    const [renamingName, setRenamingName] = useState("")
    const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false)
    const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
    const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null)
    const [dropTarget, setDropTarget] = useState<{ id: number; position: 'top' | 'middle' | 'bottom' } | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: number } | null>(null)
    const [folderToDelete, setFolderToDelete] = useState<number | null>(null)
    const [libraryMenuPos, setLibraryMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
    const [libContextMenu, setLibContextMenu] = useState<{ x: number; y: number; library: Library } | null>(null)
    const [auditLogLibrary, setAuditLogLibrary] = useState<Library | null>(null)
    const [libraryToRemoveHistory, setLibraryToRemoveHistory] = useState<Library | null>(null)
    const libraryDropdownRef = useRef<HTMLDivElement>(null)
    const libraryMenuRef = useRef<HTMLDivElement>(null)
    const folderContextMenuRef = useRef<HTMLDivElement>(null)
    const libContextMenuRef = useRef<HTMLDivElement>(null)

    const folderTree = useMemo(() => buildFolderTree(folders), [folders])

    useFloatingPosition(
        folderContextMenuRef,
        contextMenu?.x || 0,
        contextMenu?.y || 0,
        !!contextMenu
    )
    useFloatingPosition(
        libContextMenuRef,
        libContextMenu?.x || 0,
        libContextMenu?.y || 0,
        !!libContextMenu
    )

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node
            const isClickInsideMenu = libraryMenuRef.current?.contains(target)
            const isClickInsideDropdown = libraryDropdownRef.current?.contains(target)

            const isClickInsideContextMenu = (event.target as Element).closest('.context-menu')

            if (!isClickInsideMenu && !isClickInsideDropdown && !isClickInsideContextMenu) {
                setIsLibraryMenuOpen(false)
            }
            if (contextMenu && !(event.target as Element).closest('.context-menu')) {
                setContextMenu(null)
            }
            if (libContextMenu && !(event.target as Element).closest('.context-menu')) {
                setLibContextMenu(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [contextMenu, libContextMenu, isLibraryMenuOpen])

    useEffect(() => {
        if (!isLibraryMenuOpen) {
            setLibContextMenu(null)
        }
    }, [isLibraryMenuOpen])

        const handleCreateClick = async (e: React.MouseEvent) => {
        e.preventDefault()
        try {
            const newFolder = await onCreateFolder(defaultFolderName, null)
            if (newFolder) {
                setRenamingFolderId(newFolder.id)
                setRenamingName(newFolder.name)
            }
        } catch (error) {
            console.error('Failed to create folder', error)
        }
    }

    const handleRenameSubmit = (id: number, newName: string) => {
        const trimmed = newName.trim()
        const originalName = folders.find(f => f.id === id)?.name
        if (trimmed && trimmed !== originalName) {
            onRenameFolder(id, trimmed)
        }
        setRenamingFolderId(null)
        setRenamingName('')
    }

    const handleContextMenu = (e: React.MouseEvent, folderId: number) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, folderId })
    }

    const handleContextAction = async (action: 'delete' | 'rename' | 'new-folder' | 'new-subfolder') => {
        if (!contextMenu) return
        const folderId = contextMenu.folderId
        const folder = folders.find(f => f.id === folderId)
        setContextMenu(null)

        if (!folder) return

        if (action === 'delete') {
            setFolderToDelete(folderId)
        } else if (action === 'rename') {
            setRenamingFolderId(folderId)
            setRenamingName(folder.name)
        } else if (action === 'new-folder') {
            try {
                const newFolder = await onCreateFolder(defaultFolderName, folder.parentId)
                if (newFolder) {
                    setRenamingFolderId(newFolder.id)
                    setRenamingName(newFolder.name)
                }
            } catch (error) {
                console.error('Failed to create sibling folder', error)
            }
        } else if (action === 'new-subfolder') {
            try {
                setExpandedFolders(prev => new Set(prev).add(folderId))
                const newFolder = await onCreateFolder(defaultFolderName, folderId)
                if (newFolder) {
                    setRenamingFolderId(newFolder.id)
                    setRenamingName(newFolder.name)
                }
            } catch (error) {
                console.error('Failed to create subfolder', error)
            }
        }
    }

    const setFilterType = (type: FilterOptions['filterType']) => {
        onFilterChange({ ...filterOptions, filterType: type, selectedFolders: [] })
    }

    const toggleFolderFilter = (folderId: number) => {
        const currentFolders = filterOptions.selectedFolders
        const isSelected = currentFolders.includes(folderId)
        const newFolders = isSelected ? [] : [folderId]
        onFilterChange({ ...filterOptions, filterType: 'all', selectedFolders: newFolders })
    }

    const toggleFolderExpand = (e: React.MouseEvent, genreId: number) => {
        e.stopPropagation()
        setExpandedFolders(prev => {
            const next = new Set(prev)
            if (next.has(genreId)) {
                next.delete(genreId)
            } else {
                next.add(genreId)
            }
            return next
        })
    }

    const handleDragStart = (e: React.DragEvent, folderId: number) => {
        onInternalDragStart?.()
        e.stopPropagation()
        setDraggedFolderId(folderId)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.dropEffect = 'move'
        const data = JSON.stringify({ type: 'folder', id: folderId })
        e.dataTransfer.setData('application/json', data)
        e.dataTransfer.setData('text/plain', data)
    }

    const handleDragEnd = () => {
        setDraggedFolderId(null)
        setDropTarget(null)
        onInternalDragEnd?.()
    }

    const getDropPosition = (e: React.DragEvent, element: HTMLElement): 'top' | 'middle' | 'bottom' => {
        const rect = element.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height

        if (y < height * 0.35) return 'top'
        if (y > height * 0.65) return 'bottom'
        return 'middle'
    }

    const handleDragOver = (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        const isFileDrag = e.dataTransfer.types.includes('Files')
        const isMediaDrag = e.dataTransfer.types.includes('application/x-obscura-media-ids')

        if (!isFileDrag && !isMediaDrag) {
            e.stopPropagation()
        }

        if (draggedFolderId === null && !isFileDrag && !isMediaDrag) return
        if (draggedFolderId === targetId) return

        if (isFileDrag || isMediaDrag) {
            setDropTarget({ id: targetId, position: 'middle' })
            e.dataTransfer.dropEffect = 'copy'
            return
        }

        e.dataTransfer.dropEffect = 'move'

        const position = getDropPosition(e, e.currentTarget as HTMLElement)
        setDropTarget({ id: targetId, position })
    }

    const handleDragLeave = (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return
        }
        setDropTarget(null)
    }

    const normalizeId = (id: any): number | null => {
        if (id === null || id === undefined || id === '' || id === 0) return null
        const num = Number(id)
        return isNaN(num) ? null : num
    }

    const handleDrop = async (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        e.stopPropagation()

        const position = getDropPosition(e, e.currentTarget as HTMLElement)
        const currentDropTarget = { id: targetId, position }

        setDropTarget(null)

        let effectiveDraggedId = normalizeId(draggedFolderId)

        if (effectiveDraggedId === null) {
            try {
                const data = e.dataTransfer.getData('application/json')
                if (data) {
                    const parsed = JSON.parse(data)
                    if (parsed.type === 'folder') {
                        effectiveDraggedId = normalizeId(parsed.id)
                    }
                }
            } catch (err) {
                console.error("Failed to parse drag data", err)
            }
        }

        if (effectiveDraggedId === null) {
            const mediaIds = parseDraggedMediaIds(e.dataTransfer)
            if (mediaIds.length > 0 && onDropFileOnFolder) {
                onDropFileOnFolder(targetId, null, mediaIds)
                setExpandedFolders(prev => new Set(prev).add(targetId))
                return
            }
            if (e.dataTransfer.types.includes('Files') && onDropFileOnFolder) {
                onDropFileOnFolder(targetId, e.dataTransfer.files)
                setExpandedFolders(prev => new Set(prev).add(targetId))
            }
            return
        }

        const normalizedTargetId = normalizeId(targetId)
        if (effectiveDraggedId === normalizedTargetId || normalizedTargetId === null) {
            return
        }

        const updates: { id: number; parentId: number | null; orderIndex: number }[] = []

        let newParentId: number | null = null
        let newOrderIndex = 0

        const targetFolder = folders.find(f => normalizeId(f.id) === normalizedTargetId)
        if (!targetFolder) return

        if (currentDropTarget.position === 'middle') {
            newParentId = normalizedTargetId
            const children = folders.filter(f => normalizeId(f.parentId) === normalizedTargetId)
            const maxOrder = children.reduce((max, c) => Math.max(max, c.orderIndex || 0), 0)
            newOrderIndex = maxOrder + 100

            setExpandedFolders(prev => new Set(prev).add(normalizedTargetId))
        } else {
            newParentId = normalizeId(targetFolder.parentId)

            const siblings = folders.filter(f =>
                normalizeId(f.parentId) === newParentId &&
                normalizeId(f.id) !== effectiveDraggedId
            ).sort((a, b) => {
                const orderA = a.orderIndex || 0
                const orderB = b.orderIndex || 0
                if (orderA !== orderB) return orderA - orderB
                return a.name.localeCompare(b.name)
            })

            const targetIndex = siblings.findIndex(s => normalizeId(s.id) === normalizedTargetId)

            const newSiblings = [...siblings]
            const draggedFolder = folders.find(f => normalizeId(f.id) === effectiveDraggedId)!

            if (currentDropTarget.position === 'top') {
                newSiblings.splice(targetIndex, 0, draggedFolder)
            } else {
                newSiblings.splice(targetIndex + 1, 0, draggedFolder)
            }

            newSiblings.forEach((s, index) => {
                updates.push({
                    id: s.id,
                    parentId: newParentId,
                    orderIndex: index * 10
                })
            })
        }

        if (currentDropTarget.position === 'middle') {
            updates.push({
                id: effectiveDraggedId,
                parentId: newParentId,
                orderIndex: newOrderIndex
            })
        }

        if (updates.length > 0) {
            console.log('[Sidebar] Sending updateFolderStructure:', updates)
            await api.updateFolderStructure(updates)
            if (onRefreshFolders) {
                onRefreshFolders()
            }
        }

        setDraggedFolderId(null)
    }

    const handleContainerDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (draggedFolderId !== null) {
            e.dataTransfer.dropEffect = 'move'
        }
    }

    const handleContainerDrop = (_e: React.DragEvent) => {
        console.log('[Sidebar] Container drop (ignored or fallback)')
        setDropTarget(null)
    }

    useEffect(() => {
        document
            .querySelectorAll('.sidebar-nav-item.external-drop-target-live')
            .forEach((element) => {
                element.classList.remove('external-drop-target-live')
                const htmlElement = element as HTMLElement
                htmlElement.style.removeProperty('background')
                htmlElement.style.removeProperty('border-color')
                htmlElement.style.removeProperty('box-shadow')
                htmlElement.style.removeProperty('transform')
                htmlElement.style.removeProperty('color')
            })

        if (!Number.isFinite(externalDropFolderId as number)) return

        document
            .querySelectorAll(`.sidebar-nav-item[data-folder-id="${externalDropFolderId}"]`)
            .forEach((element) => {
                const target = element as HTMLElement
                target.classList.add('external-drop-target-live')
                target.style.setProperty('background', 'color-mix(in srgb, var(--primary) 18%, var(--bg-hover))', 'important')
                target.style.setProperty('border-color', 'color-mix(in srgb, var(--primary) 92%, white 8%)', 'important')
                target.style.setProperty('box-shadow', 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 36%, transparent), var(--shadow-md)', 'important')
                target.style.setProperty('transform', 'translateX(4px)', 'important')
                target.style.setProperty('color', 'var(--text-main)', 'important')
            })
    }, [externalDropFolderId, folders])

    const renderFolderNode = (node: FolderWithChildren) => {
        const isSelected = filterOptions.selectedFolders.includes(node.id)
        const isExpanded = expandedFolders.has(node.id)
        const isExternalDropTarget = externalDropFolderId === node.id
        const isRenaming = renamingFolderId === node.id

        let dropClass = ''
        if (dropTarget?.id === node.id) {
            if (dropTarget.position === 'top') dropClass = 'drop-top'
            else if (dropTarget.position === 'bottom') dropClass = 'drop-bottom'
            else if (dropTarget.position === 'middle') dropClass = 'drop-middle'
        } else if (externalDropFolderId === node.id) {
            dropClass = 'drop-middle'
        }

        const hasChildren = node.children.length > 0

        return (
            <div key={node.id} className="folder-tree-container">
                <div
                    className={`sidebar-nav-item folder-tree-node ${isSelected ? 'active' : ''} ${dropClass} ${isExternalDropTarget ? 'external-drop-target' : ''}`}
                    data-folder-id={node.id}
                    onClick={() => {
                        if (!isRenaming) toggleFolderFilter(node.id)
                    }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    draggable={!isRenaming}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
                    <div
                        className="folder-toggle-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            toggleFolderExpand(e, node.id)
                        }}
                        style={{
                            cursor: 'pointer',
                            visibility: hasChildren ? 'visible' : 'hidden',
                        }}
                    >
                        <svg
                            width="10" height="10"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            stroke="none"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                    <div className="folder-icon">
                        {isExpanded ? <Icons.FolderOpen /> : <Icons.Folder />}
                    </div>

                    {isRenaming ? (
                        <RenameInput
                            initialValue={renamingName}
                            onSubmit={(val) => handleRenameSubmit(node.id, val)}
                            onCancel={() => {
                                setRenamingFolderId(null)
                                setRenamingName("")
                            }}
                        />
                    ) : (
                        <>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                            {itemCounts && itemCounts[`folder-${node.id}`] !== undefined && (
                                <span className="sidebar-count">{itemCounts[`folder-${node.id}`].toLocaleString()}</span>
                            )}
                        </>
                    )}
                </div>

                {isExpanded && hasChildren && (
                    <div className="sidebar-sub-folders">
                        {node.children.map(renderFolderNode)}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div
            className="sidebar"
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
        >
            <div className="sidebar-header">
                <div className="sidebar-topbar">
                    <div className="sidebar-topbar-group">
                        <button
                            className="sidebar-topbar-btn"
                            onClick={onOpenSettings}
                            title={t.settings}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div className="sidebar-topbar-group">
                        <button
                            className="sidebar-topbar-btn"
                            onClick={onOpenLibraryModal}
                            title={t.createNewLibrary}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button
                            className="sidebar-topbar-btn"
                            onClick={async () => {
                                await onOpenLibrary()
                            }}
                            title={t.openExistingLibrary}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                {activeRemoteLibrary && (
                    <div className="sidebar-remote-status">
                        {/* Remote status indicator or controls if needed */}
                    </div>
                )}
                <div className="library-menu-container" ref={libraryMenuRef}>
                    <button
                        className="current-library-btn"
                        onClick={() => {
                            if (!isLibraryMenuOpen && libraryMenuRef.current) {
                                const rect = libraryMenuRef.current.getBoundingClientRect()
                                setLibraryMenuPos({
                                    top: rect.bottom + 8,
                                    left: rect.left,
                                    width: rect.width
                                })
                            }
                            setIsLibraryMenuOpen(!isLibraryMenuOpen)
                        }}
                    >
                        <span className="library-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                        </span>
                        <span className="library-name">
                            {hasActiveLibrary && activeLibrary
                                ? toDisplayLibraryName(activeLibrary.name)
                                : activeRemoteLibrary
                                    ? activeRemoteLibrary.name
                                    : t.selectLibrary}
                        </span>
                        <svg className={`chevron ${isLibraryMenuOpen ? 'open' : ''} `} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>

                    {isLibraryMenuOpen && libraryMenuPos && createPortal(
                        <div
                            className="library-dropdown-menu"
                            ref={libraryDropdownRef}
                            style={{
                                position: 'fixed',
                                top: libraryMenuPos.top,
                                left: libraryMenuPos.left,
                                width: libraryMenuPos.width,
                                zIndex: 99999
                            }}
                        >
                            <div className="library-search-container">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input type="text" placeholder={t.search} className="library-menu-search" />
                                <button className="close-menu-btn" onClick={() => setIsLibraryMenuOpen(false)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                            <div className="library-menu-divider"></div>
                            <button
                                className="library-menu-item"
                                onClick={() => {
                                    onOpenLibraryModal()
                                    setIsLibraryMenuOpen(false)
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="12" y1="18" x2="12" y2="12"></line>
                                    <line x1="9" y1="15" x2="15" y2="15"></line>
                                </svg>
                                <span>{t.createNewLibrary}</span>
                            </button>

                            <button
                                className="library-menu-item"
                                onClick={async () => {
                                    await onOpenLibrary()
                                    setIsLibraryMenuOpen(false)
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                    <line x1="9" y1="13" x2="15" y2="13"></line>
                                    <line x1="12" y1="10" x2="12" y2="16"></line>
                                </svg>
                                <span>{t.openExistingLibrary}</span>
                            </button>

                            <div className="library-menu-item-header">{t.localLibraries}</div>
                            {libraries.map(lib => (
                                <button
                                    key={lib.path}
                                    className={`library-menu-item library-option ${activeLibrary?.path === lib.path ? 'active' : ''}`}
                                    onClick={() => {
                                        onSwitchLibrary(lib)
                                        setIsLibraryMenuOpen(false)
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setLibContextMenu({ x: e.clientX, y: e.clientY, library: lib })
                                    }}
                                >
                                    <Icons.Folder />
                                    <span>{toDisplayLibraryName(lib.name)}</span>
                                    {activeLibrary?.path === lib.path && <div className="active-dot" />}
                                </button>
                            ))}

                            {remoteLibraries && remoteLibraries.length > 0 && (
                                <>
                                    <div className="library-menu-item-header" style={{ marginTop: '8px' }}>{t.remoteLibraries}</div>
                                    {remoteLibraries.map(lib => (
                                        <button
                                            key={lib.id}
                                            className={`library-menu-item library-option ${activeRemoteLibrary?.id === lib.id ? 'active' : ''}`}
                                            onClick={() => {
                                                onSwitchRemoteLibrary(lib)
                                                setIsLibraryMenuOpen(false)
                                            }}
                                        >
                                            <Icons.Cloud />
                                            <span>{lib.name}</span>
                                            {activeRemoteLibrary?.id === lib.id && <div className="active-dot" />}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            <div className="sidebar-content">
                <div className="sidebar-section">
                    <div className="sidebar-nav">
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'all' && filterOptions.selectedFolders.length === 0 ? 'active' : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            <Icons.All />
                            <span>{t.all}</span>
                            {itemCounts && itemCounts['all'] !== undefined && (
                                <span className="sidebar-count">{itemCounts['all'].toLocaleString()}</span>
                            )}
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'uncategorized' ? 'active' : ''}`}
                            onClick={() => setFilterType('uncategorized')}
                        >
                            <Icons.Uncategorized />
                            <span>{t.uncategorized}</span>
                            {itemCounts && itemCounts['uncategorized'] !== undefined && (
                                <span className="sidebar-count">{itemCounts['uncategorized'].toLocaleString()}</span>
                            )}
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'untagged' ? 'active' : ''}`}
                            onClick={() => setFilterType('untagged')}
                        >
                            <Icons.Untagged />
                            <span>{t.untagged}</span>
                            {itemCounts && itemCounts['untagged'] !== undefined && (
                                <span className="sidebar-count">{itemCounts['untagged'].toLocaleString()}</span>
                            )}
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'recent' ? 'active' : ''}`}
                            onClick={() => setFilterType('recent')}
                        >
                            <Icons.Recent />
                            <span>{t.recent}</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'random' ? 'active' : ''}`}
                            onClick={() => setFilterType('random')}
                        >
                            <Icons.Random />
                            <span>{t.random}</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'tag_manager' ? 'active' : ''}`}
                            onClick={() => setFilterType('tag_manager')}
                        >
                            <Icons.Tags />
                            <span>{t.allTags}</span>
                            {itemCounts && itemCounts['tags'] !== undefined && (
                                <span className="sidebar-count">{itemCounts['tags'].toLocaleString()}</span>
                            )}
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'trash' ? 'active' : ''}`}
                            onClick={() => setFilterType('trash')}
                        >
                            <Icons.Trash />
                            <span>{t.trash}</span>
                            {itemCounts && itemCounts['trash'] !== undefined && (
                                <span className="sidebar-count">{itemCounts['trash'].toLocaleString()}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="sidebar-section">
                    <div className="flex justify-between items-center px-2 mb-1">
                        <div className="sidebar-section-header">
                            <span>{t.folders}</span>
                            <button
                                className="sidebar-action-btn"
                                onClick={handleCreateClick}
                                title={(!hasActiveLibrary && !activeRemoteLibrary) ? t.noLibrarySelected : t.createFolder}
                                disabled={!hasActiveLibrary && !activeRemoteLibrary}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-genre-list">
                        {folderTree.map(renderFolderNode)}
                    </div>
                </div>
            </div>

            <div className="sidebar-footer">
                <button className="sidebar-settings-btn" onClick={onOpenSettings} title={t.settings}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-0.44a2 2 0 0 0-2 2v0.18a2 2 0 0 1-1 1.73l-0.43 0.25a2 2 0 0 1-2 0l-0.15-0.08a2 2 0 0 0-2.73 0.73l-0.22 0.38a2 2 0 0 0 0.73 2.73l0.15 0.1a2 2 0 0 1 1 1.72v0.51a2 2 0 0 1-1 1.74l-0.15 0.09a2 2 0 0 0-0.73 2.73l-0.22-0.38a2 2 0 0 0-2.73-0.73l-0.15 0.08a2 2 0 0 1-2 0l-0.43-0.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>{t.settings}</span>
                </button>
            </div>

            {
                contextMenu && createPortal(
                    <div
                        ref={folderContextMenuRef}
                        className="context-menu"
                        style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 99999 }}
                    >
                        <div className="context-menu-item" onClick={() => handleContextAction('rename')}>
                            {t.rename}
                        </div>
                        <div className="context-menu-item" onClick={() => handleContextAction('new-folder')}>
                            {t.newFolder}
                        </div>
                        <div className="context-menu-item" onClick={() => handleContextAction('new-subfolder')}>
                            {t.newSubfolder}
                        </div>
                        <div className="context-menu-divider"></div>
                        <div className="context-menu-item delete" onClick={() => handleContextAction('delete')}>
                            {t.delete}
                        </div>
                    </div>,
                    document.body
                )
            }
            {
                folderToDelete !== null && (
                    <ConfirmModal
                        title={t.deleteFolder}
                        message={t.deleteFolderMessage}
                        confirmLabel={t.delete}
                        cancelLabel={t.cancel}
                        isDestructive={true}
                        onConfirm={async () => {
                            const id = folderToDelete
                            setFolderToDelete(null)
                            await onDeleteFolder(id)
                        }}
                        onCancel={() => setFolderToDelete(null)}
                    />
                )
            }

            {
                libContextMenu && createPortal(
                    <div
                        ref={libContextMenuRef}
                        className="context-menu"
                        style={{ position: 'fixed', top: libContextMenu.y, left: libContextMenu.x, zIndex: 100000 }}
                    >
                        <div className="context-menu-item" onClick={() => {
                            setAuditLogLibrary(libContextMenu.library)
                            setLibContextMenu(null)
                            setIsLibraryMenuOpen(false)
                        }}>
                            {t.showAuditLog}
                        </div>
                        <div className="context-menu-divider"></div>
                        <div
                            className={`context-menu-item ${activeLibrary?.path === libContextMenu.library.path ? 'disabled' : 'delete'}`}
                            onClick={() => {
                                if (activeLibrary?.path === libContextMenu.library.path) return
                                setLibraryToRemoveHistory(libContextMenu.library)
                                setLibContextMenu(null)
                            }}
                            style={activeLibrary?.path === libContextMenu.library.path ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        >
                            {t.removeFromHistory}
                        </div>
                    </div>,
                    document.body
                )
            }

            {libraryToRemoveHistory && (
                <ConfirmModal
                    title={t.removeFromHistoryTitle}
                    message={`"${toDisplayLibraryName(libraryToRemoveHistory.name)}" ${t.removeFromHistoryMessage}`}
                    confirmLabel={t.remove}
                    cancelLabel={t.cancel}
                    isDestructive={true}
                    onConfirm={async () => {
                        const target = libraryToRemoveHistory
                        setLibraryToRemoveHistory(null)
                        await onRemoveLocalLibraryHistory(target.path)
                    }}
                    onCancel={() => setLibraryToRemoveHistory(null)}
                />
            )}

            {
                auditLogLibrary && (
                    <AuditLogModal
                        libraryPath={auditLogLibrary.path}
                        libraryName={toDisplayLibraryName(auditLogLibrary.name)}
                        onClose={() => setAuditLogLibrary(null)}
                    />
                )
            }
        </div >
    )
}

