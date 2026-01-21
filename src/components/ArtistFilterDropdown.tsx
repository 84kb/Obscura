import { useState, useEffect, useRef } from 'react'
import { FilterOptions } from '../types'
import './ArtistFilterDropdown.css'

interface ArtistInfo {
    name: string
    count: number
}

interface ArtistFilterDropdownProps {
    artists: ArtistInfo[]
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
    className?: string
}

export function ArtistFilterDropdown({
    artists,
    filterOptions,
    onFilterChange,
    onClose,
    className
}: ArtistFilterDropdownProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)

    // ESCで閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // フィルタされた投稿者
    const filteredArtists = artists
        .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => b.count - a.count)

    const toggleArtist = (artist: string, isRightClick: boolean = false) => {
        let newSelected = [...(filterOptions.selectedArtists || [])]
        let newExcluded = [...(filterOptions.excludedArtists || [])]

        if (isRightClick) {
            // 除外トグル
            if (newExcluded.includes(artist)) {
                newExcluded = newExcluded.filter(a => a !== artist)
            } else {
                newExcluded.push(artist)
                newSelected = newSelected.filter(a => a !== artist)
            }
        } else {
            // 選択トグル
            if (newSelected.includes(artist)) {
                newSelected = newSelected.filter(a => a !== artist)
            } else {
                newSelected.push(artist)
                newExcluded = newExcluded.filter(a => a !== artist)
            }
        }

        onFilterChange({
            ...filterOptions,
            selectedArtists: newSelected,
            excludedArtists: newExcluded
        })
    }

    const selectAll = () => {
        const visibleNames = filteredArtists.map(a => a.name)
        const allSelected = visibleNames.every(name => filterOptions.selectedArtists?.includes(name))

        if (allSelected) {
            onFilterChange({
                ...filterOptions,
                selectedArtists: filterOptions.selectedArtists?.filter(name => !visibleNames.includes(name)) || []
            })
        } else {
            const newSelected = [...(filterOptions.selectedArtists || [])]
            visibleNames.forEach(name => {
                if (!newSelected.includes(name)) newSelected.push(name)
            })
            onFilterChange({
                ...filterOptions,
                selectedArtists: newSelected,
                excludedArtists: filterOptions.excludedArtists?.filter(name => !visibleNames.includes(name)) || []
            })
        }
    }

    const isAllSelected = filteredArtists.length > 0 &&
        filteredArtists.every(a => filterOptions.selectedArtists?.includes(a.name))

    return (
        <div className={`artist-filter-dropdown ${className || ''}`} ref={dropdownRef}>
            <div className="artist-filter-header">
                <div className="artist-filter-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        type="text"
                        placeholder="投稿者を検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            <div className="artist-filter-list">
                {filteredArtists.map(artist => {
                    const isSelected = filterOptions.selectedArtists?.includes(artist.name)
                    const isExcluded = filterOptions.excludedArtists?.includes(artist.name)

                    return (
                        <div
                            key={artist.name}
                            className={`artist-filter-item ${isSelected ? 'selected' : ''} ${isExcluded ? 'excluded' : ''}`}
                            onClick={() => toggleArtist(artist.name)}
                            onContextMenu={(e) => {
                                e.preventDefault()
                                toggleArtist(artist.name, true)
                            }}
                        >
                            <div className="artist-checkbox">
                                {isSelected && <span className="check-mark">✓</span>}
                                {isExcluded && <span className="exclude-mark">×</span>}
                            </div>
                            <span className="artist-name">{artist.name}</span>
                            <span className="artist-count">{artist.count.toLocaleString()}</span>
                        </div>
                    )
                })}
                {filteredArtists.length > 0 && (
                    <div className="artist-filter-item select-all" onClick={selectAll}>
                        <div className="artist-checkbox">
                            {isAllSelected && <span className="check-mark">✓</span>}
                        </div>
                        <span className="artist-name">すべてを選択</span>
                    </div>
                )}
            </div>

            <div className="artist-filter-footer">
                <span>選択 <u>左クリック</u></span>
                <span>除外 <u>右クリック</u></span>
            </div>
        </div>
    )
}
