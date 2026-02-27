import { useLayoutEffect, RefObject } from 'react'

/**
 * 浮遊要素（コンテキストメニューやドロップダウン）をビューポート内に収めるためのフック
 * @param ref 対象要素のRef
 * @param x 表示予定のX座標
 * @param y 表示予定のY座標
 * @param isOpen 開いているかどうか
 * @param padding ウィンドウ端からのマージン（デフォルト: 10px）
 */
export function useFloatingPosition(
    ref: RefObject<HTMLElement | null>,
    x: number,
    y: number,
    isOpen: boolean,
    padding: number = 10
) {
    useLayoutEffect(() => {
        if (isOpen && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            let adjustedX = x
            let adjustedY = y

            // 右端の調整
            if (x + rect.width > viewportWidth) {
                adjustedX = Math.max(padding, viewportWidth - rect.width - padding)
            }

            // 下端の調整
            if (y + rect.height > viewportHeight) {
                adjustedY = Math.max(padding, viewportHeight - rect.height - padding)
            }

            // 左端・上端の最低限の保証
            adjustedX = Math.max(padding, adjustedX)
            adjustedY = Math.max(padding, adjustedY)

            ref.current.style.left = `${adjustedX}px`
            ref.current.style.top = `${adjustedY}px`
        }
    }, [x, y, isOpen, ref, padding])
}
