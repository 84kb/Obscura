import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

// キーバインディングの定義
// ActionID -> Key Combination (e.g. 'Space', 'Ctrl+S')
export type KeyMap = Record<string, string>

// ショートカットアクションIDの定義
export type ShortcutAction =
    // Player
    | 'PLAYER_TOGGLE_PLAY'
    | 'PLAYER_FORWARD'
    | 'PLAYER_REWIND'
    | 'PLAYER_VOLUME_UP'
    | 'PLAYER_VOLUME_DOWN'
    | 'PLAYER_TOGGLE_MUTE'
    | 'PLAYER_TOGGLE_FULLSCREEN'
    | 'PLAYER_STEP_FORWARD'
    | 'PLAYER_STEP_BACKWARD'
    | 'NAV_ENTER'
    | 'NAV_BACK'

    | 'NAV_UP'
    | 'NAV_DOWN'
    | 'NAV_LEFT'
    | 'NAV_RIGHT'

// デフォルトのキー設定
export const DEFAULT_KEYMAP: KeyMap = {
    'PLAYER_TOGGLE_PLAY': 'Space',
    'PLAYER_FORWARD': 'ArrowRight',
    'PLAYER_REWIND': 'ArrowLeft',
    'PLAYER_STEP_FORWARD': 'Period',
    'PLAYER_STEP_BACKWARD': 'Comma',
    'PLAYER_VOLUME_UP': 'ArrowUp',
    'PLAYER_VOLUME_DOWN': 'ArrowDown',
    'PLAYER_TOGGLE_MUTE': 'KeyM',
    'PLAYER_TOGGLE_FULLSCREEN': 'KeyF',
    'NAV_ENTER': 'Enter',
    'NAV_BACK': 'Escape',
    'NAV_UP': 'ArrowUp',
    'NAV_DOWN': 'ArrowDown',
    'NAV_LEFT': 'ArrowLeft',
    'NAV_RIGHT': 'ArrowRight'
}

type ShortcutScope = 'global' | 'player' | 'library' | 'modal'

interface ShortcutContextType {
    registerShortcut: (action: ShortcutAction, handler: () => void, scope?: ShortcutScope) => () => void
    pushScope: (scope: ShortcutScope) => void
    popScope: (scope: ShortcutScope) => void
    activeScope: ShortcutScope
    getKeyMap: () => KeyMap
    setKeyBinding: (action: ShortcutAction, key: string) => void
    resetKeyMap: () => void
}

