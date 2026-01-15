import { useState, useEffect, useRef } from 'react'
import { FilterOptions } from '../types'
import './DateFilterDropdown.css'

interface DateFilterDropdownProps {
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
}

export function DateFilterDropdown({
    filterOptions,
    onFilterChange,
    onClose
}: DateFilterDropdownProps) {
    const [minDate, setMinDate] = useState<string>('')
    const [maxDate, setMaxDate] = useState<string>('')
    const [activePreset, setActivePreset] = useState<string | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (filterOptions.dateModifiedMin) setMinDate(filterOptions.dateModifiedMin)
        if (filterOptions.dateModifiedMax) setMaxDate(filterOptions.dateModifiedMax)

        // プリセットの判定ロジックは省略（範囲から逆算するのは複雑なため、クリア時のみリセット）
        if (!filterOptions.dateModifiedMin && !filterOptions.dateModifiedMax) {
            setActivePreset(null)
        }
    }, [filterOptions.dateModifiedMin, filterOptions.dateModifiedMax])

    // 外側クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    const applyDateRange = (min: string | null, max: string | null, presetName: string | null = null) => {
        onFilterChange({
            ...filterOptions,
            dateModifiedMin: min,
            dateModifiedMax: max
        })
        setActivePreset(presetName)
        if (min) setMinDate(min)
        else setMinDate('')

        if (max) setMaxDate(max)
        else setMaxDate('')
    }

    const handlePresetClick = (days: number) => {
        const end = new Date()
        const start = new Date()

        // "昨日"などの特定日ではなく、"過去N日間"とする
        // 日付のみの部分を取得 (YYYY-MM-DD)
        const formatDate = (d: Date) => d.toISOString().split('T')[0]

        if (days === 0) { // 今日
            const today = formatDate(end)
            applyDateRange(today, today, 'today')
            return
        }

        if (days === 1) { // 昨日
            start.setDate(start.getDate() - 1)
            const yesterday = formatDate(start)
            applyDateRange(yesterday, yesterday, 'yesterday')
            return
        }

        // 過去N日間 (今日を含む)
        start.setDate(start.getDate() - (days - 1))

        applyDateRange(formatDate(start), formatDate(end), days.toString())
    }

    const handleCustomChange = (type: 'min' | 'max', value: string) => {
        setActivePreset(null)
        if (type === 'min') {
            setMinDate(value)
            onFilterChange({ ...filterOptions, dateModifiedMin: value || null })
        } else {
            setMaxDate(value)
            onFilterChange({ ...filterOptions, dateModifiedMax: value || null })
        }
    }

    const handleClear = () => {
        applyDateRange(null, null, null)
    }

    return (
        <div className="date-filter-dropdown" ref={dropdownRef}>
            <div className="date-preset-grid">
                <button
                    className={`preset-btn ${activePreset === 'today' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(0)}
                >
                    今日
                </button>
                <button
                    className={`preset-btn ${activePreset === 'yesterday' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(1)}
                >
                    昨日
                </button>
                <button
                    className={`preset-btn ${activePreset === '7' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(7)}
                >
                    過去 7 日間
                </button>
                <button
                    className={`preset-btn ${activePreset === '30' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(30)}
                >
                    過去 30 日間
                </button>
                <button
                    className={`preset-btn ${activePreset === '60' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(60)}
                >
                    過去 60 日間
                </button>
                <button
                    className={`preset-btn ${activePreset === '90' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(90)}
                >
                    過去 90 日間
                </button>
                <button
                    className={`preset-btn ${activePreset === '365' ? 'active' : ''}`}
                    onClick={() => handlePresetClick(365)}
                    style={{ gridColumn: 'span 2' }}
                >
                    過去 1 年間
                </button>
            </div>

            <div className="custom-date-section">
                <span className="date-label">カスタム範囲</span>
                <div className="date-input-group">
                    <input
                        type="date"
                        className="date-input"
                        value={minDate}
                        onChange={(e) => handleCustomChange('min', e.target.value)}
                        placeholder="開始日"
                    />
                    <span className="date-separator">-</span>
                    <input
                        type="date"
                        className="date-input"
                        value={maxDate}
                        onChange={(e) => handleCustomChange('max', e.target.value)}
                        placeholder="終了日"
                    />
                </div>
            </div>

            <div className="date-filter-footer">
                <button className="clear-btn" onClick={handleClear}>
                    クリア
                </button>
            </div>
        </div>
    )
}
