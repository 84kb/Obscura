// @id extensibility-demo
// @name 拡張APIデモ
// @description サイドバー・ヘッダー・インスペクタ・インポートフックの新しい拡張APIを確認するためのサンプルです。
// @version 1.0.0
// @author Obscura
(function () {
    if (!window.ObscuraAPI) return

    const locale = (() => {
        try {
            const raw = localStorage.getItem('tauri_client_config')
            const parsed = raw ? JSON.parse(raw) : null
            return parsed?.language === 'en' ? 'en' : 'ja'
        } catch {
            return 'ja'
        }
    })()

    const t = (ja, en) => locale === 'en' ? en : ja

    const ensureStyles = () => {
        if (document.getElementById('extensibility-demo-style')) return
        const style = document.createElement('style')
        style.id = 'extensibility-demo-style'
        style.textContent = `
.ext-demo-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
}
.ext-demo-card {
    border: 1px solid var(--border-color, rgba(255,255,255,0.1));
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--bg-card, rgba(255,255,255,0.03));
}
.ext-demo-card strong {
    display: block;
    margin-bottom: 6px;
}
.ext-demo-card small {
    color: var(--text-muted, #9ca3af);
}
        `
        document.head.appendChild(style)
    }

    ensureStyles()

    window.ObscuraAPI.registerPlugin({
        id: 'extensibility-demo',
        name: t('拡張APIデモ', 'Extensibility Demo'),
        uiHooks: {
            sidebarItems: (context) => [
                {
                    id: 'sidebar-demo',
                    label: t('拡張API', 'Extension API'),
                    location: 'after-tags',
                    count: context.folders.length,
                    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M2 12h20"/></svg>',
                    onClick: async () => {
                        window.ObscuraAPI.ui.showNotification({
                            title: t('拡張API', 'Extension API'),
                            description: t('サイドバー拡張が動作しています。', 'Sidebar extension is active.'),
                        })
                    },
                },
            ],
            headerButtons: () => [
                {
                    id: 'header-demo',
                    label: t('デモ', 'Demo'),
                    location: 'right',
                    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
                    onClick: async () => {
                        const tags = await window.ObscuraAPI.tags.list()
                        window.ObscuraAPI.ui.showNotification({
                            title: t('ヘッダーボタン', 'Header Button'),
                            description: t(`タグ数: ${tags.length}`, `Tags: ${tags.length}`),
                        })
                    },
                },
            ],
            inspectorSectionBlocks: (context) => context.media.length === 1 ? [
                {
                    id: 'info-demo',
                    sectionId: 'info',
                    title: t('プラグイン情報', 'Plugin Info'),
                    mount: ({ container }) => {
                        container.innerHTML = `
                            <div class="ext-demo-panel">
                                <div class="ext-demo-card">
                                    <strong>${t('現在の選択', 'Current Selection')}</strong>
                                    <small>${context.media[0].file_name}</small>
                                </div>
                            </div>
                        `
                    },
                },
            ] : [],
            inspectorSections: (context) => context.media.length > 0 ? [
                {
                    id: 'custom-demo',
                    title: t('デモセクション', 'Demo Section'),
                    order: 200,
                    mount: ({ container }) => {
                        container.innerHTML = `
                            <div class="ext-demo-panel">
                                <div class="ext-demo-card">
                                    <strong>${t('選択数', 'Selection Count')}</strong>
                                    <small>${context.media.length}</small>
                                </div>
                            </div>
                        `
                    },
                },
            ] : [],
        },
        hooks: {
            beforeImport: async (context) => {
                console.log('[ExtensibilityDemo] beforeImport', context)
            },
            afterImport: async (context) => {
                if (!context.importedMedia?.length) return
                window.ObscuraAPI.ui.showNotification({
                    title: t('インポート完了', 'Import Completed'),
                    description: t(
                        `${context.importedMedia.length} 件のインポート後フックが実行されました。`,
                        `After-import hook ran for ${context.importedMedia.length} item(s).`,
                    ),
                })
            },
        },
    })
})()
