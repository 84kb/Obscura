import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { Sidebar } from './components/Sidebar'
import { useNotification } from './contexts/NotificationContext'
import { LibraryGrid } from './components/LibraryGrid'
import { LibraryList } from './components/LibraryList'
import { Player } from './components/Player'
import { Inspector } from './components/Inspector'
import { TagManager } from './components/TagManager'
import { LibraryModal } from './components/LibraryModal'
import { SettingsModal } from './components/SettingsModal'
import { ContextMenu } from './components/ContextMenu'
import { ConfirmModal } from './components/ConfirmModal'
import { SubfolderGrid } from './components/SubfolderGrid'
import { useLibrary } from './hooks/useLibrary'
import { MediaFile, AppSettings, ViewSettings, defaultViewSettings, ClientConfig, SharedUser, FilterOptions } from '@obscura/core'
import { MainHeader } from './components/MainHeader'
import { useSocket } from './hooks/useSocket'
import { useTheme } from './hooks/useTheme'
import { useSettings } from './hooks/useSettings'
import { DuplicateModal } from './components/DuplicateModal'
import { ShortcutProvider, useShortcut } from './contexts/ShortcutContext'
import './styles/index.css'
import './styles/drag-overlay.css'
import { LoadingOverlay } from './components/LoadingOverlay'
import { getAuthHeaders, getAuthQuery } from './utils/auth'
import { toMediaUrl } from './utils/fileUrl'
import { api } from './api'
import { initializePluginSystem, loadPluginScripts } from './api/plugin-system'
import { t as i18nT, AppLanguage } from './i18n'
import { getBundledReleaseNotes } from './releaseNotes'

const ENABLE_RANDOM_THUMB_PREFETCH = false
const FILTER_PRESETS_STORAGE_KEY = 'obscura_filter_presets'
const LAST_LAUNCHED_VERSION_STORAGE_KEY = 'obscura_last_launched_version'
const SIDEBAR_WIDTH_STORAGE_KEY = 'obscura_sidebar_width'
const INSPECTOR_WIDTH_STORAGE_KEY = 'obscura_inspector_width'
const DEFAULT_SIDEBAR_WIDTH = 208
const DEFAULT_INSPECTOR_WIDTH = 300
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 360
const INSPECTOR_MIN_WIDTH = 260
const INSPECTOR_MAX_WIDTH = 520
const MAIN_CONTENT_MIN_WIDTH = 560
const PANEL_RESIZE_HANDLE_WIDTH = 8
const DEFAULT_SEARCH_TARGETS = {
    name: true,
    folder: true,
    description: true,
    extension: true,
    tags: true,
    url: true,
    comments: true,
    memo: true,
    artist: true
} as const
type FilterPreset = {
    id: string
    name: string
    options: FilterOptions
    createdAt: string
}

type ReleaseNotesModalState = {
    version: string
    releaseNotes: string
}

const clampNumber = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return min
    return Math.min(Math.max(value, min), max)
}

const readStoredWidth = (storageKey: string, fallback: number, min: number, max: number): number => {
    if (typeof window === 'undefined') return fallback
    const raw = Number(localStorage.getItem(storageKey))
    if (!Number.isFinite(raw)) return fallback
    return clampNumber(raw, min, max)
}

const createDefaultFilterOptions = (): FilterOptions => ({
    searchQuery: '',
    searchTargets: { ...DEFAULT_SEARCH_TARGETS },
    selectedTags: [],
    excludedTags: [],
    selectedFolders: [],
    excludedFolders: [],
    tagFilterMode: 'or',
    selectedSysDirs: [],
    excludedSysDirs: [],
    folderFilterMode: 'or',
    filterType: 'all',
    fileType: 'all',
    sortOrder: 'name',
    sortDirection: 'desc',
    selectedRatings: [],
    excludedRatings: [],
    selectedExtensions: [],
    excludedExtensions: [],
    selectedArtists: [],
    excludedArtists: [],
    durationMin: undefined,
    durationMax: undefined,
    dateModifiedMin: undefined,
    dateModifiedMax: undefined,
})

const normalizeFilterOptions = (input: Partial<FilterOptions> | null | undefined): FilterOptions => {
    const defaults = createDefaultFilterOptions()
    return {
        ...defaults,
        ...(input || {}),
        searchTargets: {
            ...DEFAULT_SEARCH_TARGETS,
            ...((input as any)?.searchTargets || {})
        }
    }
}

const DEFAULT_INSPECTOR_SETTINGS = {
    sectionVisibility: {
        artist: true,
        description: true,
        relations: true,
        url: true,
        tags: true,
        folders: true,
        info: true,
        comments: true,
        playlist: true
    },
    infoVisibility: {
        rating: true,
        resolution: true,
        duration: true,
        fileSize: true,
        importedAt: true,
        createdAt: true,
        modifiedAt: true,
        audioBitrate: true,
        framerate: true,
        formatName: true,
        codecId: true
    },
    playlistPrevVisibleCount: 1,
    playlistNextVisibleCount: 10
} as const

const DEFAULT_SETTINGS: AppSettings = {
    autoPlay: true,
    allowUpscale: false,
    gridSize: 4,
    viewMode: 'grid',
    enableRichText: false,
    pipControlMode: 'navigation',
    autoHideSidebar: false,
    showInfoOverlay: false,
    showTitleOnHover: true,
    videoScaling: 'smooth',
    imageScaling: 'smooth',
    inspector: DEFAULT_INSPECTOR_SETTINGS,
    extensions: {
        niconico: {
            enabled: false
        }
    }
}

const mergeAppSettings = (input: Partial<AppSettings> | null | undefined): AppSettings => {
    const legacyPlaylistVisibleCount = Number.isFinite(Number((input as any)?.inspector?.playlistVisibleCount))
        ? Math.max(3, Math.min(50, Number((input as any)?.inspector?.playlistVisibleCount)))
        : 12

    return {
        ...DEFAULT_SETTINGS,
        ...(input || {}),
        inspector: {
            ...DEFAULT_INSPECTOR_SETTINGS,
            ...((input as any)?.inspector || {}),
            sectionVisibility: {
                ...DEFAULT_INSPECTOR_SETTINGS.sectionVisibility,
                ...((input as any)?.inspector?.sectionVisibility || {})
            },
            infoVisibility: {
                ...DEFAULT_INSPECTOR_SETTINGS.infoVisibility,
                ...((input as any)?.inspector?.infoVisibility || {})
            },
            playlistPrevVisibleCount: Number.isFinite(Number((input as any)?.inspector?.playlistPrevVisibleCount))
                ? Math.max(0, Math.min(50, Number((input as any)?.inspector?.playlistPrevVisibleCount)))
                : DEFAULT_INSPECTOR_SETTINGS.playlistPrevVisibleCount,
            playlistNextVisibleCount: Number.isFinite(Number((input as any)?.inspector?.playlistNextVisibleCount))
                ? Math.max(0, Math.min(50, Number((input as any)?.inspector?.playlistNextVisibleCount)))
                : Math.max(0, legacyPlaylistVisibleCount - 2)
        }
    }
}

function isPipWindowMode(): boolean {
    if (typeof window === 'undefined') return false
    try {
        return new URLSearchParams(window.location.search).get('pip') === '1'
    } catch {
        return false
    }
}

function parsePipMediaFromQuery(): MediaFile | null {
    if (typeof window === 'undefined') return null
    try {
        const params = new URLSearchParams(window.location.search)
        const raw = params.get('media')
        if (!raw) return null
        let parsed: any = null
        try {
            // URLSearchParams already decodes once in many runtimes.
            parsed = JSON.parse(raw)
        } catch {
            parsed = JSON.parse(decodeURIComponent(raw))
        }
        if (!parsed || typeof parsed !== 'object') return null
        if (!parsed.file_path || !parsed.file_name || !parsed.file_type) return null
        return parsed as MediaFile
    } catch {
        return null
    }
}

function getPipControlModeFromQuery(): 'navigation' | 'skip' {
    if (typeof window === 'undefined') return 'skip'
    try {
        const mode = new URLSearchParams(window.location.search).get('pipControlMode')
        return mode === 'navigation' ? 'navigation' : 'skip'
    } catch {
        return 'skip'
    }
}

function parsePipInitialStateFromQuery(): {
    currentTime?: number
    isPlaying?: boolean
    playbackRate?: number
    volume?: number
    muted?: boolean
} | null {
    if (typeof window === 'undefined') return null
    try {
        const params = new URLSearchParams(window.location.search)
        const toFiniteNumber = (key: string): number | undefined => {
            const raw = params.get(key)
            if (raw == null || raw === '') return undefined
            const n = Number(raw)
            return Number.isFinite(n) ? n : undefined
        }

        const currentTime = toFiniteNumber('currentTime')
        const playbackRate = toFiniteNumber('playbackRate')
        const volume = toFiniteNumber('volume')
        const isPlayingRaw = params.get('isPlaying')
        const mutedRaw = params.get('muted')
        const isPlaying = isPlayingRaw == null ? undefined : isPlayingRaw === '1' || isPlayingRaw === 'true'
        const muted = mutedRaw == null ? undefined : mutedRaw === '1' || mutedRaw === 'true'

        return {
            currentTime,
            isPlaying,
            playbackRate,
            volume,
            muted
        }
    } catch {
        return null
    }
}

function PipWindowApp() {
    const media = useMemo(() => parsePipMediaFromQuery(), [])
    const pipControlMode = useMemo(() => getPipControlModeFromQuery(), [])
    const pipInitialState = useMemo(() => parsePipInitialStateFromQuery(), [])

    useEffect(() => {
        const suppressContextMenu = (e: MouseEvent) => {
            e.preventDefault()
        }
        document.addEventListener('contextmenu', suppressContextMenu)
        return () => {
            document.removeEventListener('contextmenu', suppressContextMenu)
        }
    }, [])

    const closePipWindow = useCallback(async () => {
        try {
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            await getCurrentWebviewWindow().close()
        } catch {
            window.close()
        }
    }, [])

    if (!media) {
        return (
            <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
                <div>PiP media could not be loaded.</div>
            </div>
        )
    }

    return (
        <div className="app">
            <div className="player-overlay-container">
                <Player
                    media={media}
                    onBack={closePipWindow}
                    autoPlayEnabled={false}
                    pipControlMode={pipControlMode}
                    pipWindowMode
                    pipInitialState={pipInitialState}
                    settings={{ ...DEFAULT_SETTINGS, pipControlMode }}
                />
            </div>
        </div>
    )
}

export default function App() {

    useEffect(() => {
        // プラグインシステムの初期化 (一度だけ)
        initializePluginSystem()
    }, [])


    if (isPipWindowMode()) {
        return (
            <ShortcutProvider>
                <PipWindowApp />
            </ShortcutProvider>
        )
    }

    return (
        <ShortcutProvider>
            <AppContent />
        </ShortcutProvider>
    )
}

