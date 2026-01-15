import { useRef, useEffect } from 'react'
import { FilterOptions } from '../types'
import './RatingFilterDropdown.css'

interface RatingFilterDropdownProps {
    filterOptions: FilterOptions
    counts: Record<number, number>
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
}

export function RatingFilterDropdown({
    filterOptions,
    counts,
    onFilterChange,
    onClose
}: RatingFilterDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const toggleRating = (rating: number) => {
        const currentSelected = filterOptions.selectedRatings || []
        let newSelected: number[]

        if (currentSelected.includes(rating)) {
            newSelected = currentSelected.filter(r => r !== rating)
        } else {
            newSelected = [...currentSelected, rating]
        }

        onFilterChange({
            ...filterOptions,
            selectedRatings: newSelected
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
        <div className="rating-filter-dropdown" ref={dropdownRef}>
            <div className="rating-filter-list">
                {ratings.map(rating => {
                    const isSelected = (filterOptions.selectedRatings || []).includes(rating)
                    return (
                        <div
                            key={rating}
                            className={`rating-filter-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleRating(rating)}
                        >
                            <div className="rating-checkbox">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => { }} // Controlled by parent click
                                />
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
