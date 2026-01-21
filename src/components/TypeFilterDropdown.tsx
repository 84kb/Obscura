import { useRef, useEffect } from 'react'
import { FilterOptions } from '../types'
import './TypeFilterDropdown.css'

interface TypeFilterDropdownProps {
    filterOptions: FilterOptions
    counts: Record<string, number>
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
    className?: string
}

export function TypeFilterDropdown({
    filterOptions,
    counts,
    onFilterChange,
    onClose,
    className
}: TypeFilterDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null)

    // ESCで閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleItemClick = (e: React.MouseEvent, ext: string) => {
        e.preventDefault()
        e.stopPropagation()

        const isRightClick = e.button === 2 || e.ctrlKey
        const selected = filterOptions.selectedExtensions || []
        const excluded = filterOptions.excludedExtensions || []

        let newSelected = [...selected]
        let newExcluded = [...excluded]

        if (isRightClick) {
            // 右クリック: 除外の切り替え
            if (excluded.includes(ext)) {
                newExcluded = excluded.filter(e => e !== ext)
            } else {
                newExcluded = [...excluded, ext]
                newSelected = selected.filter(e => e !== ext)
            }
        } else {
            // 左クリック: 選択の切り替え
            if (selected.includes(ext)) {
                newSelected = selected.filter(e => e !== ext)
            } else {
                newSelected = [...selected, ext]
                newExcluded = excluded.filter(e => e !== ext)
            }
        }

        onFilterChange({
            ...filterOptions,
            selectedExtensions: newSelected,
            excludedExtensions: newExcluded
        })
    }

    const clearFilters = () => {
        onFilterChange({
            ...filterOptions,
            selectedExtensions: [],
            excludedExtensions: []
        })
    }

    const extensions = Object.keys(counts).sort((a, b) => b.localeCompare(a))

    return (
        <div className={`type-filter-dropdown ${className || ''}`} ref={dropdownRef} onContextMenu={(e) => e.preventDefault()}>
            <div className="type-filter-list">
                {extensions.map(ext => {
                    const isSelected = (filterOptions.selectedExtensions || []).includes(ext)
                    const isExcluded = (filterOptions.excludedExtensions || []).includes(ext)

                    return (
                        <div
                            key={ext}
                            className={`type-filter-item ${isSelected ? 'selected' : ''} ${isExcluded ? 'excluded' : ''}`}
                            onClick={(e) => handleItemClick(e, ext)}
                            onContextMenu={(e) => handleItemClick(e, ext)}
                        >
                            <div className="type-checkbox">
                                {isSelected && <span className="check-mark">✓</span>}
                                {isExcluded && <span className="exclude-mark">×</span>}
                            </div>
                            <span className={`type-name ${isExcluded ? 'excluded-text' : ''}`}>
                                {ext.toUpperCase() || 'UNKNOWN'}
                            </span>
                            <span className="type-count">
                                {counts[ext].toLocaleString()}
                            </span>
                        </div>
                    )
                })}
            </div>
            <div className="type-filter-footer">
                <button className="clear-btn" onClick={clearFilters}>クリア</button>
            </div>
        </div>
    )
}
