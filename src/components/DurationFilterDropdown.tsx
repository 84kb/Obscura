import { useState, useEffect, useRef } from 'react'
import { FilterOptions } from '../types'
import './DurationFilterDropdown.css'

interface DurationFilterDropdownProps {
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
    className?: string
}

type Unit = 'seconds' | 'minutes' | 'hours'

export function DurationFilterDropdown({
    filterOptions,
    onFilterChange,
    onClose,
    className
}: DurationFilterDropdownProps) {
    const [min, setMin] = useState<string>('')
    const [max, setMax] = useState<string>('')
    const [unit, setUnit] = useState<Unit>('seconds')
    const dropdownRef = useRef<HTMLDivElement>(null)

    // 初期値の設定（秒から適切な単位に変換して表示）
    useEffect(() => {
        const currentMin = filterOptions.durationMin
        const currentMax = filterOptions.durationMax

        if (currentMin === null && currentMax === null) {
            setMin('')
            setMax('')
            return
        }

        // 単位を推定（単純化のため、前回選択された単位を覚えているわけではないので、値から推測するか、デフォルト秒にする）
        // ここでは、入力中の一貫性を保つため、コンポーネント内ステートの単位を優先するが
        // 初回ロード時は適当に秒として扱う

        const convertToDisplay = (val: number | null | undefined) => {
            if (val === null || val === undefined) return ''
            if (unit === 'minutes') return (val / 60).toString()
            if (unit === 'hours') return (val / 3600).toString()
            return val.toString()
        }

        setMin(convertToDisplay(currentMin))
        setMax(convertToDisplay(currentMax))

    }, [filterOptions.durationMin, filterOptions.durationMax, unit]) // unitが変わったら再計算したくないが、表示値を変える必要がある

    // ESCで閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleApply = (newMinStr: string, newMaxStr: string, newUnit: Unit) => {
        const minVal = newMinStr === '' ? null : parseFloat(newMinStr)
        const maxVal = newMaxStr === '' ? null : parseFloat(newMaxStr)

        let minSeconds: number | null = null
        let maxSeconds: number | null = null

        const multiplier = newUnit === 'minutes' ? 60 : newUnit === 'hours' ? 3600 : 1

        if (minVal !== null && !isNaN(minVal)) {
            minSeconds = minVal * multiplier
        }
        if (maxVal !== null && !isNaN(maxVal)) {
            maxSeconds = maxVal * multiplier
        }

        onFilterChange({
            ...filterOptions,
            durationMin: minSeconds,
            durationMax: maxSeconds
        })
    }

    const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setMin(val)
        handleApply(val, max, unit)
    }

    const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setMax(val)
        handleApply(min, val, unit)
    }

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newUnit = e.target.value as Unit
        setUnit(newUnit)
        // 単位が変わったけど、入力値（数字）はそのまま維持したい？ それとも秒換算を維持したい？
        // 要件：ドロップダウンで「分」を選んだら、「1」と入力したら1分（60秒）になる。
        // すでに「60」秒が入っていて「分」に変えたら「1」になってほしいか、「60」のまま「60分」になるか。
        // 通常のUIでは「値は変換される」のが親切。

        // 現在の秒数を取得
        const currentMinSec = filterOptions.durationMin
        const currentMaxSec = filterOptions.durationMax

        // 新しい単位で表示値を計算しなおす
        const getDisplayVal = (sec: number | null | undefined) => {
            if (sec == null) return ''
            if (newUnit === 'minutes') return parseFloat((sec / 60).toFixed(2)).toString()
            if (newUnit === 'hours') return parseFloat((sec / 3600).toFixed(2)).toString()
            return sec.toString()
        }

        const newMinDisplay = getDisplayVal(currentMinSec)
        const newMaxDisplay = getDisplayVal(currentMaxSec)

        setMin(newMinDisplay)
        setMax(newMaxDisplay)

        // 値自体は変わらない（表示が変わるだけ）ので onFilterChange は不要だが、
        // 浮動小数点の端数処理などで微妙に変わる可能性はある。
        // ここでは変更しない。
    }

    const handleClear = () => {
        setMin('')
        setMax('')
        onFilterChange({
            ...filterOptions,
            durationMin: null,
            durationMax: null
        })
    }

    return (
        <div className={`duration-filter-dropdown ${className || ''}`} ref={dropdownRef}>
            <div className="duration-filter-row">
                <div className="duration-input-group">
                    <input
                        type="number"
                        className="duration-input"
                        placeholder="最小"
                        value={min}
                        onChange={handleMinChange}
                        min="0"
                    />
                    <span className="duration-separator">-</span>
                    <input
                        type="number"
                        className="duration-input"
                        placeholder="最大"
                        value={max}
                        onChange={handleMaxChange}
                        min="0"
                    />
                </div>
                <div className="unit-select-container">
                    <select className="unit-select" value={unit} onChange={handleUnitChange}>
                        <option value="seconds">秒</option>
                        <option value="minutes">分</option>
                        <option value="hours">時</option>
                    </select>
                </div>
            </div>
            <div className="duration-filter-footer">
                <button className="clear-btn" onClick={handleClear}>
                    クリア
                </button>
            </div>
        </div>
    )
}
