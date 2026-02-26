import { useRef, useEffect } from 'react'
import { FilterOptions } from '@obscura/core'
import './RatingFilterDropdown.css'

interface RatingFilterDropdownProps {
    filterOptions: FilterOptions
    counts: Record<string, number>
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
    className?: string
}

export function RatingFilterDropdown({
    filterOptions,
    counts,
    onFilterChange,
    onClose,
    className
}: RatingFilterDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const toggleRating = (rating: number, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }

        const isRightClick = e ? (e.button === 2 || e.ctrlKey) : false
        const currentSelected = filterOptions.selectedRatings || []
        const currentExcluded = filterOptions.excludedRatings || []

        let newSelected = [...currentSelected]
        let newExcluded = [...currentExcluded]

        if (isRightClick) {
            // 右クリック: 除外の切り替え
            if (currentExcluded.includes(rating)) {
                newExcluded = currentExcluded.filter(r => r !== rating)
            } else {
                newExcluded = [...currentExcluded, rating]
                newSelected = currentSelected.filter(r => r !== rating)
            }
        } else {
            // 左クリック: 選択の切り替え
            if (currentSelected.includes(rating)) {
                newSelected = currentSelected.filter(r => r !== rating)
            } else {
                newSelected = [...currentSelected, rating]
                newExcluded = currentExcluded.filter(r => r !== rating)
            }
        }

        onFilterChange({
            ...filterOptions,
            selectedRatings: newSelected,
            excludedRatings: newExcluded
        })
    }

    const renderStars = (count: number) => {
        return Array.from({ length: 5 }).map((_, i) => (
            <svg
                key={i}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={i < count ? "var(--primary)" : "none"}
                stroke={i < count ? "var(--primary)" : "var(--text-muted)"}
                strokeWidth="2"
                className="star-icon"
            >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
            </svg>
        ))
    }

    const ratings = [5, 4, 3, 2, 1, 0]

    return (
        <div className={`rating-filter-dropdown ${className || ''}`} ref={dropdownRef}>
            <div className="rating-filter-list">
                {ratings.map(rating => {
                    const isSelected = (filterOptions.selectedRatings || []).includes(rating)
                    const isExcluded = (filterOptions.excludedRatings || []).includes(rating)

                    return (
                        <div
                            key={rating}
                            className={`rating-filter-item ${isSelected ? 'selected' : ''} ${isExcluded ? 'excluded' : ''}`}
                            onClick={(e) => toggleRating(rating, e)}
                            onContextMenu={(e) => toggleRating(rating, e)}
                        >
                            <div className="rating-checkbox">
                                {isSelected && <span className="check-mark">✓</span>}
                                {isExcluded && <span className="exclude-mark">×</span>}
                            </div>
                            <div className="rating-stars">
                                {rating > 0 ? renderStars(rating) : <span className="no-rating-text">評価なし</span>}
                            </div>
                            <div className="rating-count">
                                {(counts[rating] || 0).toLocaleString()}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
