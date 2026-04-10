// @id creator-manager
// @name 謚慕ｨｿ閠・・繝阪・繧ｸ繝｣繝ｼ
// @description 繧ｵ繧､繝峨ヰ繝ｼ縺九ｉ髢九￠繧区兜遞ｿ閠・ｮ｡逅・判髱｢縺ｧ縲∵兜遞ｿ閠・錐縺ｮ荳諡ｬ螟画峩縺ｨ謚慕ｨｿ閠・・繝ｼ繧ｸURL縺ｮ邂｡逅・ｒ陦後＞縺ｾ縺吶・// @version 1.1.0
// @author Obscura
(function () {
    const PLUGIN_ID = 'creator-manager'
    const VIEW_ID = 'main'
    const GLOBAL_KEY = '__obscuraCreatorManager'
    const STORAGE_PREFIX = 'creator-manager:profiles:'

    if (!window.ObscuraAPI) {
        return
    }

    if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].cleanup === 'function') {
        try {
            window[GLOBAL_KEY].cleanup()
        } catch {
            // Ignore stale cleanup failures.
        }
    }

    const locale = detectLocale()
    const text = {
        ja: {
            sidebarLabel: 'すべての投稿者',
            title: '投稿者管理',
            subtitle: '投稿者を選択して、投稿者名の一括変更と投稿者ページURLの管理を行います。',
            searchPlaceholder: '投稿者名で検索',
            reload: '再読み込み',
            save: '保存',
            close: '閉じる',
            creators: '投稿者',
            mediaCount: '件数',
            renameLabel: '投稿者名',
            urlLabel: '投稿者ページURL',
            urlHint: '動画URLではなく、投稿者ページのURLを入力します。',
            noLibrary: 'ライブラリが選択されていません。',
            loading: '投稿者一覧を読み込み中...',
            empty: '投稿者データが見つかりません。',
            selectCreator: '右側の一覧から投稿者を選択してください。',
            unchanged: '適用する変更はありません。',
            applying: '投稿者データを更新しています...',
            applied: '投稿者データを更新しました。',
            failed: '投稿者データの更新に失敗しました。',
            confirmSave: '変更を保存しますか？',
            updatedRows: '更新件数',
            noSelection: '投稿者が選択されていません。',
        },
        en: {
            sidebarLabel: 'All Creators',
            title: 'Creator Manager',
            subtitle: 'Select a creator to batch rename creator metadata and manage creator page URLs.',
            searchPlaceholder: 'Search creators',
            reload: 'Reload',
            save: 'Save',
            close: 'Close',
            creators: 'Creators',
            mediaCount: 'Count',
            renameLabel: 'Creator name',
            urlLabel: 'Creator page URL',
            urlHint: 'Enter the creator page URL, not a video URL.',
            noLibrary: 'No library is selected.',
            loading: 'Loading creators...',
            empty: 'No creator data found.',
            selectCreator: 'Select a creator from the right list.',
            unchanged: 'There are no changes to apply.',
            applying: 'Updating creator data...',
            applied: 'Creator data updated.',
            failed: 'Failed to update creator data.',
            confirmSave: 'Save all changes?',
            updatedRows: 'Updated rows',
            noSelection: 'No creator is selected.',
        }
    }[locale]

    const state = {
        libraryKey: 'none',
        mainViewOpen: false,
        loading: false,
        applying: false,
        mediaItems: [],
        creators: [],
        selectedCreatorName: '',
        search: '',
        status: '',
        listScrollTop: 0,
        currentContext: null,
        mountDisposers: new Set(),
        listeners: [],
    }

    function detectLocale() {
        try {
            const raw = localStorage.getItem('tauri_client_config')
            const parsed = raw ? JSON.parse(raw) : null
            return parsed?.language === 'en' ? 'en' : 'ja'
        } catch {
            return 'ja'
        }
    }

    function ensureStyles() {
        if (document.getElementById('creator-manager-styles')) return
        const style = document.createElement('style')
        style.id = 'creator-manager-styles'
        style.textContent = `
.creator-manager-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 10px 10px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    box-sizing: border-box;
}
.creator-manager-topbar {
    min-height: calc(var(--window-chrome-height) + 10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: calc(4px + var(--window-chrome-height)) 0 0;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    flex-shrink: 0;
    -webkit-app-region: drag;
}
.creator-manager-topbar-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.creator-manager-topbar-title-main,
.creator-manager-topbar-title-sub {
    -webkit-app-region: no-drag;
}
.creator-manager-topbar-title-main {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main, #fff);
}
.creator-manager-topbar-title-sub {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
}
.creator-manager-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
    gap: 10px;
    min-height: 0;
    flex: 1;
    overflow: hidden;
}
.creator-manager-sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--border, rgba(255,255,255,0.08));
    background: var(--layout-panel-bg, rgba(255,255,255,0.02));
}
.creator-manager-sidebar-header,
.creator-manager-main-header {
    padding: 10px 14px 9px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.creator-manager-sidebar-title,
.creator-manager-main-title {
    margin: 0;
    color: var(--text-main, #fff);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.creator-manager-sidebar-subtitle,
.creator-manager-main-subtitle {
    margin: 6px 0 0;
    color: var(--text-muted, #9ca3af);
    font-size: 12px;
    line-height: 1.45;
}
.creator-manager-toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.creator-manager-search {
    width: 100%;
    min-height: 34px;
    padding: 7px 10px;
    background: var(--bg-card, var(--layout-panel-bg, rgba(255,255,255,0.04)));
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: var(--radius-md, 10px);
    color: var(--text-main, #fff);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
}
.creator-manager-search:focus,
.creator-manager-input:focus {
    border-color: var(--primary, #2563eb);
}
.creator-manager-button {
    min-height: 34px;
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius-md, 10px);
    background: linear-gradient(135deg, var(--primary, #2563eb) 0%, var(--primary-light, var(--accent, #3b82f6)) 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
.creator-manager-button.secondary {
    background: var(--bg-hover, rgba(255,255,255,0.08));
    color: var(--text-main, #fff);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
}
.creator-manager-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}
.creator-manager-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    padding: 6px;
    gap: 2px;
}
.creator-manager-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text-main, #fff);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}
.creator-manager-list-item:hover {
    background: var(--bg-hover, rgba(255,255,255,0.06));
}
.creator-manager-list-item.active {
    background: color-mix(in srgb, var(--primary, #2563eb), transparent 88%);
    color: var(--primary, #2563eb);
    font-weight: 600;
}
.creator-manager-list-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.creator-manager-count {
    color: var(--text-muted, #9ca3af);
    font-size: 12px;
}
.creator-manager-list-item.active .creator-manager-count {
    color: inherit;
}
.creator-manager-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--layout-panel-bg, rgba(255,255,255,0.02));
    border-radius: 10px;
}
.creator-manager-main-body {
    padding: 12px 14px 14px;
    overflow: auto;
}
.creator-manager-status {
    margin-top: 8px;
    color: var(--text-muted, #9ca3af);
    font-size: 12px;
}
.creator-manager-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
}
.creator-manager-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.creator-manager-field label {
    color: var(--text-muted, #9ca3af);
    font-size: 12px;
    font-weight: 600;
}
.creator-manager-input {
    width: 100%;
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: var(--radius-md, 10px);
    background: var(--bg-card, var(--layout-panel-bg, rgba(255,255,255,0.04)));
    color: var(--text-main, #fff);
    font-size: 13px;
    box-sizing: border-box;
    outline: none;
}
.creator-manager-hint {
    color: var(--text-muted, #9ca3af);
    font-size: 12px;
    line-height: 1.5;
}
.creator-manager-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.creator-manager-empty {
    color: var(--text-muted, #9ca3af);
    font-size: 13px;
    line-height: 1.6;
    padding: 6px 0;
}
@media (max-width: 900px) {
    .creator-manager-content {
        grid-template-columns: 1fr;
    }
    .creator-manager-sidebar {
        min-height: 180px;
        border-left: none;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    }
}
        `
        document.head.appendChild(style)
    }

    function cleanup() {
        for (const unlisten of state.listeners.splice(0)) {
            try {
                unlisten()
            } catch {
                // Ignore listener cleanup failures.
            }
        }
        state.mountDisposers.clear()
    }

    function getLibraryKeyFromContext(context) {
        if (context?.activeLibrary?.path) return `local:${context.activeLibrary.path}`
        if (context?.activeRemoteLibrary?.id) return `remote:${context.activeRemoteLibrary.id}`
        if (context?.activeRemoteLibrary?.url) return `remote:${context.activeRemoteLibrary.url}`
        return 'none'
    }

    function getProfilesStorageKey(libraryKey) {
        return `${STORAGE_PREFIX}${libraryKey}`
    }

    async function loadProfiles(libraryKey) {
        if (!libraryKey || libraryKey === 'none') return {}
        const saved = await window.ObscuraAPI.system.storage.get(getProfilesStorageKey(libraryKey))
        return saved && typeof saved === 'object' ? saved : {}
    }

    async function saveProfiles(libraryKey, profiles) {
        if (!libraryKey || libraryKey === 'none') return
        await window.ObscuraAPI.system.storage.set(getProfilesStorageKey(libraryKey), profiles)
    }

    async function fetchAllMedia() {
        const pageSize = 500
        let page = 1
        let total = Infinity
        const all = []

        while (all.length < total) {
            const result = await window.ObscuraAPI.media.list(page, pageSize, {})
            const batch = Array.isArray(result) ? result : (Array.isArray(result?.media) ? result.media : [])
            total = Array.isArray(result) ? batch.length : Number(result?.total || batch.length)
            all.push(...batch)
            if (Array.isArray(result) || batch.length < pageSize) break
            page += 1
        }

        return all
    }

    async function resolveMediaItems(context) {
        if (Array.isArray(context?.allMediaFiles) && context.allMediaFiles.length > 0) {
            return context.allMediaFiles.filter((media) => !media?.is_deleted)
        }
        const fetched = await fetchAllMedia()
        return fetched.filter((media) => !media?.is_deleted)
    }

    function splitCreatorNames(value) {
        return String(value || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    }

    function replaceCreatorName(value, currentName, nextName) {
        const names = splitCreatorNames(value)
        if (names.length === 0) return String(value || '').trim()

        const replaced = names.map((name) => (
            name === currentName ? (String(nextName || '').trim() || currentName) : name
        ))
        const deduped = []
        for (const name of replaced) {
            if (!name || deduped.includes(name)) continue
            deduped.push(name)
        }
        return deduped.join(', ')
    }

    function aggregateCreators(mediaItems, profiles) {
        const byName = new Map()

        for (const media of mediaItems) {
            const names = splitCreatorNames(media?.artist)
            for (const name of names) {
                const current = byName.get(name) || {
                    name,
                    count: 0,
                }
                current.count += 1
                byName.set(name, current)
            }
        }

        return Array.from(byName.values())
            .map((item) => ({
                name: item.name,
                count: item.count,
                nextName: item.name,
                nextUrl: String(profiles?.[item.name]?.url || ''),
            }))
            .sort((left, right) => left.name.localeCompare(right.name, locale === 'ja' ? 'ja' : 'en'))
    }

    function getFilteredCreators() {
        const query = String(state.search || '').trim().toLowerCase()
        if (!query) return state.creators
        return state.creators.filter((creator) => (
            creator.name.toLowerCase().includes(query) ||
            creator.nextName.toLowerCase().includes(query)
        ))
    }

    function getSelectedCreator() {
        if (!state.selectedCreatorName) return null
        return state.creators.find((creator) => creator.name === state.selectedCreatorName) || null
    }

    function getCreatorChanges(creator) {
        if (!creator) {
            return {
                nextName: '',
                nextUrl: '',
                hasNameChange: false,
                hasUrlChange: false,
                hasChanges: false,
            }
        }
        const nextName = String(creator.nextName || '').trim()
        const nextUrl = String(creator.nextUrl || '').trim()
        const savedUrl = String(creator.savedUrl || '').trim()
        const hasNameChange = !!nextName && nextName !== creator.name
        return {
            nextName: nextName || creator.name,
            nextUrl,
            hasNameChange,
            hasUrlChange: nextUrl !== savedUrl,
            hasChanges: hasNameChange || nextUrl !== savedUrl,
        }
    }

    function syncSelectedCreator() {
        if (state.selectedCreatorName && state.creators.some((creator) => creator.name === state.selectedCreatorName)) {
            return
        }
        state.selectedCreatorName = state.creators[0]?.name || ''
    }

    async function refreshCreators(context, options) {
        const libraryKey = getLibraryKeyFromContext(context)
        state.currentContext = context || state.currentContext
        state.libraryKey = libraryKey

        if (libraryKey === 'none') {
            state.creators = []
            state.mediaItems = []
            state.selectedCreatorName = ''
            state.status = text.noLibrary
            notifyPluginStateChanged()
            return
        }

        if (!options || !options.silent) {
            state.loading = true
            state.status = text.loading
            notifyPluginStateChanged()
        }

        try {
            const [mediaItems, profiles] = await Promise.all([
                resolveMediaItems(context),
                loadProfiles(libraryKey),
            ])
            state.mediaItems = mediaItems
            state.creators = aggregateCreators(mediaItems, profiles).map((creator) => ({
                ...creator,
                savedUrl: creator.nextUrl,
            }))
            state.status = ''
            syncSelectedCreator()
        } catch (error) {
            state.status = `${text.failed} ${error && error.message ? error.message : ''}`.trim()
        } finally {
            state.loading = false
            notifyPluginStateChanged()
        }
    }

    function updateSelectedCreator(field, value) {
        const creator = getSelectedCreator()
        if (!creator) return
        if (field === 'name') creator.nextName = value
        if (field === 'url') creator.nextUrl = value
        notifyPluginStateChanged()
    }

    async function applyCreator(creator) {
        if (!creator) return 0
        const changes = getCreatorChanges(creator)
        if (!changes.hasChanges) return 0

        const targets = state.mediaItems.filter((media) => splitCreatorNames(media?.artist).includes(creator.name))
        const profiles = await loadProfiles(state.libraryKey)

        if (changes.hasNameChange) {
            await Promise.all(targets.map((media) => window.ObscuraAPI.media.update(media.id, {
                artist: replaceCreatorName(media?.artist, creator.name, changes.nextName)
            })))
        }

        const previousProfile = profiles[creator.name] && typeof profiles[creator.name] === 'object' ? profiles[creator.name] : {}
        if (changes.nextUrl) {
            profiles[changes.nextName] = { ...previousProfile, url: changes.nextUrl }
        } else {
            delete profiles[changes.nextName]
        }
        if (changes.hasNameChange && creator.name !== changes.nextName) {
            delete profiles[creator.name]
        }
        await saveProfiles(state.libraryKey, profiles)

        return targets.length
    }

    async function saveChanges() {
        const changed = state.creators.filter((creator) => getCreatorChanges(creator).hasChanges)
        if (changed.length === 0) {
            state.status = text.unchanged
            notifyPluginStateChanged()
            return
        }

        const confirmation = await window.ObscuraAPI.ui.showMessageBox({
            type: 'question',
            title: text.title,
            message: text.confirmSave,
            buttons: ['OK', 'Cancel'],
        })
        if (confirmation?.response !== 0) return

        state.applying = true
        state.status = text.applying
        notifyPluginStateChanged()
        try {
            let updatedRows = 0
            for (const creator of changed) {
                updatedRows += await applyCreator(creator)
            }
            await refreshCreators(state.currentContext, { silent: true })
            state.status = `${text.applied} ${text.updatedRows}: ${updatedRows}`
        } catch (error) {
            state.status = `${text.failed} ${error && error.message ? error.message : ''}`.trim()
        } finally {
            state.applying = false
            notifyPluginStateChanged()
        }
    }
    function notifyPluginStateChanged(options) {
        const shouldNotifySidebar = Boolean(options && options.sidebar)
        const shouldRerenderMainView = options && Object.prototype.hasOwnProperty.call(options, 'main')
            ? Boolean(options.main)
            : true

        if (shouldNotifySidebar) {
            window.dispatchEvent(new Event('plugin-registered'))
        }
        if (shouldRerenderMainView) {
            for (const render of Array.from(state.mountDisposers)) {
                if (typeof render === 'function') {
                    render()
                }
            }
        }
    }

    function captureListScroll(container) {
        const list = container ? container.querySelector('.creator-manager-list') : null
        if (list) {
            state.listScrollTop = list.scrollTop
        }
    }

    function restoreListScroll(container) {
        const list = container ? container.querySelector('.creator-manager-list') : null
        if (!list) return
        const applyScroll = () => {
            list.scrollTop = state.listScrollTop
        }
        applyScroll()
        requestAnimationFrame(applyScroll)
    }

    function captureFocusedField(container) {
        const activeElement = document.activeElement
        if (!container || !activeElement || !container.contains(activeElement)) {
            return null
        }
        const field = activeElement.getAttribute && (
            activeElement.getAttribute('data-field') ||
            (activeElement.hasAttribute('data-search-input') ? '__search__' : '')
        )
        if (!field) {
            return null
        }
        return {
            field,
            selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
            selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null,
        }
    }

    function restoreFocusedField(container, focusedField) {
        if (!focusedField) return
        const selector = focusedField.field === '__search__'
            ? '[data-search-input]'
            : `[data-field="${focusedField.field}"]`
        const input = container ? container.querySelector(selector) : null
        if (!input || typeof input.focus !== 'function') return
        const applySelection = () => {
            input.focus()
            if (typeof input.setSelectionRange === 'function' && focusedField.selectionStart !== null && focusedField.selectionEnd !== null) {
                input.setSelectionRange(focusedField.selectionStart, focusedField.selectionEnd)
            }
        }
        applySelection()
        requestAnimationFrame(applySelection)
    }

    function renderMainView(container, context, rerender) {
        const creators = getFilteredCreators()
        const selectedCreator = getSelectedCreator()
        const canApplyCurrent = !!selectedCreator && getCreatorChanges(selectedCreator).hasChanges && !state.applying
        const hasAnyChanges = state.creators.some((creator) => getCreatorChanges(creator).hasChanges)
        captureListScroll(container)
        const focusedField = captureFocusedField(container)

        container.innerHTML = `
            <div class="creator-manager-screen">
                <div class="creator-manager-topbar">
                    <div class="creator-manager-topbar-title">
                        <div class="creator-manager-topbar-title-main">${escapeHtml(text.title)}</div>
                        <div class="creator-manager-topbar-title-sub">${escapeHtml(text.subtitle)}</div>
                    </div>
                    <button class="creator-manager-button secondary" data-close-view>${escapeHtml(text.close)}</button>
                </div>
                <div class="creator-manager-content">
                <section class="creator-manager-main">
                    <div class="creator-manager-main-header">
                        <h2 class="creator-manager-main-title">${escapeHtml(text.title)}</h2>
                        <p class="creator-manager-main-subtitle">${escapeHtml(text.urlHint)}</p>
                    </div>
                    <div class="creator-manager-main-body">
                        ${renderEditor(selectedCreator, canApplyCurrent, hasAnyChanges)}
                    </div>
                </section>
                <aside class="creator-manager-sidebar">
                    <div class="creator-manager-sidebar-header">
                        <h2 class="creator-manager-sidebar-title">${escapeHtml(text.creators)}</h2>
                        <p class="creator-manager-sidebar-subtitle">${escapeHtml(resolveStatusText())}</p>
                    </div>
                    <div class="creator-manager-toolbar">
                        <input class="creator-manager-search" data-search-input placeholder="${escapeHtmlAttr(text.searchPlaceholder)}" value="${escapeHtmlAttr(state.search)}" />
                        <button class="creator-manager-button secondary" data-reload ${state.loading || state.applying ? 'disabled' : ''}>${escapeHtml(text.reload)}</button>
                    </div>
                    <div class="creator-manager-list">
                        ${renderCreatorList(creators)}
                    </div>
                </aside>
                </div>
            </div>
        `

        const searchInput = container.querySelector('[data-search-input]')
        const reloadButton = container.querySelector('[data-reload]')
        const saveButton = container.querySelector('[data-save]')
        const closeButton = container.querySelector('[data-close-view]')
        const nameInput = container.querySelector('[data-field="name"]')
        const urlInput = container.querySelector('[data-field="url"]')
        const creatorList = container.querySelector('.creator-manager-list')

        if (creatorList) {
            restoreListScroll(container)
            creatorList.addEventListener('scroll', () => {
                state.listScrollTop = creatorList.scrollTop
            })
        }
        restoreFocusedField(container, focusedField)

        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                captureListScroll(container)
                state.search = String(event.target && event.target.value ? event.target.value : '')
                rerender()
            })
        }
        if (reloadButton) {
            reloadButton.addEventListener('click', () => {
                void refreshCreators(context)
            })
        }
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                void saveChanges()
            })
        }
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                window.ObscuraAPI.ui.closeMainView()
            })
        }
        if (nameInput) {
            nameInput.addEventListener('input', (event) => {
                captureListScroll(container)
                updateSelectedCreator('name', String(event.target && event.target.value ? event.target.value : ''))
                rerender()
            })
        }
        if (urlInput) {
            urlInput.addEventListener('input', (event) => {
                captureListScroll(container)
                updateSelectedCreator('url', String(event.target && event.target.value ? event.target.value : ''))
                rerender()
            })
        }
        for (const button of container.querySelectorAll('[data-select-creator]')) {
            button.addEventListener('click', () => {
                captureListScroll(container)
                state.selectedCreatorName = button.getAttribute('data-select-creator') || ''
                rerender()
            })
        }
    }

    function renderCreatorList(creators) {
        if (state.libraryKey === 'none') {
            return `<div class="creator-manager-empty">${escapeHtml(text.noLibrary)}</div>`
        }
        if (state.loading) {
            return `<div class="creator-manager-empty">${escapeHtml(text.loading)}</div>`
        }
        if (creators.length === 0) {
            return `<div class="creator-manager-empty">${escapeHtml(text.empty)}</div>`
        }

        return creators.map((creator) => `
            <div class="creator-manager-list-item ${creator.name === state.selectedCreatorName ? 'active' : ''}" data-select-creator="${escapeHtmlAttr(creator.name)}">
                <span class="creator-manager-list-item-name">${escapeHtml(creator.name)}</span>
                <span class="creator-manager-count">${creator.count}</span>
            </div>
        `).join('')
    }

    function renderEditor(selectedCreator, _canApplyCurrent, hasAnyChanges) {
        if (state.libraryKey === 'none') {
            return `<div class="creator-manager-empty">${escapeHtml(text.noLibrary)}</div>`
        }
        if (state.loading) {
            return `<div class="creator-manager-empty">${escapeHtml(text.loading)}</div>`
        }
        if (!selectedCreator) {
            return `<div class="creator-manager-empty">${escapeHtml(text.selectCreator)}</div>`
        }

        return `
            <div class="creator-manager-form">
                <div class="creator-manager-field">
                    <label>${escapeHtml(text.renameLabel)}</label>
                    <input class="creator-manager-input" data-field="name" value="${escapeHtmlAttr(selectedCreator.nextName)}" />
                </div>
                <div class="creator-manager-field">
                    <label>${escapeHtml(text.urlLabel)}</label>
                    <input class="creator-manager-input" data-field="url" value="${escapeHtmlAttr(selectedCreator.nextUrl)}" />
                    <div class="creator-manager-hint">${escapeHtml(text.urlHint)}</div>
                </div>
                <div class="creator-manager-field">
                    <label>${escapeHtml(text.mediaCount)}</label>
                    <div class="creator-manager-hint">${selectedCreator.count}</div>
                </div>
                <div class="creator-manager-actions">
                    <button class="creator-manager-button" data-save ${hasAnyChanges && !state.applying ? "" : "disabled"}>${escapeHtml(text.save)}</button>
                </div>
            </div>
        `
    }

    function resolveStatusText() {
        if (state.status) return state.status
        if (state.libraryKey === 'none') return text.noLibrary
        return `${text.creators}: ${state.creators.length}`
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function escapeHtmlAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;')
    }

    function handlePluginMainViewChanged(event) {
        const detail = event && event.detail ? event.detail : null
        state.mainViewOpen = !!detail && detail.pluginId === PLUGIN_ID && detail.viewId === VIEW_ID
        notifyPluginStateChanged({ sidebar: true, main: true })
    }

    ensureStyles()

    window.addEventListener('obscura:plugin-main-view-changed', handlePluginMainViewChanged)
    state.listeners.push(() => {
        window.removeEventListener('obscura:plugin-main-view-changed', handlePluginMainViewChanged)
    })

    window.ObscuraAPI.registerPlugin({
        id: PLUGIN_ID,
        name: text.title,
        uiHooks: {
            sidebarItems: () => [{
                id: 'creator-manager-sidebar',
                label: text.sidebarLabel,
                icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
                location: 'after-tags',
                isActive: state.mainViewOpen,
                onClick: () => {
                    window.ObscuraAPI.ui.openMainView(PLUGIN_ID, VIEW_ID)
                }
            }],
            mainViews: (context) => [{
                id: VIEW_ID,
                title: text.title,
                mount: ({ container }) => {
                    state.currentContext = context
                    const render = () => renderMainView(container, context, render)
                    render.__creatorManagerRender = true
                    state.mountDisposers.add(render)
                    void refreshCreators(context).then(render)
                    render()
                    return () => {
                        state.mountDisposers.delete(render)
                        container.innerHTML = ''
                    }
                }
            }]
        }
    })

    window[GLOBAL_KEY] = {
        cleanup,
    }
})()