function AppContent() {
    const [viewSettings, setViewSettings] = useState<ViewSettings>(() => {
        const saved = localStorage.getItem('view_settings')
        if (saved) {
            return { ...defaultViewSettings, ...JSON.parse(saved) }
        }
        return defaultViewSettings
    })
    const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth(SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_SIDEBAR_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))
    const [inspectorWidth, setInspectorWidth] = useState(() => readStoredWidth(INSPECTOR_WIDTH_STORAGE_KEY, DEFAULT_INSPECTOR_WIDTH, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH))
    const [activeResizePanel, setActiveResizePanel] = useState<'sidebar' | 'inspector' | null>(null)
    const sidebarWidthRef = useRef(sidebarWidth)
    const inspectorWidthRef = useRef(inspectorWidth)
    const sidebarShellRef = useRef<HTMLDivElement | null>(null)
    const inspectorShellRef = useRef<HTMLDivElement | null>(null)
    const resizeGuideRef = useRef<HTMLDivElement | null>(null)
    const resizeStartXRef = useRef(0)
    const resizeStartWidthRef = useRef(0)
    const resizeCommitStartedAtRef = useRef<number | null>(null)
    const resizeCommitPanelRef = useRef<'sidebar' | 'inspector' | null>(null)
    const resizeCommitTimerRefs = useRef<number[]>([])

    const {
        mediaFiles,
        allMediaFiles,
        filterOptions,
        setFilterOptions,
        tags,
        tagGroups,
        folders,
        libraries,
        activeLibrary,
        createTag,
        deleteTag,
        createFolder,
        addTagToMedia,
        removeTagFromMedia,
        addFolderToMedia,
        removeFolderFromMedia,
        moveToTrash,
        moveFilesToTrash,
        restoreFromTrash,
        restoreFilesFromTrash,
        deletePermanently,
        deleteFilesPermanently,
        updateLastPlayed,
        createLibrary,
        hasActiveLibrary,
        importMedia,
        libraryStats,
        updateRating,
        updateArtist,
        renameMedia,
        updateDescription,
        updateUrl,
        refreshLibrary,
        loadFolders,
        renameFolder,
        deleteFolder,
        activeRemoteLibrary,
        switchToRemoteLibrary,
        switchToLocalLibrary,
        removeLocalLibraryHistory,
        openLibrary,
        myUserToken,
        addTagsToMedia,
        reloadLibrary,
        checkEntryDuplicates,
        loading,
        loadingProgress,
        startupLoading,
        loadMore,
        hasMore
    } = useLibrary({ showSubfolderContent: viewSettings.showSubfolderContent })
    const isStartupOverlayVisible = startupLoading && loadingProgress < 100

    const reconcilePanelWidths = useCallback((nextSidebarWidth: number, nextInspectorWidth: number, viewportWidth = window.innerWidth) => {
        let resolvedSidebarWidth = clampNumber(nextSidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
        let resolvedInspectorWidth = clampNumber(nextInspectorWidth, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH)
        const visibleSidebar = viewSettings.showSidebar
        const visibleInspector = viewSettings.showInspector
        const visibleHandleWidth =
            (visibleSidebar ? PANEL_RESIZE_HANDLE_WIDTH : 0) +
            (visibleInspector ? PANEL_RESIZE_HANDLE_WIDTH : 0)
        const availableForPanels = viewportWidth - MAIN_CONTENT_MIN_WIDTH - visibleHandleWidth

        if (availableForPanels <= 0) {
            return {
                sidebarWidth: resolvedSidebarWidth,
                inspectorWidth: resolvedInspectorWidth
            }
        }

        let totalVisibleWidth = (visibleSidebar ? resolvedSidebarWidth : 0) + (visibleInspector ? resolvedInspectorWidth : 0)
        let overflow = totalVisibleWidth - availableForPanels

        if (overflow > 0 && visibleInspector) {
            const reducibleInspectorWidth = resolvedInspectorWidth - INSPECTOR_MIN_WIDTH
            const reduction = Math.min(overflow, Math.max(0, reducibleInspectorWidth))
            resolvedInspectorWidth -= reduction
            overflow -= reduction
        }

        if (overflow > 0 && visibleSidebar) {
            const reducibleSidebarWidth = resolvedSidebarWidth - SIDEBAR_MIN_WIDTH
            const reduction = Math.min(overflow, Math.max(0, reducibleSidebarWidth))
            resolvedSidebarWidth -= reduction
        }

        return {
            sidebarWidth: resolvedSidebarWidth,
            inspectorWidth: resolvedInspectorWidth
        }
    }, [viewSettings.showInspector, viewSettings.showSidebar])

    useEffect(() => {
        sidebarWidthRef.current = sidebarWidth
    }, [sidebarWidth])

    useEffect(() => {
        inspectorWidthRef.current = inspectorWidth
    }, [inspectorWidth])

    useEffect(() => {
        return () => {
            resizeCommitTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId))
            resizeCommitTimerRefs.current = []
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
            return
        }

        let observer: PerformanceObserver | null = null
        try {
            observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    console.warn('[Perf] longtask', {
                        name: entry.name,
                        startTime: Math.round(entry.startTime),
                        duration: Math.round(entry.duration)
                    })
                }
            })
            observer.observe({ entryTypes: ['longtask'] as any })
        } catch {
            observer = null
        }

        let expected = performance.now() + 1000
        const intervalId = window.setInterval(() => {
            const now = performance.now()
            const drift = now - expected
            if (drift > 250) {
                console.warn('[Perf] timer drift', {
                    driftMs: Math.round(drift),
                    now: Math.round(now)
                })
            }
            expected = now + 1000
        }, 1000)

        return () => {
            window.clearInterval(intervalId)
            observer?.disconnect()
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return

        let rafId = 0
        let lastFrameTime = performance.now()

        const tick = (now: number) => {
            const delta = now - lastFrameTime
            if (delta > 250) {
                console.warn('[Perf] raf gap', {
                    gapMs: Math.round(delta),
                    now: Math.round(now)
                })
            }
            lastFrameTime = now
            rafId = window.requestAnimationFrame(tick)
        }

        rafId = window.requestAnimationFrame(tick)
        return () => {
            window.cancelAnimationFrame(rafId)
        }
    }, [])

    useEffect(() => {
        if (resizeCommitStartedAtRef.current == null) return
        console.log('[PanelResize] sidebar state applied', {
            width: sidebarWidth,
            elapsedMs: Math.round(performance.now() - resizeCommitStartedAtRef.current),
            panel: resizeCommitPanelRef.current
        })
    }, [sidebarWidth])

    useEffect(() => {
        if (resizeCommitStartedAtRef.current == null) return
        console.log('[PanelResize] inspector state applied', {
            width: inspectorWidth,
            elapsedMs: Math.round(performance.now() - resizeCommitStartedAtRef.current),
            panel: resizeCommitPanelRef.current
        })
    }, [inspectorWidth])

    const applyPanelWidthsToDom = useCallback((nextSidebarWidth: number, nextInspectorWidth: number) => {
        if (sidebarShellRef.current) {
            const cssWidth = `${nextSidebarWidth}px`
            sidebarShellRef.current.style.width = cssWidth
            sidebarShellRef.current.style.flexBasis = cssWidth
            sidebarShellRef.current.style.setProperty('--sidebar-width', cssWidth)
        }
        if (inspectorShellRef.current) {
            const cssWidth = `${nextInspectorWidth}px`
            inspectorShellRef.current.style.width = cssWidth
            inspectorShellRef.current.style.flexBasis = cssWidth
            inspectorShellRef.current.style.setProperty('--right-sidebar-width', cssWidth)
        }
    }, [])

    const showResizeGuide = useCallback((clientX: number) => {
        if (!resizeGuideRef.current) return
        resizeGuideRef.current.style.opacity = '1'
        resizeGuideRef.current.style.transform = `translateX(${Math.round(clientX)}px)`
    }, [])

    const hideResizeGuide = useCallback(() => {
        if (!resizeGuideRef.current) return
        resizeGuideRef.current.style.opacity = '0'
    }, [])

    useEffect(() => {
        applyPanelWidthsToDom(sidebarWidth, inspectorWidth)
    }, [applyPanelWidthsToDom, inspectorWidth, sidebarWidth])

    useEffect(() => {
        const startedAt = performance.now()
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
        console.log('[PanelResize] sidebar width persisted', {
            width: sidebarWidth,
            elapsedMs: Math.round(performance.now() - startedAt),
            sinceCommitMs: resizeCommitStartedAtRef.current == null
                ? null
                : Math.round(performance.now() - resizeCommitStartedAtRef.current)
        })
    }, [sidebarWidth])

    useEffect(() => {
        const startedAt = performance.now()
        localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth))
        console.log('[PanelResize] inspector width persisted', {
            width: inspectorWidth,
            elapsedMs: Math.round(performance.now() - startedAt),
            sinceCommitMs: resizeCommitStartedAtRef.current == null
                ? null
                : Math.round(performance.now() - resizeCommitStartedAtRef.current)
        })
    }, [inspectorWidth])

    useEffect(() => {
        const handleWindowResize = () => {
            const reconciled = reconcilePanelWidths(sidebarWidthRef.current, inspectorWidthRef.current)
            if (reconciled.sidebarWidth !== sidebarWidthRef.current) {
                setSidebarWidth(reconciled.sidebarWidth)
            }
            if (reconciled.inspectorWidth !== inspectorWidthRef.current) {
                setInspectorWidth(reconciled.inspectorWidth)
            }
        }

        handleWindowResize()
        window.addEventListener('resize', handleWindowResize)
        return () => {
            window.removeEventListener('resize', handleWindowResize)
        }
    }, [reconcilePanelWidths])

    useEffect(() => {
        const reconciled = reconcilePanelWidths(sidebarWidthRef.current, inspectorWidthRef.current)
        if (reconciled.sidebarWidth !== sidebarWidthRef.current) {
            setSidebarWidth(reconciled.sidebarWidth)
        }
        if (reconciled.inspectorWidth !== inspectorWidthRef.current) {
            setInspectorWidth(reconciled.inspectorWidth)
        }
    }, [reconcilePanelWidths])

    useEffect(() => {
        if (!activeResizePanel) return

        const handlePointerMove = (event: MouseEvent) => {
            if (activeResizePanel === 'sidebar') {
                const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current)
                const reconciled = reconcilePanelWidths(nextWidth, inspectorWidthRef.current)
                sidebarWidthRef.current = reconciled.sidebarWidth
                inspectorWidthRef.current = reconciled.inspectorWidth
                showResizeGuide(reconciled.sidebarWidth + PANEL_RESIZE_HANDLE_WIDTH / 2)
                return
            }

            const nextWidth = resizeStartWidthRef.current + (resizeStartXRef.current - event.clientX)
            const reconciled = reconcilePanelWidths(sidebarWidthRef.current, nextWidth)
            sidebarWidthRef.current = reconciled.sidebarWidth
            inspectorWidthRef.current = reconciled.inspectorWidth
            showResizeGuide(window.innerWidth - reconciled.inspectorWidth - PANEL_RESIZE_HANDLE_WIDTH / 2)
        }

        const handlePointerUp = () => {
            const commitStartedAt = performance.now()
            resizeCommitStartedAtRef.current = commitStartedAt
            resizeCommitPanelRef.current = activeResizePanel
            resizeCommitTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId))
            resizeCommitTimerRefs.current = [250, 1000, 2000, 4000, 8000].map((delayMs) => (
                window.setTimeout(() => {
                    console.log('[PanelResize] post-commit checkpoint', {
                        delayMs,
                        elapsedMs: Math.round(performance.now() - commitStartedAt),
                        panel: activeResizePanel,
                        sidebarWidth: sidebarWidthRef.current,
                        inspectorWidth: inspectorWidthRef.current,
                        activeFilterType: filterOptions.filterType,
                        mediaCount: mediaFiles.length,
                        showSidebar: viewSettings.showSidebar,
                        showInspector: viewSettings.showInspector
                    })
                }, delayMs)
            ))

            console.log('[PanelResize] commit start', {
                panel: activeResizePanel,
                sidebarWidth: sidebarWidthRef.current,
                inspectorWidth: inspectorWidthRef.current,
                activeFilterType: filterOptions.filterType,
                mediaCount: mediaFiles.length,
                showSidebar: viewSettings.showSidebar,
                showInspector: viewSettings.showInspector
            })

            const stateApplyStartedAt = performance.now()
            setSidebarWidth(sidebarWidthRef.current)
            setInspectorWidth(inspectorWidthRef.current)
            console.log('[PanelResize] state setters queued', {
                panel: activeResizePanel,
                elapsedMs: Math.round(performance.now() - stateApplyStartedAt),
                sidebarWidth: sidebarWidthRef.current,
                inspectorWidth: inspectorWidthRef.current
            })
            setActiveResizePanel(null)
            document.body.classList.remove('panel-resize-active')
            hideResizeGuide()
        }

        window.addEventListener('mousemove', handlePointerMove)
        window.addEventListener('mouseup', handlePointerUp)
        window.addEventListener('mouseleave', handlePointerUp)
        document.body.classList.add('panel-resize-active')

        return () => {
            window.removeEventListener('mousemove', handlePointerMove)
            window.removeEventListener('mouseup', handlePointerUp)
            window.removeEventListener('mouseleave', handlePointerUp)
            document.body.classList.remove('panel-resize-active')
            hideResizeGuide()
        }
    }, [activeResizePanel, filterOptions.filterType, hideResizeGuide, mediaFiles.length, reconcilePanelWidths, showResizeGuide, viewSettings.showInspector, viewSettings.showSidebar])

    const startPanelResize = useCallback((panel: 'sidebar' | 'inspector', event: ReactMouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        resizeStartXRef.current = event.clientX
        resizeStartWidthRef.current = panel === 'sidebar' ? sidebarWidthRef.current : inspectorWidthRef.current
        setActiveResizePanel(panel)
        if (panel === 'sidebar') {
            showResizeGuide(sidebarWidthRef.current + PANEL_RESIZE_HANDLE_WIDTH / 2)
        } else {
            showResizeGuide(window.innerWidth - inspectorWidthRef.current - PANEL_RESIZE_HANDLE_WIDTH / 2)
        }
    }, [showResizeGuide])

    const getSearchScopeKey = useCallback((options: Pick<FilterOptions, 'filterType' | 'selectedFolders'>) => {
        const selectedFolders = Array.isArray(options.selectedFolders) ? options.selectedFolders : []
        if (selectedFolders.length > 0) {
            return `folder:${selectedFolders.map(Number).filter(Number.isFinite).sort((a, b) => a - b).join(',')}`
        }
        return `type:${String(options.filterType || 'all')}`
    }, [])

    const searchQueryByScopeRef = useRef<Record<string, string>>({})
    const updateFilterOptions = useCallback((nextValue: FilterOptions | ((prev: FilterOptions) => FilterOptions)) => {
        setFilterOptions(prev => {
            const next = typeof nextValue === 'function'
                ? nextValue(prev)
                : nextValue

            const prevKey = getSearchScopeKey(prev)
            const nextKey = getSearchScopeKey(next)
            searchQueryByScopeRef.current[prevKey] = String(prev.searchQuery || '')

            if (prevKey !== nextKey) {
                return {
                    ...next,
                    searchQuery: searchQueryByScopeRef.current[nextKey] ?? ''
                }
            }

            searchQueryByScopeRef.current[nextKey] = String(next.searchQuery || '')
            return next
        })
    }, [getSearchScopeKey, setFilterOptions])

    // テーマシステムの初期化
    const { updateClientConfig, clientConfig, reloadSettings } = useSettings()
    // useThemeは内部でサイドエフェクトとしてCSS変数を適用する
    // clientConfigがロードされるまではデフォルトテーマ（初期状態）が維持される
    useTheme(clientConfig || {} as any, updateClientConfig)
    useEffect(() => {
        const lang = clientConfig?.language === 'en' ? 'en' : 'ja'
        document.documentElement.lang = lang
        document.documentElement.setAttribute('data-language', lang)
    }, [clientConfig?.language])
    const uiLanguage: AppLanguage = clientConfig?.language === 'en' ? 'en' : 'ja'
    const tr = useCallback((ja: string, en: string) => (uiLanguage === 'en' ? en : ja), [uiLanguage])
    const dragDropImportOptions = useMemo(
        () => ({
            deleteSource: Boolean(clientConfig?.dragDropImportMoveSource),
            importSource: 'drag-drop',
        }),
        [clientConfig?.dragDropImportMoveSource],
    )
    useEffect(() => {
        const suppressContextMenu = (e: MouseEvent) => {
            e.preventDefault()
        }
        document.addEventListener('contextmenu', suppressContextMenu)
        return () => {
            document.removeEventListener('contextmenu', suppressContextMenu)
        }
    }, [])

    // サイドバーのアイテム数計算
    const sidebarCounts = useMemo(() => {
        const counts: { [key: string]: number } = {}
        if (!allMediaFiles) return counts

        let activeCount = 0
        let trashCount = 0
        let uncategorizedCount = 0
        let untaggedCount = 0

        const folderCounts = new Map<number, number>()
        for (const f of folders) folderCounts.set(f.id, 0)

        for (const media of allMediaFiles) {
            if (media.is_deleted) {
                trashCount += 1
                continue
            }

            activeCount += 1
            if (!media.folders || media.folders.length === 0) uncategorizedCount += 1
            if (!media.tags || media.tags.length === 0) untaggedCount += 1

            for (const mf of media.folders || []) {
                if (!folderCounts.has(mf.id)) continue
                folderCounts.set(mf.id, (folderCounts.get(mf.id) || 0) + 1)
            }
        }

        counts['all'] = activeCount
        counts['trash'] = trashCount
        counts['uncategorized'] = uncategorizedCount
        counts['untagged'] = untaggedCount
        counts['tags'] = tags.length
        for (const f of folders) {
            counts[`folder-${f.id}`] = folderCounts.get(f.id) || 0
        }

        return counts
    }, [allMediaFiles, folders, tags])

    const { addNotification, removeNotification, updateProgress } = useNotification()
    const prefetchedRandomThumbsRef = useRef<Set<string>>(new Set())
    const assetThumbWarmupDoneRef = useRef(false)


    // Socket.io 接続 (リモートライブラリ選択時のみ)
    const socketAuth = useMemo(() => {
        if (!activeRemoteLibrary) {
            return { userToken: '', accessToken: '' }
        }
        return getAuthQuery(activeRemoteLibrary.token, myUserToken)
    }, [activeRemoteLibrary, myUserToken])

    const { isConnected: isSocketConnected, subscribe } = useSocket({
        enabled: !!activeRemoteLibrary,
        url: activeRemoteLibrary?.url,
        userToken: socketAuth.userToken,
        accessToken: socketAuth.accessToken
    })

    // Perf marker for random tab switch diagnostics.
    useEffect(() => {
        if (filterOptions.filterType !== 'random') {
            delete (window as any).__obscuraRandomPerf
            return
        }
        const start = performance.now()
        ; (window as any).__obscuraRandomPerf = {
            start,
            listReadyLogged: false,
            firstThumbLogged: false,
            prefetchStarted: false,
            firstThumbRequestLogged: false,
        }
        console.log(`[Perf][Random] switch start t=${start.toFixed(1)}ms`)
    }, [filterOptions.filterType])

    // Warm up local asset thumbnail pipeline once to reduce first random-tab thumbnail latency.
    useEffect(() => {
        if (assetThumbWarmupDoneRef.current) return
        if (!allMediaFiles || allMediaFiles.length === 0) return

        const candidate = allMediaFiles.find((m) => {
            const p = String(m?.thumbnail_path || '')
            return p && !/^https?:\/\//i.test(p)
        })
        if (!candidate?.thumbnail_path) return

        const url = toMediaUrl(candidate.thumbnail_path)
        if (!url.includes('asset.localhost')) return

        assetThumbWarmupDoneRef.current = true
        const start = performance.now()
        const img = new Image()
        const done = (status: 'ok' | 'err') => {
            const elapsed = performance.now() - start
            console.log(`[Perf][Thumb] asset warmup ${status} in ${elapsed.toFixed(1)}ms`)
        }
        img.onload = () => done('ok')
        img.onerror = () => done('err')
        img.src = url
    }, [allMediaFiles])

    useEffect(() => {
        if (filterOptions.filterType !== 'random') return
        if (!mediaFiles || mediaFiles.length === 0) return
        const perf = (window as any).__obscuraRandomPerf
        if (!perf || perf.listReadyLogged) return
        perf.listReadyLogged = true
        const elapsed = performance.now() - Number(perf.start || 0)
        console.log(`[Perf][Random] list ready in ${elapsed.toFixed(1)}ms (items=${mediaFiles.length})`)
    }, [filterOptions.filterType, mediaFiles.length])

    // Random tab thumbnail prefetch (delayed sequential) to smooth UI load.
    useEffect(() => {
        if (!ENABLE_RANDOM_THUMB_PREFETCH) return
        if (filterOptions.filterType !== 'random') return
        if (!mediaFiles || mediaFiles.length === 0) return

        const candidates = mediaFiles
            .slice(0, 140)
            .map(m => m.thumbnail_path)
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

        if (candidates.length === 0) return
        const perf = (window as any).__obscuraRandomPerf
        if (perf?.prefetchStarted) return
        if (perf) perf.prefetchStarted = true
        console.log(`[Perf][Random] prefetch queue start (count=${candidates.length})`)

        let cancelled = false
        const DELAY_MS = 90
        let loadedCount = 0

        const loadOne = (rawPath: string) => {
            const url = toMediaUrl(rawPath)
            if (prefetchedRandomThumbsRef.current.has(url)) return
            prefetchedRandomThumbsRef.current.add(url)

            void new Promise<void>((resolve) => {
                const img = new Image()
                let settled = false
                const done = () => {
                    if (settled) return
                    settled = true
                    resolve()
                }
                img.onload = done
                img.onerror = done
                img.src = url
                // Do not block queue by a slow first request.
                setTimeout(done, 1200)
            })
                .finally(() => {
                    loadedCount += 1
                    if (loadedCount === 1 || loadedCount % 20 === 0) {
                        const perfNow = (window as any).__obscuraRandomPerf
                        const elapsed = perfNow ? performance.now() - Number(perfNow.start || 0) : 0
                        console.log(`[Perf][Random] prefetched ${loadedCount}/${candidates.length} (${elapsed.toFixed(1)}ms)`)
                    }
                })
        }

        const runSequential = async () => {
            for (let i = 0; i < candidates.length; i += 1) {
                if (cancelled) return
                loadOne(candidates[i])
                if (cancelled) return
                await new Promise<void>((resolve) => {
                    setTimeout(() => resolve(), DELAY_MS)
                })
            }
        }

        void runSequential()
        return () => { cancelled = true }
    }, [filterOptions.filterType, mediaFiles])


    // リモート接続時のみ初期同期を実行
    useEffect(() => {
        if (!activeRemoteLibrary) return

        const loadAll = async () => {
            try {
                if (!myUserToken) {
                    console.log('[App] Waiting for user token before connecting to remote library...')
                    return
                }
                const { waitForRemoteConnection } = await import('./utils/remoteHealth')
                const connectedUrl = await waitForRemoteConnection(activeRemoteLibrary, myUserToken)

                if (!connectedUrl) {
                    alert(tr(`Failed to connect to remote library "${activeRemoteLibrary.name}".\nThe server may be down or the network may be unavailable.`, `Failed to connect to remote library "${activeRemoteLibrary.name}".\nThe server may be down or the network may be unavailable.`))
                    return
                }

                const originalUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                const newUrl = connectedUrl.replace(/\/$/, '')
                if (originalUrl !== newUrl) {
                    console.log(`[App] Protocol switch detected: ${originalUrl} -> ${newUrl} `)
                    const updatedLib = { ...activeRemoteLibrary, url: newUrl }
                    await switchToRemoteLibrary(updatedLib)
                }

                await refreshLibrary()
            } catch (e: any) {
                alert(tr(`Failed to connect to remote library "${activeRemoteLibrary.name}".\nThe server may be down or the network may be unavailable.`, `Failed to connect to remote library "${activeRemoteLibrary.name}".\nThe server may be down or the network may be unavailable.`))
            }
        }
        loadAll()
    }, [refreshLibrary, activeRemoteLibrary, myUserToken, switchToRemoteLibrary])

    // Socketイベントハンドリング
    useEffect(() => {
        if (!isSocketConnected) return

        const handleUpdate = (data: any) => {
            console.log('[Socket] Received update:', data)
            refreshLibrary()
        }

        const unsubDetails = [
            subscribe('media:created', handleUpdate),
            subscribe('media:updated', handleUpdate),
            subscribe('media:deleted', handleUpdate)
        ]

        return () => {
            unsubDetails.forEach(unsub => unsub())
        }
    }, [isSocketConnected, subscribe, refreshLibrary])

    // アップデート通知
    useEffect(() => {
        const removeListener = api.onUpdateStatus((data) => {
            if (data.status === 'update-downloaded') {
                addNotification({
                    type: 'success',
                    title: i18nT(uiLanguage, 'app.updateDownloadedTitle'),
                    message: i18nT(uiLanguage, 'app.updateDownloadedMessage'),
                    duration: 0
                })
            }
            if (data.status === 'update-available') {
                addNotification({
                    type: 'info',
                    title: i18nT(uiLanguage, 'app.updateAvailableTitle'),
                    message: i18nT(uiLanguage, 'app.updateAvailableMessage', { version: data.info?.version ?? '' }),
                    duration: 10000
                })
            }
        })

        // 汎用通知プログレスリスナー
        const removeProgressListener = api.on('notification-progress', (_e: any, data: any) => {
            // _e is event (if from electron), data is the payload.
            // If api.on abstracts this, we need to be careful.
            // ElectronAdapter.on uses api.on which returns unsubscribe.
            // In ElectronAdapter: this.api.on(channel, func)
            // Default electronAPI.on passes (event, ...args).
            // So existing code: (data) => ... seems wrong if it receives event first?
            // Let's assume api.on behaves same as api.on
            if (data && data.id && typeof data.progress === 'number') {
                updateProgress(data.id, data.progress)
            }
        })

        return () => {
            if (removeListener) removeListener()
            if (removeProgressListener) removeProgressListener()
        }
    }, [addNotification, updateProgress])


    // Shared Users State
    const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([])

    // Poll shared users
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                let users: SharedUser[] = []
                let baseUrl = ''

                if (activeRemoteLibrary) {
                    baseUrl = activeRemoteLibrary.url
                    try {
                        const { userToken, accessToken } = getAuthQuery(activeRemoteLibrary.token, myUserToken)

                        users = await api.getRemoteSharedUsers({
                            url: activeRemoteLibrary.url,
                            userToken: userToken || '',
                            accessToken: accessToken || ''
                        })
                    } catch (e) {
                        console.error('Failed to fetch remote users:', e)
                    }
                } else {
                    users = await api.getSharedUsers()
                    try {
                        const serverConfig = await api.getServerConfig()
                        if (serverConfig && serverConfig.port) {
                            baseUrl = `http://localhost:${serverConfig.port}`
                        }
                    } catch (e) {
                        // サーバー設定取得失敗（起動していない等）時は補完しない
                    }
                }

                const now = new Date()
                const ONLINE_THRESHOLD_MS = 30000 // 30 seconds

                const processUserData = (userList: SharedUser[]) => {
                    return userList.map(u => {
                        let isOnline = false
                        if (u.lastAccessAt) {
                            const lastAccess = new Date(u.lastAccessAt)
                            isOnline = (now.getTime() - lastAccess.getTime()) < ONLINE_THRESHOLD_MS
                        }

                        let updatedUser = { ...u, isOnline }

                        if (baseUrl && u.iconUrl && u.iconUrl.startsWith('/')) {
                            const cleanBaseUrl = baseUrl.replace(/\/$/, '')
                            updatedUser.iconUrl = `${cleanBaseUrl}${u.iconUrl}`
                        }

                        return updatedUser
                    })
                }

                setSharedUsers(processUserData(users))
            } catch (e) {
                // console.error("Failed to fetch shared users:", e) // Suppress error if not supported
            }
        }

        fetchUsers()
        const interval = setInterval(fetchUsers, 5000)
        return () => clearInterval(interval)
    }, [activeRemoteLibrary, myUserToken])


    // 選択されたメディアのIDリスト
    const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([])
    // 最後に選択されたメディアID (Shift選択用)
    const [lastSelectedId, setLastSelectedId] = useState<number | null>(null)
    const [renamingMediaId, setRenamingMediaId] = useState<number | null>(null)

    // 再生中のメディア(プレイヤー用)
    const [playingMedia, setPlayingMedia] = useState<MediaFile | null>(null)

    // Discord RPC: Idle State Handling
    useEffect(() => {
        if (!playingMedia) {
            const libName = activeRemoteLibrary
                ? activeRemoteLibrary.name
                : (activeLibrary ? activeLibrary.name : 'No Library')

            // ライブラリが開かれていない場合はクリア、開かれていればライブラリ名を表示
            if (!activeLibrary && !activeRemoteLibrary) {
                api.clearDiscordActivity().catch((_) => { })
            } else {
                api.updateDiscordActivity({
                    details: 'Browsing Library',
                    state: libName,
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura'
                }).catch(err => console.error('Failed to update idle activity:', err))
            }
        }
    }, [playingMedia, activeLibrary, activeRemoteLibrary])

    // 設定
    const [settings, setSettings] = useState<AppSettings>(() => {
        const saved = localStorage.getItem('app_settings')
        if (saved) {
            const parsed = JSON.parse(saved)
            return mergeAppSettings(parsed)
        }
        return DEFAULT_SETTINGS
    })

    // プラグイン読み込みの同期
    useEffect(() => {
        if (settings) {
            loadPluginScripts(settings)
        }
    }, [settings])

    // ライブラリ更新状態
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 })

    // ライブラリ一覧
    const [availableLibraries, setAvailableLibraries] = useState<{ name: string, path: string }[]>([])

    useEffect(() => {
        setAvailableLibraries(Array.isArray(libraries) ? libraries : [])
    }, [libraries])

    useEffect(() => {
        if (!api.onRefreshProgress) return
        return api.onRefreshProgress((current: number, total: number) => {
            setRefreshProgress({ current, total })
        })
    }, [])

    const handleRefreshLibrary = async () => {
        setIsRefreshing(true)
        setRefreshProgress({ current: 0, total: 0 })
        try {
            await api.refreshLibrary()
            await refreshLibrary()
        } catch (error) {
            console.error('Refresh failed:', error)
            alert(tr('Failed to refresh the library', 'Failed to refresh the library'))
        } finally {
            setIsRefreshing(false)
        }
    }
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
        try {
            const raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
            if (!raw) return []
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) return []
            return parsed
                .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string')
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
                    options: normalizeFilterOptions(item.options)
                }))
        } catch {
            return []
        }
    })
    const [showLibraryModal, setShowLibraryModal] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [releaseNotesModal, setReleaseNotesModal] = useState<ReleaseNotesModalState | null>(null)
    const [externalDropFolderId, setExternalDropFolderId] = useState<number | null>(null)
    const isInternalDrag = useRef(false)
    const internalDraggedMediaIdsRef = useRef<number[]>([])
    const currentExternalDropZoneRef = useRef<{ type: 'none' | 'library' | 'folder'; folderId?: number }>({ type: 'none' })
    const pendingNativeDropZoneRef = useRef<{ type: 'none' | 'library' | 'folder'; folderId?: number } | null>(null)
    const highlightedExternalDropFolderIdRef = useRef<number | null>(null)
    const dragCounter = useRef(0)
    const dragOverlayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastDragActivityAt = useRef(0)
    const [gridSize, setGridSize] = useState<number>(settings.gridSize)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(settings.viewMode)
    const scrollTopByScopeRef = useRef<Record<string, number>>({})
    const currentLibraryScrollTopRef = useRef(0)
    const [libraryScrollRestoreTop, setLibraryScrollRestoreTop] = useState(0)
    const [libraryScrollRestoreKey, setLibraryScrollRestoreKey] = useState('initial')

    useEffect(() => {
        localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(filterPresets))
    }, [filterPresets])

    const handleApplyFilterPreset = useCallback((presetId: string) => {
        const preset = filterPresets.find((item) => item.id === presetId)
        if (!preset) return
        updateFilterOptions(normalizeFilterOptions(preset.options))
    }, [filterPresets, updateFilterOptions])

    const handleSaveFilterPreset = useCallback((name: string) => {
        const trimmedName = name.trim()
        if (!trimmedName) return null

        const preset: FilterPreset = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: trimmedName,
            options: normalizeFilterOptions(filterOptions),
            createdAt: new Date().toISOString()
        }

        setFilterPresets((prev) => {
            const existing = prev.find((item) => item.name === trimmedName)
            if (existing) {
                return prev.map((item) =>
                    item.id === existing.id
                        ? { ...item, options: preset.options, createdAt: preset.createdAt }
                        : item
                )
            }
            return [...prev, preset]
        })

        const existing = filterPresets.find((item) => item.name === trimmedName)
        return existing?.id || preset.id
    }, [filterOptions, filterPresets])

    const handleDeleteFilterPreset = useCallback((presetId: string) => {
        setFilterPresets((prev) => prev.filter((item) => item.id !== presetId))
    }, [])

    const handleRenameFilterPreset = useCallback((presetId: string, name: string) => {
        const trimmedName = name.trim()
        if (!trimmedName) return
        setFilterPresets((prev) => prev.map((item) => (
            item.id === presetId
                ? { ...item, name: trimmedName }
                : item
        )))
    }, [])

    const handleResetFilters = useCallback(() => {
        updateFilterOptions({
            ...createDefaultFilterOptions(),
            sortOrder: filterOptions.sortOrder,
            sortDirection: filterOptions.sortDirection
        })
    }, [filterOptions.sortDirection, filterOptions.sortOrder, updateFilterOptions])

    // イベントリスナー内で最新の状態を参照するための Ref
    const isDraggingRef = useRef(isDragging)
    const hasActiveLibraryRef = useRef(hasActiveLibrary)
    const activeLibraryRef = useRef(activeLibrary)
    const activeRemoteLibraryRef = useRef(activeRemoteLibrary)
    const allMediaFilesRef = useRef(allMediaFiles)

    const beginInternalMediaDrag = useCallback((mediaIds?: number[]) => {
        internalDraggedMediaIdsRef.current = Array.isArray(mediaIds)
            ? Array.from(new Set(mediaIds.map((id) => Number(id)).filter(Number.isFinite)))
            : []
        isInternalDrag.current = true
    }, [])

    const beginInternalUiDrag = useCallback(() => {
        internalDraggedMediaIdsRef.current = []
        isInternalDrag.current = true
    }, [])

    const endInternalMediaDrag = useCallback(() => {
        internalDraggedMediaIdsRef.current = []
        isInternalDrag.current = false
    }, [])

    const syncExternalDropFolderHighlight = useCallback((folderId: number | null) => {
        const normalizedFolderId = Number.isFinite(folderId as number) ? Number(folderId) : null
        if (highlightedExternalDropFolderIdRef.current === normalizedFolderId) {
            return
        }

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

        highlightedExternalDropFolderIdRef.current = normalizedFolderId

        if (normalizedFolderId === null) return

        document
            .querySelectorAll(`.sidebar-nav-item[data-folder-id="${normalizedFolderId}"]`)
            .forEach((element) => {
                const target = element as HTMLElement
                target.classList.add('external-drop-target-live')
                target.style.setProperty('background', 'color-mix(in srgb, var(--primary) 18%, var(--bg-hover))', 'important')
                target.style.setProperty('border-color', 'color-mix(in srgb, var(--primary) 92%, white 8%)', 'important')
                target.style.setProperty('box-shadow', 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 36%, transparent), var(--shadow-md)', 'important')
                target.style.setProperty('transform', 'translateX(4px)', 'important')
                target.style.setProperty('color', 'var(--text-main)', 'important')
            })
    }, [])

    const clearExternalDragState = useCallback(() => {
        currentExternalDropZoneRef.current = { type: 'none' }
        pendingNativeDropZoneRef.current = null
        syncExternalDropFolderHighlight(null)
        setExternalDropFolderId(null)
        setIsDragging(false)
        document.body.classList.remove('dragging-file')
    }, [syncExternalDropFolderHighlight])

    const applyExternalDropZone = useCallback((zone: { type: 'none' | 'library' | 'folder'; folderId?: number }) => {
        currentExternalDropZoneRef.current = zone
        pendingNativeDropZoneRef.current = zone.type === 'none' ? pendingNativeDropZoneRef.current : zone

        if (zone.type === 'folder' && typeof zone.folderId === 'number') {
            syncExternalDropFolderHighlight(zone.folderId)
            setExternalDropFolderId(zone.folderId)
            setIsDragging(false)
            document.body.classList.remove('dragging-file')
            return
        }

        syncExternalDropFolderHighlight(null)
        setExternalDropFolderId(null)

        if (zone.type === 'library') {
            setIsDragging(true)
            document.body.classList.add('dragging-file')
            return
        }

        setIsDragging(false)
        document.body.classList.remove('dragging-file')
    }, [syncExternalDropFolderHighlight])

    const resolveExternalDropZone = useCallback((clientX: number, clientY: number) => {
        const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
        if (!target) return { type: 'none' as const }

        const folderElement = target.closest('[data-folder-id]') as HTMLElement | null
        if (folderElement) {
            const folderId = Number(folderElement.dataset.folderId)
            if (Number.isFinite(folderId)) {
                return { type: 'folder' as const, folderId }
            }
        }

        if (target.closest('[data-library-drop-zone=\"true\"]')) {
            return { type: 'library' as const }
        }

        return { type: 'none' as const }
    }, [])

    const resolveExternalDropZoneFromNativePosition = useCallback((x: number, y: number) => {
        const candidates: Array<[number, number]> = [
            [x, y],
            [x - window.screenX, y - window.screenY],
            [x - window.screenLeft, y - window.screenTop],
            [x - (window.outerWidth - window.innerWidth), y - (window.outerHeight - window.innerHeight)],
        ]

        for (const [candidateX, candidateY] of candidates) {
            if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) continue
            const zone = resolveExternalDropZone(candidateX, candidateY)
            if (zone.type !== 'none') {
                return zone
            }
        }

        return { type: 'none' as const }
    }, [resolveExternalDropZone])

    // StateとRefの同期
    useEffect(() => {
        isDraggingRef.current = isDragging
    }, [isDragging])

    useEffect(() => {
        hasActiveLibraryRef.current = hasActiveLibrary
    }, [hasActiveLibrary])

    useEffect(() => {
        activeLibraryRef.current = activeLibrary
    }, [activeLibrary])

    useEffect(() => {
        activeRemoteLibraryRef.current = activeRemoteLibrary
    }, [activeRemoteLibrary])

    useEffect(() => {
        allMediaFilesRef.current = allMediaFiles
    }, [allMediaFiles])

    // ドラッグ＆ドロップ状態のグローバル管理
    useEffect(() => {
        const clearDragOverlayHideTimer = () => {
            if (dragOverlayHideTimer.current) {
                clearTimeout(dragOverlayHideTimer.current)
                dragOverlayHideTimer.current = null
            }
        }

        const scheduleDragOverlayHide = (delayMs = 250) => {
            clearDragOverlayHideTimer()
            dragOverlayHideTimer.current = setTimeout(() => {
                dragCounter.current = 0
                clearExternalDragState()
                endInternalMediaDrag()
            }, delayMs)
        }

        const markDragActivity = () => {
            lastDragActivityAt.current = Date.now()
        }

        const handleGlobalDragEnter = (e: DragEvent) => {
            e.preventDefault()
            clearDragOverlayHideTimer()
            markDragActivity()
            dragCounter.current++
            console.log('[Global D&D] DragEnter:', dragCounter.current, 'isInternal:', isInternalDrag.current)

            if (dragCounter.current === 1) {
                // 内部ドラッグ中はオーバーレイを表示しない
                if (isInternalDrag.current) {
                    console.log('[Global D&D] Internal drag detected, suppressing overlay')
                    return
                }

                const hasFiles = Array.from(e.dataTransfer?.types || []).some(t => t.toLowerCase() === 'files')
                if ((hasActiveLibraryRef.current || activeRemoteLibraryRef.current) && hasFiles) {
                    applyExternalDropZone(resolveExternalDropZone(e.clientX, e.clientY))
                }
            }
        }

        const handleGlobalDragOver = (e: DragEvent) => {
            clearDragOverlayHideTimer()
            markDragActivity()
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'none'
            }

            // 内部ドラッグ中なら何もしない
            if (isInternalDrag.current) return

            const zone = resolveExternalDropZone(e.clientX, e.clientY)
            applyExternalDropZone(zone)
            if (zone.type !== 'none') {
                e.preventDefault()
            }
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = zone.type === 'none' ? 'none' : 'copy'
            }
        }

        const handleGlobalDragLeave = (e: DragEvent) => {
            e.preventDefault()
            markDragActivity()
            dragCounter.current--
            console.log('[Global D&D] DragLeave:', dragCounter.current)

            if (dragCounter.current <= 0) {
                dragCounter.current = 0
                scheduleDragOverlayHide(80)
            }
        }

        const handleGlobalDrop = async (e: DragEvent) => {
            // dropイベントはバブリングで受ける (Sidebar等のstopPropagationを優先)
            console.log('[Global D&D] Global Drop detected, isInternal:', isInternalDrag.current)

            const wasInternal = isInternalDrag.current

            // 状態リセット
            dragCounter.current = 0
            markDragActivity()
            clearExternalDragState()
            clearDragOverlayHideTimer()
            // Drop後に確実にリセット
            endInternalMediaDrag()

            if (wasInternal) {
                console.log('[Global D&D] Internal drop caught at global level, ignore file import')
                return
            }

            e.preventDefault()
            return

            if (!hasActiveLibraryRef.current && !activeRemoteLibraryRef.current) {
                return
            }

            const files = Array.from(e.dataTransfer?.files || [])
            const filePaths = files
                .map(file => (file as any).path)
                .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            console.log('[Global D&D] Global Dropped paths:', filePaths)

            // ライブラリに既に存在するファイルを除外（内部ドラッグの誤検出対策）
            // パスセパレーターの正規化（バックスラッシュをスラッシュに変換して統一）
            const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase()
            const existingPaths = new Set(allMediaFilesRef.current.map(m => normalizePath(m.file_path)))

            console.log('[Global D&D] Existing paths sample:', Array.from(existingPaths).slice(0, 3))

            const newFilePaths = filePaths.filter(p => {
                const normalized = normalizePath(p)
                const exists = existingPaths.has(normalized)
                if (exists) {
                    console.log('[Global D&D] Filtered out existing file:', p)
                }
                return !exists
            })
            console.log('[Global D&D] New files to import:', newFilePaths.length, 'of', filePaths.length)

            if (newFilePaths.length > 0) {
                await handleSmartImport(newFilePaths)
            }
        }


        const handleGlobalDragEnd = () => {
            console.log('[Global D&D] Global DragEnd')
            dragCounter.current = 0
            markDragActivity()
            clearExternalDragState()
            clearDragOverlayHideTimer()
        }

        const handleMouseDown = () => {
            if (dragCounter.current !== 0 || isDraggingRef.current) {
                console.log('[Global D&D] Manual reset via mousedown')
                dragCounter.current = 0
                clearExternalDragState()
                endInternalMediaDrag()
                clearDragOverlayHideTimer()
            }
        }

        const handleFocusReset = () => {
            if (dragCounter.current !== 0 || isDraggingRef.current || isInternalDrag.current) {
                console.log('[Global] Focus recovered, resetting states (with delay)')
                // Drop処理が走る可能性を考慮して少し待つ
                setTimeout(() => {
                    // もしまだ内部ドラッグフラグが立っていたら、ドロップされずに復帰したとみなしてリセット
                    if (isInternalDrag.current) {
                        console.log('[Global] Resetting isInternalDrag after delay')
                        endInternalMediaDrag()
                    }
                    dragCounter.current = 0
                    clearExternalDragState()
                    clearDragOverlayHideTimer()
                }, 500)
            }
        }

        const handleWindowBlur = () => {
            markDragActivity()
            scheduleDragOverlayHide(0)
        }

        // 基本的に capture: true で preventDefault を確実に行う
        // ただし内部要素が handleDrop で stopPropagation() した場合にグローバル側で走らないよう、
        // drop だけは bubbling (capture: false) で登録する
        // バブリングフェーズで登録し、個別のコンポーネントでの stopPropagation を優先させる
        window.addEventListener('dragenter', handleGlobalDragEnter, { capture: false })
        window.addEventListener('dragover', handleGlobalDragOver, { capture: false })
        window.addEventListener('dragleave', handleGlobalDragLeave, { capture: false })
        window.addEventListener('drop', handleGlobalDrop, { capture: false })
        window.addEventListener('dragend', handleGlobalDragEnd, { capture: false })
        window.addEventListener('mousedown', handleMouseDown, { capture: false })
        window.addEventListener('focus', handleFocusReset)
        window.addEventListener('blur', handleWindowBlur)

        return () => {
            window.removeEventListener('dragenter', handleGlobalDragEnter, { capture: false })
            window.removeEventListener('dragover', handleGlobalDragOver, { capture: false })
            window.removeEventListener('dragleave', handleGlobalDragLeave, { capture: false })
            window.removeEventListener('drop', handleGlobalDrop, { capture: false })
            window.removeEventListener('dragend', handleGlobalDragEnd, { capture: false })
            window.removeEventListener('mousedown', handleMouseDown, { capture: false })
            window.removeEventListener('focus', handleFocusReset)
            window.removeEventListener('blur', handleWindowBlur)
            clearDragOverlayHideTimer()
        }
    }, [importMedia])

    useEffect(() => {
        if (!isDragging) return
        const timer = setInterval(() => {
            const idleMs = Date.now() - (lastDragActivityAt.current || 0)
            if (idleMs > 450) {
                dragCounter.current = 0
                clearExternalDragState()
                endInternalMediaDrag()
            }
        }, 120)
        return () => clearInterval(timer)
    }, [isDragging])

    useEffect(() => {
        const handleTriggerImport = (
            _: any,
            payloadOrPaths: string[] | { filePaths?: string[]; position?: { x?: number; y?: number } | null },
            options?: { deleteSource?: boolean; importSource?: string },
        ) => {
            const filePaths = Array.isArray(payloadOrPaths)
                ? payloadOrPaths
                : Array.isArray(payloadOrPaths?.filePaths)
                    ? payloadOrPaths.filePaths
                    : []
            const payloadPosition = Array.isArray(payloadOrPaths)
                ? null
                : payloadOrPaths?.position ?? null

            console.log('[App] Received trigger-import:', filePaths)

            const x = Number(payloadPosition?.x)
            const y = Number(payloadPosition?.y)
            if (Number.isFinite(x) && Number.isFinite(y)) {
                pendingNativeDropZoneRef.current = resolveExternalDropZoneFromNativePosition(x, y)
            }

            const currentDropZone = pendingNativeDropZoneRef.current ?? currentExternalDropZoneRef.current
            console.log(
                '[App] trigger-import drop zone summary:',
                JSON.stringify({
                    position: payloadPosition,
                    pendingType: pendingNativeDropZoneRef.current?.type ?? 'none',
                    pendingFolderId: pendingNativeDropZoneRef.current?.folderId ?? null,
                    currentType: currentDropZone.type,
                    currentFolderId: currentDropZone.folderId ?? null,
                    isInternalDrag: isInternalDrag.current,
                    internalDraggedMediaIds: internalDraggedMediaIdsRef.current,
                }),
            )

            // 内部ドラッグ中はインポートしない
            if (isInternalDrag.current) {
                if (currentDropZone.type === 'folder' && typeof currentDropZone.folderId === 'number') {
                    handleDropOnFolder(currentDropZone.folderId, null, internalDraggedMediaIdsRef.current).catch((e) => {
                        console.error('Failed to add dragged media to folder:', e)
                    })
                    clearExternalDragState()
                    return
                }
                console.log('[App] Internal drag detected in trigger-import, ignoring.')
                // フラグをリセット (ドロップは完了したとみなせるため)
                endInternalMediaDrag()
                clearExternalDragState()
                return
            }

            // Refを使用して最新の状態を確認
            const safeFilePaths = (Array.isArray(filePaths) ? filePaths : [])
                .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

            if ((hasActiveLibraryRef.current || activeRemoteLibraryRef.current) && safeFilePaths.length > 0) {
                if (currentDropZone.type === 'none') {
                    console.log('[App] Ignoring trigger-import outside allowed drop zones')
                    clearExternalDragState()
                    return
                }
                // ライブラリに既に存在するファイルを除外（重複防止の安全策）
                const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase()
                const existingPaths = new Set(
                    allMediaFilesRef.current.flatMap((m: any) => {
                        const currentPath = typeof m?.file_path === 'string' ? normalizePath(m.file_path) : ''
                        const sourcePath = typeof m?.import_source_path === 'string' ? normalizePath(m.import_source_path) : ''
                        return [currentPath, sourcePath].filter(Boolean)
                    }),
                )
                const newFilePaths = safeFilePaths.filter(p => {
                    const normalized = normalizePath(p)
                    return !existingPaths.has(normalized)
                })
                const skippedPaths = safeFilePaths.filter(p => !newFilePaths.includes(p))

                if (options?.deleteSource && skippedPaths.length > 0) {
                    void api.deleteFileSystemFiles(skippedPaths).catch((e) => {
                        console.warn('Failed to clean skipped auto-import files:', skippedPaths, e)
                    })
                }

                if (newFilePaths.length > 0) {
                    const targetFolder = currentDropZone.type === 'folder' && typeof currentDropZone.folderId === 'number'
                        ? folders.find((folder) => Number(folder.id) === Number(currentDropZone.folderId)) || null
                        : null
                    const effectiveImportOptions = { ...dragDropImportOptions, ...(options ?? {}) }
                    const importTask = currentDropZone.type === 'folder' && typeof currentDropZone.folderId === 'number'
                        ? handleSmartImport(newFilePaths, async (media) => {
                            await addFolderToMedia(media.id, currentDropZone.folderId!, targetFolder)
                        }, effectiveImportOptions)
                        : handleSmartImport(newFilePaths, undefined, effectiveImportOptions)
                    importTask.catch(e => console.error('Import failed via trigger:', e))
                } else {
                    console.log('[App] All files filtered out as existing in library')
                }
                clearExternalDragState()
            }
        }

        const handleAutoImportComplete = (_: any, files: string[]) => {
            const safeFiles = Array.isArray(files) ? files : []
            console.log('[App] Auto-import completed:', safeFiles.length)
            refreshLibrary()
            addNotification({
                type: 'success',
                title: tr('Auto import complete', 'Auto import complete'),
                message: tr(`Imported ${safeFiles.length} files`, `Imported ${safeFiles.length} files`),
                duration: 5000
            })
        }

        const handleAutoImportCollision = (_: any, data: { newMedia: MediaFile; existingMedia: MediaFile }) => {
            console.log('[App] Auto-import collision detected:', data)
            // 重複解決キューに追加し、コールバックは不要（自動でDBに残るか消えるか決まるため）
            // handleResolveDuplicateで action決定後に処理される
            // onResolve: null でもよいが、handleResolveDuplicate内で呼ばれるため空関数でも
            setDuplicateQueue(prev => [...prev, {
                ...data,
                onResolve: async (resolvedMedia) => {
                    console.log('[App] Auto-import duplicate resolved. Winner:', resolvedMedia.id)
                }
            }])
        }

        const handleAutoImportTrigger = async (_: any, payload: any) => {
            const safeFilePaths = Array.isArray(payload?.filePaths)
                ? payload.filePaths.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
                : []
            const targetLibraryPath = String(payload?.targetLibraryId || '').trim()

            if (safeFilePaths.length === 0) return

            const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase()
            const existingPaths = new Set(
                allMediaFilesRef.current.flatMap((m: any) => {
                    const currentPath = typeof m?.file_path === 'string' ? normalizePath(m.file_path) : ''
                    const sourcePath = typeof m?.import_source_path === 'string' ? normalizePath(m.import_source_path) : ''
                    return [currentPath, sourcePath].filter(Boolean)
                }),
            )
            const newFilePaths = safeFilePaths.filter((p: string) => !existingPaths.has(normalizePath(p)))
            const skippedPaths = safeFilePaths.filter((p: string) => !newFilePaths.includes(p))

            if (skippedPaths.length > 0) {
                void api.deleteFileSystemFiles(skippedPaths).catch((e) => {
                    console.warn('Failed to clean skipped auto-import files:', skippedPaths, e)
                })
            }

            if (newFilePaths.length === 0) {
                console.log('[App] Auto-import skipped because all files already exist')
                return
            }

            const previousLibraryPath = activeRemoteLibraryRef.current
                ? await api.getRemoteCachePath(activeRemoteLibraryRef.current.id)
                : activeLibraryRef.current?.path || null
            const importLibraryPath = targetLibraryPath || previousLibraryPath

            if (!importLibraryPath) {
                console.warn('[App] Auto-import skipped because no target library is available')
                return
            }

            try {
                if (previousLibraryPath !== importLibraryPath) {
                    await api.setActiveLibrary(importLibraryPath)
                }
                await (api.importMedia as any)(newFilePaths, { deleteSource: true, importSource: 'auto-import' })

                if (!activeRemoteLibraryRef.current && activeLibraryRef.current?.path === importLibraryPath) {
                    refreshLibrary()
                }

                addNotification({
                    type: 'success',
                    title: tr('Auto import complete', 'Auto import complete'),
                    message: tr(`Imported ${newFilePaths.length} files`, `Imported ${newFilePaths.length} files`),
                    duration: 4000
                })
            } catch (error) {
                console.error('Auto-import failed:', error)
                addNotification({
                    type: 'error',
                    title: tr('Auto import failed', 'Auto import failed'),
                    message: String(error),
                    duration: 5000
                })
            } finally {
                if (previousLibraryPath && previousLibraryPath !== importLibraryPath) {
                    await api.setActiveLibrary(previousLibraryPath).catch((e: any) => {
                        console.warn('Failed to restore previous library after auto-import:', e)
                    })
                }
            }
        }

        // イベントリスナー登録
        let unsubscribeTrigger: (() => void) | undefined
        let unsubscribeAutoImportTrigger: (() => void) | undefined
        let unsubscribeAutoImport: (() => void) | undefined
        let unsubscribeAutoImportCollision: (() => void) | undefined
        let unsubscribeExportProgress: (() => void) | undefined
        let unsubscribeNativeDragOver: (() => void) | undefined
        let unsubscribeNativeDragCancel: (() => void) | undefined
        let unsubscribeNativeDragDrop: (() => void) | undefined
        let unsubscribeMetadataRefreshDebug: (() => void) | undefined

        if (api && api.on) {
            unsubscribeTrigger = api.on('trigger-import', (_e: any, payload: any) => handleTriggerImport(null, payload))
            unsubscribeAutoImportTrigger = api.on('auto-import-trigger', (e: any, payload: any) => {
                void handleAutoImportTrigger(e, payload)
            })
            unsubscribeAutoImport = api.on('auto-import-complete', (_e: any, files: string[]) => handleAutoImportComplete(null, files))
            unsubscribeAutoImportCollision = api.on('auto-import-collision', (_e: any, data: any) => handleAutoImportCollision(null, data))
            unsubscribeExportProgress = api.on('export-progress', (_e: any, data: { id: string, progress: number }) => {
                // data passed as second arg usually
                if (data && data.id) {
                    updateProgress(data.id, data.progress)
                }
            })
            unsubscribeNativeDragOver = api.on('native-file-drag-over', (_e: any, payload: any) => {
                lastDragActivityAt.current = Date.now()
                const x = Number(payload?.position?.x)
                const y = Number(payload?.position?.y)
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    const zone = resolveExternalDropZoneFromNativePosition(x, y)
                    console.log(
                        '[App] native-file-drag-over summary:',
                        JSON.stringify({
                            position: payload?.position ?? null,
                            zoneType: zone.type,
                            zoneFolderId: zone.folderId ?? null,
                            isInternalDrag: isInternalDrag.current,
                        }),
                    )
                    if (isInternalDrag.current) {
                        applyExternalDropZone(zone.type === 'folder' ? zone : { type: 'none' })
                        return
                    }
                    applyExternalDropZone(zone)
                }
            })
            unsubscribeNativeDragCancel = api.on('native-file-drag-cancel', () => {
                lastDragActivityAt.current = Date.now()
                dragCounter.current = 0
                clearExternalDragState()
            })
            unsubscribeNativeDragDrop = api.on('native-file-drag-drop', (_e: any, payload: any) => {
                lastDragActivityAt.current = Date.now()
                dragCounter.current = 0
                const x = Number(payload?.position?.x)
                const y = Number(payload?.position?.y)
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    const zone = resolveExternalDropZoneFromNativePosition(x, y)
                    console.log(
                        '[App] native-file-drag-drop summary:',
                        JSON.stringify({
                            position: payload?.position ?? null,
                            zoneType: zone.type,
                            zoneFolderId: zone.folderId ?? null,
                            isInternalDrag: isInternalDrag.current,
                        }),
                    )
                    if (isInternalDrag.current) {
                        applyExternalDropZone(zone.type === 'folder' ? zone : { type: 'none' })
                    } else {
                        applyExternalDropZone(zone)
                    }
                }
            })
            unsubscribeMetadataRefreshDebug = api.on('metadata-refresh-debug', (_e: any, payload: any) => {
                console.log('[MetadataRefresh][Sidecar]', payload)
            })
        }

        // クリーンアップ
        return () => {
            if (unsubscribeTrigger) unsubscribeTrigger()
            if (unsubscribeAutoImportTrigger) unsubscribeAutoImportTrigger()
            if (unsubscribeAutoImport) unsubscribeAutoImport()
            if (unsubscribeAutoImportCollision) unsubscribeAutoImportCollision()
            if (unsubscribeExportProgress) unsubscribeExportProgress()
            if (unsubscribeNativeDragOver) unsubscribeNativeDragOver()
            if (unsubscribeNativeDragCancel) unsubscribeNativeDragCancel()
            if (unsubscribeNativeDragDrop) unsubscribeNativeDragDrop()
            if (unsubscribeMetadataRefreshDebug) unsubscribeMetadataRefreshDebug()
        }
    }, [importMedia, refreshLibrary, addNotification, endInternalMediaDrag, applyExternalDropZone, clearExternalDragState, resolveExternalDropZoneFromNativePosition, dragDropImportOptions])

    // 表示設定
    // viewSettings保存
    useEffect(() => {
        localStorage.setItem('view_settings', JSON.stringify(viewSettings))
    }, [viewSettings])

    const handleUpdateViewSettings = useCallback((updates: Partial<ViewSettings>) => {
        setViewSettings(prev => ({ ...prev, ...updates }))
    }, [])

    useEffect(() => {
        setSettings(prev => ({ ...prev, gridSize, viewMode }))
    }, [gridSize, viewMode])

    const currentScrollScopeKey = getSearchScopeKey({
        filterType: filterOptions.filterType,
        selectedFolders: filterOptions.selectedFolders,
    })
    const previousScrollScopeKeyRef = useRef(currentScrollScopeKey)

    const saveCurrentLibraryScrollPosition = useCallback(() => {
        scrollTopByScopeRef.current[currentScrollScopeKey] = currentLibraryScrollTopRef.current
    }, [currentScrollScopeKey])

    const restoreCurrentLibraryScrollPosition = useCallback(() => {
        const nextTop = scrollTopByScopeRef.current[currentScrollScopeKey] ?? 0
        currentLibraryScrollTopRef.current = nextTop
        setLibraryScrollRestoreTop(nextTop)
        setLibraryScrollRestoreKey(`${currentScrollScopeKey}:${Date.now()}`)
    }, [currentScrollScopeKey])

    useEffect(() => {
        const previousScopeKey = previousScrollScopeKeyRef.current
        if (previousScopeKey === currentScrollScopeKey) return

        scrollTopByScopeRef.current[previousScopeKey] = currentLibraryScrollTopRef.current

        const nextTop = scrollTopByScopeRef.current[currentScrollScopeKey] ?? 0
        currentLibraryScrollTopRef.current = nextTop
        setLibraryScrollRestoreTop(nextTop)
        setLibraryScrollRestoreKey(`${currentScrollScopeKey}:${Date.now()}`)
        previousScrollScopeKeyRef.current = currentScrollScopeKey
    }, [currentScrollScopeKey])

    // 設定保存
    useEffect(() => {
        localStorage.setItem('app_settings', JSON.stringify(settings))
    }, [settings])

    useEffect(() => {
        if (startupLoading) return
        reloadSettings()
    }, [startupLoading, reloadSettings])

    useEffect(() => {
        let cancelled = false

        const maybeShowReleaseNotes = async () => {
            try {
                const currentVersion = String(await api.getAppVersion()).trim()
                if (!currentVersion) return

                const previousVersion = localStorage.getItem(LAST_LAUNCHED_VERSION_STORAGE_KEY)?.trim() || ''
                localStorage.setItem(LAST_LAUNCHED_VERSION_STORAGE_KEY, currentVersion)

                if (!previousVersion || previousVersion === currentVersion) {
                    return
                }

                const releaseNotes = getBundledReleaseNotes(currentVersion, uiLanguage).trim()
                if (cancelled) return

                setReleaseNotesModal({
                    version: currentVersion,
                    releaseNotes,
                })
            } catch (error) {
                console.warn('Failed to prepare release notes modal:', error)
            }
        }

        void maybeShowReleaseNotes()

        return () => {
            cancelled = true
        }
    }, [uiLanguage])

    // 重複検知・解決用ステート
    const [duplicateQueue, setDuplicateQueue] = useState<{ newMedia: MediaFile; existingMedia: MediaFile; onResolve?: (media: MediaFile) => void }[]>([])
    const cleanupImportedSource = useCallback(async (media: MediaFile) => {
        const sourcePath = String((media as any)?.import_source_path || '').trim()
        if (!sourcePath) return
        try {
            await api.deleteFileSystemFiles([sourcePath])
        } catch (e) {
            console.warn('Failed to delete imported source file:', sourcePath, e)
        }
    }, [])

    // 最初の重複アイテムに対する処理
    const handleResolveDuplicate = async (action: 'skip' | 'replace' | 'both') => {
        const current = duplicateQueue[0]
        if (!current) return

        try {
            if (action === 'replace') {
                // 元ファイルをゴミ箱へ -> 新しく入れた方は維持
                await moveToTrash(current.existingMedia.id)
                await cleanupImportedSource(current.newMedia)
                // コールバック実行 (新しく入れた方を有効なファイルとして渡す)
                await cleanupImportedSource(current.newMedia)
                if (current.onResolve) await current.onResolve(current.newMedia)
            } else if (action === 'both') {
                // 両方そのまま (すでにインポート済み)
                if (current.onResolve) await current.onResolve(current.newMedia)
            } else if (action === 'skip') {
                // 新しく入れた方を「完全に削除」(重複なので) -> 元ファイルを維持
                await deletePermanently(current.newMedia.id)
                await cleanupImportedSource(current.newMedia)
                // コールバック実行 (既存の方を有効なファイルとして渡す)
                if (current.onResolve) await current.onResolve(current.existingMedia)
            }
        } catch (e) {
            console.error('Failed to resolve duplicate:', e)
        }

        // 次のキューへ
        setDuplicateQueue(prev => prev.slice(1))
    }

    const handleSmartImport = async (filePaths: string[], onImported?: (media: MediaFile) => void, options?: { deleteSource?: boolean; importSource?: string }) => {
        // 先にインポート実行
        const imported = await importMedia(filePaths, options)
        if (!imported) return

        for (const media of imported) {
            // インポート済みのメディアに対して重複チェック
            const duplicates = await checkEntryDuplicates(media.id)

            if (duplicates.length > 0) {
                // 重複あり -> キューに追加 (onResolveとしてonImportedを渡す)
                // 複数の既存重複がある場合も考慮
                const queueItems = duplicates.map((d: any) => ({ ...d, onResolve: onImported }))
                setDuplicateQueue(prev => [...prev, ...queueItems])
            } else {
                // 重複なし -> 通常通りコールバック実行
                if (onImported) await onImported(media)
            }
        }
    }

    // リモートライブラリ接続時にプロファイルをチェック
    useEffect(() => {
        if (!activeRemoteLibrary) return

        const checkProfile = async () => {
            if (!myUserToken) return
            try {
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                const response = await (globalThis.fetch as any)(`${baseUrl}/api/profile`, {
                    headers: getAuthHeaders(activeRemoteLibrary.token, myUserToken)
                })

                if (response.ok) {
                    const profile = await response.json()
                    // ニックネームが未設定の場合、ローカルのニックネームが設定されていれば自動同期
                    if (!profile.nickname && clientConfig?.nickname) {
                        console.log(`[App] Auto-syncing profile to remote library: ${activeRemoteLibrary.name}`)
                        await (api as any).updateRemoteProfile(
                            activeRemoteLibrary.url,
                            activeRemoteLibrary.token,
                            clientConfig.nickname,
                            clientConfig.iconUrl
                        )
                    }
                }
            } catch (error) {
                console.error('Failed to check profile:', error)
            }
        }

        checkProfile()
    }, [activeRemoteLibrary, myUserToken, clientConfig])

    // コンテキストメニュー
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; media: MediaFile } | null>(null)

    // mediaFilesが更新されたら選択中メディアと再生中メディアを最新のデータで更新
    useEffect(() => {
        if (selectedMediaIds.length > 0) {
            // 現在の表示対象ファイルの中にまだ存在するかチェック
            const validIds = selectedMediaIds.filter(id => mediaFiles.some(m => m.id === id))
            if (validIds.length !== selectedMediaIds.length) {
                setSelectedMediaIds(validIds)
            }
        }
        if (playingMedia) {
            const updated = mediaFiles.find(m => m.id === playingMedia.id)
            if (updated) {
                setPlayingMedia(updated)
            }
        }
    }, [mediaFiles])

    // DELETEキーでゴミ箱へ移動（ゴミ箱表示時は完全削除）
    const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[]>([])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 入力フィールドにフォーカスがある場合は無視
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return
            }

            if (e.key === 'Delete' && selectedMediaIds.length > 0) {
                e.preventDefault()

                if (filterOptions.filterType === 'trash') {
                    // ゴミ箱表示時: 完全削除（確認モーダル表示）
                    setDeleteConfirmIds([...selectedMediaIds])
                } else {
                    // 通常表示時: ゴミ箱へ移動
                    selectedMediaIds.forEach(id => moveToTrash(id))
                    setSelectedMediaIds([])
                    setLastSelectedId(null)
                }
            }

            // 設定画面ショートカット (Ctrl + ,)
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault()
                setShowSettingsModal(true)
            }

            // Developer Tools (F12): opt-in via settings.
            if (e.key === 'F12' && Boolean(clientConfig?.enableF12DeveloperTools)) {
                e.preventDefault()
                api.toggleDeveloperTools().catch((err) => {
                    console.error('Failed to toggle developer tools:', err)
                })
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selectedMediaIds, moveToTrash, filterOptions.filterType, clientConfig?.enableF12DeveloperTools])

    // スペースキーで再生 (ライブラリで選択中、かつプレイヤーが開いていない場合)
    // プレイヤーが開いている場合はShortcutContextのscope='player'が優先されるため、ここでは発火しない(はず)
    // または発火しても無視する条件を入れる
    useShortcut('PLAYER_TOGGLE_PLAY', () => {
        if (!playingMedia && selectedMediaIds.length > 0) {
            // 最後に選択されたID、または最初の選択IDを使用
            const targetId = lastSelectedId || selectedMediaIds[0]
            const media = mediaFiles.find(m => m.id === targetId)
            if (media) {
                handleMediaDoubleClick(media)
            }
        }
    }, {
        // scope: 'global', // default
        enabled: !playingMedia && selectedMediaIds.length > 0
    })

    const handleMediaClick = useCallback((media: MediaFile, e: React.MouseEvent) => {
        // ドラッグ操作中はクリック処理（選択変更）を行わない
        if (isInternalDrag.current) {
            console.log('[App] Click blocked due to internal drag')
            return
        }

        const isCtrl = e.ctrlKey || e.metaKey
        const isShift = e.shiftKey

        if (isShift && lastSelectedId !== null) {
            // Shift選択: 前回の選択から今回の選択までの範囲を選択
            const currentIndex = mediaFiles.findIndex(m => m.id === media.id)
            const lastIndex = mediaFiles.findIndex(m => m.id === lastSelectedId)

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex)
                const end = Math.max(currentIndex, lastIndex)
                const rangeIds = mediaFiles.slice(start, end + 1).map(m => m.id)

                // 既存の選択に追加（重複排除）
                setSelectedMediaIds(prev => Array.from(new Set([...prev, ...rangeIds])))
            }
        } else if (isCtrl) {
            // Ctrl選択: 個別にトグル
            setSelectedMediaIds(prev => {
                if (prev.includes(media.id)) {
                    return prev.filter(id => id !== media.id)
                } else {
                    return [...prev, media.id]
                }
            })
        } else {
            // 通常選択: 単一選択
            setSelectedMediaIds([media.id])
        }

        setLastSelectedId(media.id)
    }, [mediaFiles, lastSelectedId])

    const handleMediaDoubleClick = useCallback((media: MediaFile) => {
        saveCurrentLibraryScrollPosition()
        setPlayingMedia(media)
        setSelectedMediaIds([media.id]) // 再生時も単一選択に
        setLastSelectedId(media.id)
        updateLastPlayed(media.id)
    }, [saveCurrentLibraryScrollPosition, updateLastPlayed])

    const handleClosePlayer = useCallback(() => {
        setPlayingMedia(null)
        restoreCurrentLibraryScrollPosition()
    }, [restoreCurrentLibraryScrollPosition])

    const handleCloseInspector = () => {
        setSelectedMediaIds([])
        setLastSelectedId(null)
    }

    // コンテキストメニューハンドラー
    const handleContextMenu = useCallback((media: MediaFile, e: React.MouseEvent) => {
        setContextMenu({ x: e.clientX, y: e.clientY, media })
        // 右クリック時には、そのアイテムが選択されていなければそれのみを選択
        setSelectedMediaIds(prev => {
            if (!prev.includes(media.id)) {
                return [media.id]
            }
            return prev
        })
        setLastSelectedId(media.id)
    }, [])

    const closeContextMenu = () => {
        setContextMenu(null)
    }

    const handleOpenDefault = async () => {
        if (contextMenu?.media) {
            await api.openPath(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleOpenWith = async () => {
        if (contextMenu?.media) {
            await api.openWith(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleShowInExplorer = async () => {
        if (contextMenu?.media) {
            await api.showItemInFolder(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleExport = async (media: MediaFile) => {
        closeContextMenu()

        // 通知IDを生成してプログレス通知を表示（Progress=0）
        const notificationId = addNotification({
            type: 'progress',
            title: tr('Exporting', 'Exporting'),
            message: tr(`Embedding metadata into ${media.file_name}...`, `Embedding metadata into ${media.file_name}...`),
            progress: 0,
            duration: 0
        })

        try {
            const result = await api.exportMedia(media.id, { notificationId })

            // 完了したら通知を削除
            removeNotification(notificationId)

            if (result.success) {
                addNotification({
                    type: 'success',
                    title: tr('Export complete', 'Export complete'),
                    message: tr(`Saved ${media.file_name}`, `Saved ${media.file_name}`),
                    duration: 5000
                })
            } else if (result.message === 'Cancelled') {
                // キャンセルされた場合は何もしない（通知は削除済み）
            } else {
                addNotification({
                    type: 'error',
                    title: tr('Export failed', 'Export failed'),
                    message: result.message || tr('Unknown error occurred', 'Unknown error occurred'),
                    duration: 5000
                })
            }
        } catch (e: any) {
            removeNotification(notificationId)
            addNotification({
                type: 'error',
                title: tr('Export failed', 'Export failed'),
                message: e.message,
                duration: 5000
            })
        }
    }

    const handleAddToLibrary = async (libraryId: string) => {
        const media = contextMenu?.media
        closeContextMenu()
        if (!media) return

        let targetMediaIds = [media.id]
        if (selectedMediaIds.length > 0 && selectedMediaIds.includes(media.id)) {
            targetMediaIds = selectedMediaIds
        }

        // リモートライブラリかチェック
        const remoteLib = (clientConfig?.remoteLibraries || []).find((l: any) => l.id === libraryId)

        if (remoteLib) {
            // リモート転送処理
            const filesToTransfer = targetMediaIds.map(id => mediaFiles.find(m => m.id === id)).filter(Boolean) as MediaFile[]
            if (filesToTransfer.length === 0) return

            const notificationId = addNotification({
                type: 'progress',
                title: tr(`Transferring: ${remoteLib.name}`, `Transferring: ${remoteLib.name}`),
                message: tr(`Uploading ${filesToTransfer.length} files...`, `Uploading ${filesToTransfer.length} files...`),
                progress: 0,
                duration: 0
            })

            try {
                // メタデータの構築
                const metadata: any = {};
                filesToTransfer.forEach(f => {
                    metadata[f.file_name] = {
                        tags: f.tags?.map(t => t.name) || [],
                        rating: f.rating,
                        description: f.description,
                        folders: f.folders?.map(fold => fold.name) || []
                    }
                })

                const filePaths = filesToTransfer.map(f => f.file_path)

                // アップロード実行 (メタデータ付き)
                const result = await api.uploadRemoteMedia(
                    remoteLib.url,
                    remoteLib.token,
                    filePaths,
                    metadata, // new argument
                    { notificationId }
                )

                removeNotification(notificationId)

                if (result.success) {
                    addNotification({
                        type: 'success',
                        title: tr('Transfer complete', 'Transfer complete'),
                        message: tr(`Uploaded ${filesToTransfer.length} files to ${remoteLib.name}`, `Uploaded ${filesToTransfer.length} files to ${remoteLib.name}`),
                        duration: 5000
                    })
                } else {
                    addNotification({
                        type: 'error',
                        title: tr('Transfer failed', 'Transfer failed'),
                        message: result.message || tr('Unknown error occurred', 'Unknown error occurred'),
                        duration: 5000
                    })
                }
            } catch (e: any) {
                removeNotification(notificationId)
                addNotification({
                    type: 'error',
                    title: tr('Transfer failed', 'Transfer failed'),
                    message: e.message,
                    duration: 5000
                })
            }
            return
        }

        // 以下、ローカル転送処理 (既存)
        // クライアント設定から転送設定を取得
        let config: ClientConfig | null = null
        if (api) {
            config = await (api as any).getClientConfig()
        }

        const settings = config?.libraryTransferSettings || {
            keepTags: false,
            keepArtists: false,
            keepFolders: false,
            keepRatings: false,
            keepThumbnails: false,
            keepUrl: false,
            keepComments: false,
            keepDescription: false
        }

        const targetLib = availableLibraries.find(l => l.path === libraryId)
        const libName = targetLib ? targetLib.name : libraryId

        const notificationId = addNotification({
            type: 'progress',
            title: tr(`Transferring: ${libName}`, `Transferring: ${libName}`),
            message: tr(`Transferring ${targetMediaIds.length} files...`, `Transferring ${targetMediaIds.length} files...`),
            progress: 0,
            duration: 0
        })

        try {
            const result = await api.copyMediaToLibrary(targetMediaIds, libraryId, settings, { notificationId })

            removeNotification(notificationId)

            if (result.success) {
                addNotification({
                    type: 'success',
                    title: tr('Transfer complete', 'Transfer complete'),
                    message: tr(`Added ${targetMediaIds.length} files to ${libName}`, `Added ${targetMediaIds.length} files to ${libName}`),
                    duration: 5000
                })
            } else {
                addNotification({
                    type: 'error',
                    title: tr('Transfer failed', 'Transfer failed'),
                    message: result.message || tr('Unknown error occurred', 'Unknown error occurred'),
                    duration: 5000
                })
            }
        } catch (e: any) {
            removeNotification(notificationId)
            addNotification({
                type: 'error',
                title: tr('Transfer failed', 'Transfer failed'),
                message: e.message,
                duration: 5000
            })
        }
    }

    const handleAddToFolder = async (folderId: number) => {
        if (contextMenu?.media) {
            const targetFolder = folders.find((folder) => Number(folder.id) === Number(folderId)) || null
            await addFolderToMedia(contextMenu.media.id, folderId, targetFolder)
        }
        closeContextMenu()
    }

    const handleAddFolderFromInspector = useCallback(async (mediaId: number, folderId: number) => {
        const targetFolder = folders.find((folder) => Number(folder.id) === Number(folderId)) || null
        await addFolderToMedia(mediaId, folderId, targetFolder)
    }, [addFolderToMedia, folders])

    const handleDropOnFolder = async (folderId: number, files?: FileList | null, mediaIds?: number[]) => {
        const targetFolder = folders.find((folder) => Number(folder.id) === Number(folderId)) || null
        const normalizedMediaIds = Array.isArray(mediaIds)
            ? Array.from(new Set(mediaIds.map((id) => Number(id)).filter(Number.isFinite)))
            : []

        if (normalizedMediaIds.length > 0) {
            for (const mediaId of normalizedMediaIds) {
                await addFolderToMedia(mediaId, folderId, targetFolder)
            }
            endInternalMediaDrag()
            return
        }

        if (isInternalDrag.current && internalDraggedMediaIdsRef.current.length > 0) {
            const draggedMediaIds = [...internalDraggedMediaIdsRef.current]
            for (const mediaId of draggedMediaIds) {
                await addFolderToMedia(mediaId, folderId, targetFolder)
            }
            endInternalMediaDrag()
            return
        }

        if (!files || files.length === 0) return

        const filePaths = Array.from(files)
            .map(f => (f as any).path)
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

        const normalizedPathSet = new Set(filePaths.map((p) => p.replace(/\\/g, '/').toLowerCase()))
        const matchedMediaIds = Array.from(new Set(
            mediaFiles
                .filter((media) => {
                    const filePath = typeof media.file_path === 'string' ? media.file_path.replace(/\\/g, '/').toLowerCase() : ''
                    const sourcePath = typeof media.import_source_path === 'string' ? media.import_source_path.replace(/\\/g, '/').toLowerCase() : ''
                    return normalizedPathSet.has(filePath) || normalizedPathSet.has(sourcePath)
                })
                .map((media) => media.id),
        ))

        if (matchedMediaIds.length > 0) {
            for (const mediaId of matchedMediaIds) {
                await addFolderToMedia(mediaId, folderId, targetFolder)
            }
            endInternalMediaDrag()
            return
        }

        if (isInternalDrag.current) {
            // 内部ドラッグ：既存のメディアファイルを特定して追加
            // パスから一致するメディアを探す
            const targetIds: number[] = []
            filePaths.forEach(path => {
                const media = mediaFiles.find(m => m.file_path === path)
                if (media) {
                    targetIds.push(media.id)
                }
            })

            // 選択中のファイルも考慮（ドラッグ中のファイルが含まれていない場合の保険、基本はパスで一致するはず）
            if (targetIds.length === 0 && selectedMediaIds.length > 0) {
                selectedMediaIds.forEach(id => targetIds.push(id))
            }

            // 重複排除
            const uniqueIds = Array.from(new Set(targetIds))

            for (const mediaId of uniqueIds) {
                await addFolderToMedia(mediaId, folderId, targetFolder)
            }
        } else {
            // 外部ドラッグ：Smartインポートを使用して解決
            await handleSmartImport(filePaths, async (media) => {
                await addFolderToMedia(media.id, folderId, targetFolder)
            }, dragDropImportOptions)
            // ライブラリをリフレッシュ (addFolderToMedia内でloadMediaFilesしていれば不要だが念のため)
            await refreshLibrary()
        }
    }



    const handleCopy = async () => {
        if (contextMenu?.media) {
            await api.copyFile(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleCopyPath = async () => {
        if (contextMenu?.media) {
            await api.copyToClipboard(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleMoveToTrash = async () => {
        if (contextMenu?.media) {
            await moveToTrash(contextMenu.media.id)
        }
        closeContextMenu()
    }

    const handleRefreshMetadata = async () => {
        const media = contextMenu?.media
        closeContextMenu()
        if (!media) return

        let targetIds = [media.id]
        if (selectedMediaIds.length > 0 && selectedMediaIds.includes(media.id)) {
            targetIds = selectedMediaIds
        }

        const notificationId = addNotification({
            type: 'progress',
            title: tr('Updating metadata', 'Updating metadata'),
            message: tr(`Updating ${targetIds.length} files...`, `Updating ${targetIds.length} files...`),
            progress: 0,
            duration: 0
        })

        const startedAt = performance.now()
        console.log('[MetadataRefresh] request start', {
            count: targetIds.length,
            ids: targetIds,
        })

        try {
            if (activeRemoteLibrary) {
                // Future: Remote API call
                throw new Error(tr('Per-item metadata refresh is not supported for remote libraries yet', 'Per-item metadata refresh is not supported for remote libraries yet'))
            } else {
                await api.refreshMetadata(targetIds)
            }

            removeNotification(notificationId)
            addNotification({
                type: 'success',
                title: tr('Update complete', 'Update complete'),
                message: tr('Metadata updated', 'Metadata updated'),
                duration: 3000
            })
            await reloadLibrary()
            console.log('[MetadataRefresh] request complete', {
                count: targetIds.length,
                elapsedMs: Math.round(performance.now() - startedAt),
            })
        } catch (e: any) {
            console.error('[MetadataRefresh] request failed', {
                count: targetIds.length,
                elapsedMs: Math.round(performance.now() - startedAt),
                error: e?.message || String(e),
            })
            removeNotification(notificationId)
            addNotification({
                type: 'error',
                title: tr('Update failed', 'Update failed'),
                message: e.message || String(e),
                duration: 5000
            })
        }
    }





    // ヘッダータイトルの取得
    const getHeaderTitle = () => {
        if (activeRemoteLibrary) return activeRemoteLibrary.name || tr('Remote Library', 'Remote Library')

        if (filterOptions.filterType === 'tag_manager') return tr('Tag Manager', 'Tag Manager')
        if (filterOptions.filterType === 'trash') return tr('Trash', 'Trash')
        if (filterOptions.filterType === 'uncategorized') return tr('Uncategorized', 'Uncategorized')
        if (filterOptions.filterType === 'untagged') return tr('Untagged', 'Untagged')
        if (filterOptions.filterType === 'recent') return tr('Recent', 'Recent')
        if (filterOptions.filterType === 'random') return tr('Random', 'Random')

        if (filterOptions.selectedFolders.length > 0) {
            const folder = folders.find(f => filterOptions.selectedFolders.includes(f.id))
            return folder ? folder.name : tr('All', 'All')
        }

        return activeLibrary ? activeLibrary.name : tr('All', 'All')
    }

    const handleAddParent = async (childId: number, parentId: number) => {
        if (activeRemoteLibrary) {
            await api.addRemoteMediaParent(activeRemoteLibrary.url, activeRemoteLibrary.token, childId, parentId)
            reloadLibrary()
        } else if (api) {
            await (api as any).addMediaParent(childId, parentId)
            refreshLibrary()
        }
    }

    const handleRemoveParent = async (childId: number, parentId: number) => {
        if (activeRemoteLibrary) {
            await api.removeRemoteMediaParent(activeRemoteLibrary.url, activeRemoteLibrary.token, childId, parentId)
            reloadLibrary()
        } else if (api) {
            await (api as any).removeMediaParent(childId, parentId)
            refreshLibrary()
        }
    }

    const handleSearchMedia = async (query: string, targets: any): Promise<any[]> => {
        if (activeRemoteLibrary) {
            return await api.searchRemoteMediaFiles(activeRemoteLibrary.url, activeRemoteLibrary.token, query, targets)
        }
        if (!api) return []
        return await (api as any).searchMediaFiles(query, targets)
    }

    const renderMainContent = () => {
        // プレイヤー再生中: オーバーレイとして表示
        const playerOverlay = playingMedia ? (
            <div className="player-overlay-container">
                <Player
                    media={playingMedia}
                    onBack={handleClosePlayer}
                    onNext={() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        const hasNext = currentIndex !== -1 && currentIndex < mediaFiles.length - 1
                        if (hasNext) {
                            const nextMedia = mediaFiles[currentIndex + 1]
                            setPlayingMedia(nextMedia)
                            setSelectedMediaIds([nextMedia.id])
                            setLastSelectedId(nextMedia.id)
                            updateLastPlayed(nextMedia.id)
                        }
                    }}
                    onPrev={() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        const hasPrev = currentIndex !== -1 && currentIndex > 0
                        if (hasPrev) {
                            const prevMedia = mediaFiles[currentIndex - 1]
                            setPlayingMedia(prevMedia)
                            setSelectedMediaIds([prevMedia.id])
                            setLastSelectedId(prevMedia.id)
                            updateLastPlayed(prevMedia.id)
                        }
                    }}
                    hasNext={(() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        return currentIndex !== -1 && currentIndex < mediaFiles.length - 1
                    })()}
                    hasPrev={(() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        return currentIndex !== -1 && currentIndex > 0
                    })()}
                    autoPlayEnabled={settings.autoPlay}
                    pipControlMode={settings.pipControlMode}
                    onToggleAutoPlay={() => {
                        setSettings(prev => ({ ...prev, autoPlay: !prev.autoPlay }))
                    }}
                    onPlayFirst={() => {
                        if (mediaFiles.length > 0) {
                            const firstMedia = mediaFiles[0]
                            setPlayingMedia(firstMedia)
                            setSelectedMediaIds([firstMedia.id])
                            setLastSelectedId(firstMedia.id)
                            updateLastPlayed(firstMedia.id)
                        }
                    }}
                    activeRemoteLibrary={activeRemoteLibrary}
                    myUserToken={myUserToken}
                    videoScaling={settings.videoScaling}
                    imageScaling={settings.imageScaling}
                    settings={settings}
                    onCommentAdded={() => {
                        // コメント追加後、メディアデータを再取得してInspectorを更新
                        reloadLibrary()
                    }}
                />
            </div>
        ) : null

        let mainContent = null
        if (filterOptions.filterType === 'tag_manager') {
            mainContent = (
                <TagManager
                    tags={tags}
                    tagGroups={tagGroups}
                    onCreateTag={createTag}
                    onDeleteTag={deleteTag}
                    disabled={!hasActiveLibrary && !activeRemoteLibrary}
                    onRefresh={refreshLibrary}
                    onInternalDragStart={beginInternalUiDrag}
                    onInternalDragEnd={endInternalMediaDrag}
                    allMediaFiles={allMediaFiles}
                />
            )
        } else {
            mainContent = (
                <div
                    className="content-container"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedMediaIds([])
                            setLastSelectedId(null)
                        }
                    }}
                >
                    <MainHeader
                        title={getHeaderTitle()}
                        filterOptions={filterOptions}
                        onFilterChange={updateFilterOptions}
                        filterPresets={filterPresets}
                        onApplyFilterPreset={handleApplyFilterPreset}
                        onSaveFilterPreset={handleSaveFilterPreset}
                        onDeleteFilterPreset={handleDeleteFilterPreset}
                        onRenameFilterPreset={handleRenameFilterPreset}
                        onResetFilters={handleResetFilters}
                        gridSize={gridSize}
                        onGridSizeChange={setGridSize}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        tags={tags}
                        tagGroups={tagGroups}
                        allMediaFiles={allMediaFiles}
                        viewSettings={viewSettings}
                        onViewSettingsChange={setViewSettings}
                        folders={folders}
                        onRefreshLibrary={handleRefreshLibrary}
                        onReload={reloadLibrary}
                        showSidebar={viewSettings.showSidebar}
                        onToggleSidebar={() => handleUpdateViewSettings({ showSidebar: !viewSettings.showSidebar })}
                        onOpenSettings={() => setShowSettingsModal(true)}
                    />
                    <div className={`library-drop-zone ${isDragging ? 'dragging' : ''}`} data-library-drop-zone="true">
                    {/* サブフォルダー表示 */}
                    {filterOptions.selectedFolders.length > 0 && (
                        <SubfolderGrid
                            subfolders={folders.filter(f => f.parentId === filterOptions.selectedFolders[0])}
                            onSelectFolder={(folderId) => {
                                updateFilterOptions(prev => ({ ...prev, selectedFolders: [folderId] }))
                            }}
                            getMediaCount={(folderId) => {
                                // TODO: 実際のメディアカウントを計算
                                return allMediaFiles.filter(m => !m.is_deleted && m.folders?.some(f => f.id === folderId)).length
                            }}
                        />
                    )}

                    {/* Loading Overlay */}
                    <LoadingOverlay isVisible={isStartupOverlayVisible} message={i18nT(uiLanguage, 'app.loadingData')} progress={loadingProgress} />

                    {/* モーダル群 */}
                    {filterOptions.selectedFolders.length > 0 && folders.filter(f => f.parentId === filterOptions.selectedFolders[0]).length > 0 && (
                        <div className="content-section-header">
                            <span>{i18nT(uiLanguage, 'app.contentWithCount', { count: mediaFiles.length })}</span>
                        </div>
                    )}

                    {viewMode === 'grid' ? (
                        <LibraryGrid
                            mediaFiles={mediaFiles}
                            onMediaClick={handleMediaClick}
                            onMediaDoubleClick={handleMediaDoubleClick}
                            onMediaContextMenu={handleContextMenu}
                            gridSize={gridSize}
                            viewMode={viewMode}
                            selectedMediaIds={selectedMediaIds}
                            viewSettings={viewSettings}
                            onClearSelection={() => {
                                setSelectedMediaIds([])
                                setLastSelectedId(null)
                            }}
                            onSelectionChange={(ids) => {
                                setSelectedMediaIds(ids)
                                if (ids.length > 0) setLastSelectedId(ids[ids.length - 1])
                            }}
                            onInternalDragStart={beginInternalMediaDrag}
                            onInternalDragEnd={() => {
                                // 少し遅延させてクリア（ドロップ処理との競合を防ぐ）
                                endInternalMediaDrag()
                            }}
                            renamingMediaId={renamingMediaId}
                            onRenameSubmit={async (id, newName) => {
                                // DB更新
                                await api.renameMedia(id, newName)
                                setRenamingMediaId(null)
                                refreshLibrary()
                            }}
                            onRenameCancel={() => setRenamingMediaId(null)}
                            onLoadMore={loadMore}
                            hasMore={hasMore}
                            initialScrollTop={libraryScrollRestoreTop}
                            scrollRestoreKey={libraryScrollRestoreKey}
                            onScrollPositionChange={(scrollTop) => {
                                currentLibraryScrollTopRef.current = scrollTop
                                scrollTopByScopeRef.current[currentScrollScopeKey] = scrollTop
                            }}
                        />
                    ) : (
                        <LibraryList
                            mediaFiles={mediaFiles}
                            selectedIds={selectedMediaIds}
                            onSelect={handleMediaClick}
                            onSelectionChange={(ids) => {
                                setSelectedMediaIds(ids)
                                if (ids.length > 0) setLastSelectedId(ids[ids.length - 1])
                            }}
                            onDoubleClick={handleMediaDoubleClick}
                            onContextMenu={handleContextMenu}
                            viewSettings={viewSettings}
                            updateViewSettings={handleUpdateViewSettings}
                            filterOptions={filterOptions}
                            onFilterChange={updateFilterOptions}
                            onLoadMore={loadMore}
                            hasMore={hasMore}
                            onInternalDragStart={beginInternalMediaDrag}
                            onInternalDragEnd={endInternalMediaDrag}
                            initialScrollTop={libraryScrollRestoreTop}
                            scrollRestoreKey={libraryScrollRestoreKey}
                            onScrollPositionChange={(scrollTop) => {
                                currentLibraryScrollTopRef.current = scrollTop
                                scrollTopByScopeRef.current[currentScrollScopeKey] = scrollTop
                            }}
                        />
                    )}
                    </div>
                </div>
            )
        }

        if (playerOverlay) {
            return playerOverlay
        }

        return mainContent
    }


    // メタデータバックフィル
    useEffect(() => {
        // Disabled on startup: probing large libraries can freeze initial launch.
    }, [activeLibrary, refreshLibrary])

    const inspectorMedia = useMemo(() => {
        return selectedMediaIds
            .map(id => mediaFiles.find(m => m.id === id))
            .filter(Boolean) as MediaFile[]
    }, [selectedMediaIds, mediaFiles])

    const sidebarShellStyle = useMemo(() => ({
        width: `${sidebarWidth}px`,
        flexBasis: `${sidebarWidth}px`,
        ['--sidebar-width' as any]: `${sidebarWidth}px`
    }), [sidebarWidth])

    const inspectorShellStyle = useMemo(() => ({
        width: `${inspectorWidth}px`,
        flexBasis: `${inspectorWidth}px`,
        ['--right-sidebar-width' as any]: `${inspectorWidth}px`
    }), [inspectorWidth])

    return (
        <div className="app">
            <div ref={resizeGuideRef} className="panel-resize-guide" aria-hidden="true" />
            {viewSettings.showSidebar && (
                <>
                    <div ref={sidebarShellRef} className="panel-shell sidebar-shell" style={sidebarShellStyle}>
                        <Sidebar
                language={clientConfig?.language === 'en' ? 'en' : 'ja'}
                filterOptions={filterOptions}
                onFilterChange={(options) => {
                    setPlayingMedia(null)
                    updateFilterOptions(options)
                }}
                folders={folders}
                libraries={libraries}
                remoteLibraries={clientConfig?.remoteLibraries || []}
                activeLibrary={activeLibrary}
                activeRemoteLibrary={activeRemoteLibrary}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onOpenLibraryModal={() => setShowLibraryModal(true)}
                onOpenLibrary={openLibrary}
                onSwitchLibrary={(path) => {
                    setPlayingMedia(null)
                    switchToLocalLibrary(path)
                }}
                onRemoveLocalLibraryHistory={removeLocalLibraryHistory}
                onSwitchRemoteLibrary={(lib) => {
                    setPlayingMedia(null)
                    switchToRemoteLibrary(lib)
                }}
                onOpenSettings={() => setShowSettingsModal(true)}
                onToggleSidebar={() => handleUpdateViewSettings({ showSidebar: false })}
                hasActiveLibrary={hasActiveLibrary}
                onRefreshFolders={loadFolders}
                onDropFileOnFolder={handleDropOnFolder}
                externalDropFolderId={externalDropFolderId}
                // 内部ドラッグの通知を追加
                onInternalDragStart={beginInternalUiDrag}
                onInternalDragEnd={() => {
                    // 少し遅延させてクリア（ドロップ処理との競合を防ぐ）
                    endInternalMediaDrag()
                }}
                            itemCounts={sidebarCounts}
                        />
                    </div>
                    <div
                        className={`panel-resize-handle sidebar-resize-handle ${activeResizePanel === 'sidebar' ? 'active' : ''}`}
                        onMouseDown={(event) => startPanelResize('sidebar', event)}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                    />
                </>
            )}

            <main className={`main-content ${playingMedia ? 'is-playing' : ''}`} onClick={(e) => {
                // グリッドの空きスペースをクリックしたら選択解除
                if (e.target === e.currentTarget) {
                    setSelectedMediaIds([])
                    setLastSelectedId(null)
                }
            }}>
                {renderMainContent()}

                {/* ライブラリ更新プログレスバー (メインコンテンツ下部固定) */}
                {isRefreshing && (
                    <div className="bottom-progress-bar-container">
                        <div className="bottom-progress-info">
                            <span className="scanning-text">{i18nT(uiLanguage, 'app.updatingLibrary')}</span>
                            <span className="progress-count">{refreshProgress.current} / {refreshProgress.total}</span>
                        </div>
                        <div className="bottom-progress-track">
                            <div
                                className="bottom-progress-fill"
                                style={{ width: `${(refreshProgress.current / Math.max(refreshProgress.total, 1)) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                )}
            </main>

            {viewSettings.showInspector && (
                <>
                    <div
                        className={`panel-resize-handle inspector-resize-handle ${activeResizePanel === 'inspector' ? 'active' : ''}`}
                        onMouseDown={(event) => startPanelResize('inspector', event)}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize inspector"
                    />
                    <div ref={inspectorShellRef} className="panel-shell inspector-shell" style={inspectorShellStyle}>
                        <Inspector
                    language={uiLanguage}
                    media={inspectorMedia}
                    playingMedia={playingMedia}
                    settings={settings}
                    allTags={tags}
                    allFolders={folders}
                    onAddTag={addTagToMedia}
                    onAddTags={addTagsToMedia}
                    onRemoveTag={removeTagFromMedia}
                    onCreateTag={createTag}
                    onAddFolder={handleAddFolderFromInspector}
                    onRemoveFolder={removeFolderFromMedia}
                    onCreateFolder={createFolder}
                    onUpdateDescription={activeRemoteLibrary ? undefined : updateDescription} // TODO: Remote update
                    onUpdateUrl={activeRemoteLibrary ? undefined : updateUrl} // TODO: Remote update
                    onUpdateArtist={updateArtist}
                    // Remote library relation update support depends on backend API implementation.
                    // Assuming local only for now unless remote API supports it.
                    onAddParent={handleAddParent}
                    onRemoveParent={handleRemoveParent}
                    onSearchMedia={handleSearchMedia}

                    totalStats={libraryStats}
                    currentContextMedia={mediaFiles}
                    contextTitle={getHeaderTitle()}
                    enableRichText={settings.enableRichText}
                    onPlay={(media) => {
                        saveCurrentLibraryScrollPosition()
                        setPlayingMedia(media)
                        setSelectedMediaIds([media.id])
                        setLastSelectedId(media.id)
                        updateLastPlayed(media.id)
                    }}
                    onMoveToTrash={moveToTrash}
                    onMoveFilesToTrash={moveFilesToTrash}
                    onRestore={restoreFromTrash}
                    onRestoreFiles={restoreFilesFromTrash}
                    onDeletePermanently={deletePermanently}
                    onDeleteFilesPermanently={deleteFilesPermanently}
                    onClose={handleCloseInspector}
                    onRenameMedia={renameMedia}
                    onUpdateRating={updateRating}
                            sharedUsers={sharedUsers}
                        />
                    </div>
                </>
            )}

            {showLibraryModal && (
                <LibraryModal
                    onClose={() => setShowLibraryModal(false)}
                    onCreateLibrary={createLibrary}
                    onOpenLibrary={openLibrary}
                />
            )}

            {showSettingsModal && (
                <SettingsModal
                    language={uiLanguage}
                    settings={settings}
                    initialClientConfig={clientConfig}
                    onUpdateSettings={(newSettings) => {
                        setSettings(newSettings)
                        localStorage.setItem('app_settings', JSON.stringify(newSettings))
                    }}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}

            {releaseNotesModal && (
                <div className="app-modal-overlay" onClick={() => setReleaseNotesModal(null)}>
                    <div className="app-modal release-notes-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="app-modal-header">
                            <h3>{tr('アップデート完了', 'Update Complete')}</h3>
                        </div>
                        <div className="app-modal-body">
                            <p>{tr(`バージョン ${releaseNotesModal.version} に更新されました。`, `Updated to version ${releaseNotesModal.version}.`)}</p>
                            <div className="release-notes-content">
                                {releaseNotesModal.releaseNotes || tr('変更履歴は取得できませんでした。', 'Release notes could not be loaded.')}
                            </div>
                        </div>
                        <div className="app-modal-footer">
                            <button className="btn btn-primary" onClick={() => setReleaseNotesModal(null)}>
                                {tr('閉じる', 'Close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* コンテキストメニュー */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    media={contextMenu.media}
                    folders={folders}
                    onClose={closeContextMenu}
                    onOpenDefault={handleOpenDefault}
                    onOpenWith={handleOpenWith}
                    onShowInExplorer={handleShowInExplorer}
                    onAddToFolder={handleAddToFolder}
                    availableLibraries={availableLibraries}
                    remoteLibraries={clientConfig?.remoteLibraries || []}
                    onAddToLibrary={handleAddToLibrary}
                    onRename={() => {
                        setRenamingMediaId(contextMenu.media.id)
                        closeContextMenu()
                    }}
                    onCopy={handleCopy}
                    onCopyPath={handleCopyPath}
                    onMoveToTrash={handleMoveToTrash}
                    onRefreshMetadata={!activeRemoteLibrary ? handleRefreshMetadata : undefined}
                    onExport={!activeRemoteLibrary ? handleExport : undefined}
                    onDownload={activeRemoteLibrary ? async () => {
                        if (!contextMenu?.media || !api) return
                        const media = contextMenu.media
                        const downloadUrl = media.file_path
                        const filename = media.file_name || 'download.mp4'

                        const notificationId = addNotification({
                            title: tr('Downloading...', 'Downloading...'),
                            message: filename,
                            type: 'progress',
                            progress: 0
                        })

                        closeContextMenu()

                        try {
                            const result = await (api as any).downloadRemoteMedia(downloadUrl, filename, { notificationId })
                            removeNotification(notificationId)

                            if (result.success) {
                                addNotification({
                                    title: tr('Download complete', 'Download complete'),
                                    message: filename,
                                    type: 'success',
                                    duration: 3000
                                })
                            } else {
                                addNotification({
                                    title: tr('Download failed', 'Download failed'),
                                    message: result.message || tr('Unknown error', 'Unknown error'),
                                    type: 'error',
                                    duration: 5000
                                })
                            }
                        } catch (e: any) {
                            removeNotification(notificationId)
                            addNotification({
                                title: tr('Error', 'Error'),
                                message: e.message,
                                type: 'error',
                                duration: 5000
                            })
                        }
                    } : undefined}
                    isRemote={!!activeRemoteLibrary}
                />
            )}

            {/* 完全削除確認モーダル */}
            {deleteConfirmIds.length > 0 && (
                <ConfirmModal
                    title={i18nT(uiLanguage, 'app.deletePermanentTitle')}
                    message={deleteConfirmIds.length === 1
                        ? i18nT(uiLanguage, 'app.deletePermanentSingleMessage')
                        : i18nT(uiLanguage, 'app.deletePermanentMultiMessage', { count: deleteConfirmIds.length })
                    }
                    confirmLabel={i18nT(uiLanguage, 'common.delete')}
                    cancelLabel={i18nT(uiLanguage, 'common.cancel')}
                    isDestructive={true}
                    onConfirm={async () => {
                        if (filterOptions.filterType === 'trash') {
                            await deleteFilesPermanently(deleteConfirmIds)
                        } else {
                            await moveFilesToTrash(deleteConfirmIds)
                        }
                        setSelectedMediaIds([])
                        setLastSelectedId(null)
                        setDeleteConfirmIds([])
                    }}
                    onCancel={() => setDeleteConfirmIds([])}
                />
            )}

            {false && isDragging && (
                <div className="app-drag-overlay">
                    <div className="drag-content">
                        <div className="drag-icon">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                        </div>
                        <h2>{i18nT(uiLanguage, 'app.dropAddFilesTitle')}</h2>
                        <p>{i18nT(uiLanguage, 'app.dropAddFilesDesc')}</p>
                    </div>
                </div>
            )}

            {/* 重複チェックモーダル */}
            {duplicateQueue.length > 0 && (
                <DuplicateModal
                    duplicate={duplicateQueue[0]}
                    onResolve={handleResolveDuplicate}
                />
            )}
        </div>
    )
}