export const ShortcutContext = createContext<ShortcutContextType | null>(null)

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    // ローカルストレージから読み込む、なければデフォルト
    const [keyMap, setKeyMap] = useState<KeyMap>(() => {
        try {
            const saved = localStorage.getItem('app_shortcuts')
            if (saved) {
                const parsed = JSON.parse(saved)
                // マージして新しいキーが増えても対応できるようにする
                return { ...DEFAULT_KEYMAP, ...parsed }
            }
        } catch (e) {
            console.error('Failed to load shortcuts:', e)
        }
        return DEFAULT_KEYMAP
    })

    // 保存
    useEffect(() => {
        localStorage.setItem('app_shortcuts', JSON.stringify(keyMap))
    }, [keyMap])
    // スコープスタック (末尾が現在のアクティブスコープ)
    const [scopeStack, setScopeStack] = useState<ShortcutScope[]>(['global'])

    // アクションごとのハンドラーを保持 (Action -> Handler[])
    // 複数のハンドラーが登録される可能性があるため配列にするが、基本は最新のものが優先されるべき
    const handlersRef = useRef<Map<ShortcutAction, { handler: () => void, scope: ShortcutScope }[]>>(new Map())

    const activeScope = scopeStack[scopeStack.length - 1]

    // キー押下時の処理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 入力フィールド等での発火防止
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                // Escapeだけは入力中でも効くようにしてもいいが、一旦除外
                return;
            }

            // モディファイアキーの解決
            const modifiers = []
            if (e.ctrlKey) modifiers.push('Ctrl')
            if (e.altKey) modifiers.push('Alt')
            if (e.shiftKey) modifiers.push('Shift')
            if (e.metaKey) modifiers.push('Meta')

            // キーコードの解決 (例: 'KeyF' -> 'f' としたい場合もあるが、e.codeを使用)
            const code = e.code

            // マッチするアクションを探す
            // Note: 現状は単純な完全一致のみ。将来的には 'Ctrl+S' のような組み合わせ文字列生成ロジックが必要
            // ここでは e.code を直接マップと比較する簡易実装
            // マッチするアクションをすべて探す
            const matchedActions: ShortcutAction[] = []

            for (const [action, key] of Object.entries(keyMap)) {
                if (key === code) {
                    matchedActions.push(action as ShortcutAction)
                }
            }

            for (const matchedAction of matchedActions) {
                const registeredHandlers = handlersRef.current.get(matchedAction)
                if (registeredHandlers && registeredHandlers.length > 0) {
                    // スコープスタックを上（現在のアクティブスコープ）から順に走査して、
                    // 最初に見つかったハンドラーを実行する（イベントバブリング的挙動）
                    let validHandler = null

                    // Note: scopeStackには 'global' が含まれている前提 ('global' は常に底にある)
                    for (let i = scopeStack.length - 1; i >= 0; i--) {
                        const scope = scopeStack[i]
                        const handlerInScope = registeredHandlers.find(h => h.scope === scope)
                        if (handlerInScope) {
                            validHandler = handlerInScope
                            break
                        }
                    }

                    if (validHandler) {
                        console.log('[Shortcut] Executing:', matchedAction, 'Scope:', validHandler.scope)
                        e.preventDefault()
                        validHandler.handler()
                        break
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [keyMap, activeScope]) // scopeStackが変わるたびにリスナー再登録は避けるべきだが、activeScopeが変われば判定が変わるため依存に入れる

    const registerShortcut = useCallback((action: ShortcutAction, handler: () => void, scope: ShortcutScope = 'global') => {
        const currentHandlers = handlersRef.current.get(action) || []
        handlersRef.current.set(action, [...currentHandlers, { handler, scope }])

        // クリーンアップ関数
        return () => {
            const handlers = handlersRef.current.get(action) || []
            handlersRef.current.set(action, handlers.filter(h => h.handler !== handler))
        }
    }, [])

    const pushScope = useCallback((scope: ShortcutScope) => {
        setScopeStack(prev => [...prev, scope])
    }, [])

    const popScope = useCallback((scope: ShortcutScope) => {
        setScopeStack(prev => {
            // 指定されたスコープ以降を削除するか、単に末尾を削除するか
            // ここでは指定されたスコープがあればそこまで戻す
            const index = prev.lastIndexOf(scope)
            if (index !== -1 && index !== 0) { // globalは消さない
                return prev.slice(0, index)
            }
            return prev
        })
    }, [])

    const getKeyMap = useCallback(() => keyMap, [keyMap])

    const setKeyBinding = useCallback((action: ShortcutAction, key: string) => {
        setKeyMap(prev => ({
            ...prev,
            [action]: key
        }))
    }, [])

    const resetKeyMap = useCallback(() => {
        setKeyMap(DEFAULT_KEYMAP)
    }, [])

    return (
        <ShortcutContext.Provider value={{ registerShortcut, pushScope, popScope, activeScope, getKeyMap, setKeyBinding, resetKeyMap }}>
            {children}
        </ShortcutContext.Provider>
    )
}

// Hook
export const useShortcut = (action: ShortcutAction, handler: () => void, options: { scope?: ShortcutScope, enabled?: boolean } = {}) => {
    const { registerShortcut } = useContext(ShortcutContext)!
    const { scope = 'global', enabled = true } = options

    useEffect(() => {
        if (!enabled) return

        const unregister = registerShortcut(action, handler, scope)
        return unregister
    }, [action, handler, scope, enabled, registerShortcut])
}
