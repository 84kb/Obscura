/**
 * Obscura Documentation App Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const data = window.OBSCURA_API_DATA;
    const jsApiNav = document.getElementById('js-api-nav');
    const restApiNav = document.getElementById('rest-api-nav');
    const contentArea = document.getElementById('content-area');
    const searchInput = document.getElementById('api-search');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    const tocList = document.getElementById('toc-list');
    const homeLink = document.querySelector('.nav-link[href="#introduction"]');

    // 1. Render Navigation
    renderNav(jsApiNav, data.jsApi, 'js-api');
    renderNav(restApiNav, data.restApi, 'rest-api');

    // 2. Handle Navigation Clicks
    window.showSection = (id) => {
        const [type, index] = id.split(/-(?=\d)/);
        const idx = parseInt(index);
        const items = type === 'js-api' ? data.jsApi : data.restApi;
        const item = items[idx];

        if (!item) return;

        // Update active class in nav
        document.querySelectorAll('.nav-link, .sub-nav-link').forEach(el => el.classList.remove('active'));
        const navLink = document.querySelector(`[onclick="showSection('${id}')"]`);
        if (navLink) navLink.classList.add('active');

        // Update Breadcrumb
        breadcrumbCurrent.textContent = item.name || item.path;

        // Render Content
        renderContent(item, type);

        // Update TOC
        generateTOC();

        // Update TOC
        generateTOC();

        // Scroll to top
        window.scrollTo(0, 0);

        // Update URL hash without jumping
        history.pushState(null, null, `#${id}`);
    };

    function renderNav(container, items, typePrefix) {
        items.forEach((item, index) => {
            const li = document.createElement('li');
            const id = `${typePrefix}-${index}`;

            let label = '';
            let badge = '';

            if (typePrefix === 'js-api') {
                label = item.name.replace('window.ObscuraAPI.', '').replace('ObscuraAPI.', '');
            } else {
                // For REST API, use the friendly label (e.g., "Add tags", "Get item info")
                label = item.label;
                const methodClass = item.method.toLowerCase();
                badge = `<span class="nav-method-badge ${methodClass}">${item.method}</span>`;
            }

            li.innerHTML = `
                <a href="javascript:void(0)" class="nav-link sub-nav-link" onclick="showSection('${id}')">
                    ${badge}
                    <span class="nav-label-text">${label}</span>
                </a>
            `;
            container.appendChild(li);
        });
    }

    function renderContent(item, type) {
        let html = '';
        if (type === 'js-api') {
            html = `
                <div class="api-content">
                    <span class="type-tag">Plugin JS API</span>
                    <h1>${item.name}</h1>
                    <p class="lead">${item.description}</p>
                    
                    <h3>利用例</h3>
                    <div class="code-container">
                        <button class="copy-btn" onclick="copyCode(this)">コピー</button>
                        <pre class="language-javascript"><code class="language-javascript">${formatCode(item.example, 'javascript')}</code></pre>
                    </div>
                </div>
            `;
        } else {
            const paramsHtml = item.params && item.params.length > 0 ? `
                <h2 id="params">パラメーター</h2>
                <table class="param-table">
                    <thead>
                        <tr>
                            <th>名前</th>
                            <th>型</th>
                            <th>説明</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.params.map(p => `
                            <tr>
                                <td><code>${p.name}</code>${p.required ? '<span class="required">*</span>' : ''}</td>
                                <td><span class="type-badge">${p.type}</span></td>
                                <td>${p.desc}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<p>パラメーターは不要です。</p>';

            html = `
                <div class="api-content">
                    <span class="type-tag">REST API Reference</span>
                    <div class="title-row">
                        <span class="method-badge ${item.method.toLowerCase()}">${item.method}</span>
                        <h1>${item.path}</h1>
                    </div>
                    <p class="label-text" style="font-weight: 600; font-size: 1.2rem; margin-bottom: 8px;">${item.label}</p>
                    <p class="lead">${item.description}</p>

                    <div class="info-card" style="margin-top: 20px;">
                        <p><strong>権限レベル:</strong> <code>${item.permission || 'none'}</code></p>
                    </div>

                    ${paramsHtml}

                    <h2 id="example">リクエスト例</h2>
                    <div class="code-container">
                        <button class="copy-btn" onclick="copyCode(this)">コピー</button>
                        <pre class="language-bash"><code class="language-bash">${formatCode(`curl -X ${item.method} "http://localhost:8765${item.path.replace(':id', '1')}" \\
  -H "Authorization: Bearer YOUR_SECRET"`, 'bash')}</code></pre>
                    </div>
                </div>
            `;
        }
        contentArea.innerHTML = html;
    }

    // TOC Generation
    function generateTOC() {
        tocList.innerHTML = '';
        const headers = contentArea.querySelectorAll('h1, h2');
        headers.forEach((header, index) => {
            if (!header.id) {
                header.id = `section-${index}`;
            }
            const li = document.createElement('li');
            li.className = 'toc-item';
            const indent = header.tagName === 'H2' ? 'padding-left: 12px; font-size: 0.75rem;' : '';
            li.innerHTML = `<a href="#${header.id}" class="toc-link" style="${indent}">${header.textContent}</a>`;
            tocList.appendChild(li);
        });

        // Add scroll behavior for TOC links
        document.querySelectorAll('.toc-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const target = document.getElementById(targetId);
                if (target) {
                    const headerOffset = 100;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                }
            });
        });
    }

    // 3. Search Logic
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const allLinks = document.querySelectorAll('.sub-nav-link');

        allLinks.forEach(link => {
            const text = link.textContent.toLowerCase();
            const parentLi = link.parentElement;
            if (text.includes(query)) {
                parentLi.style.display = 'block';
            } else {
                parentLi.style.display = 'none';
            }
        });
    });

    // 4. Utility Functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatCode(code, lang) {
        if (!window.Prism) return `<span class="code-line">${escapeHtml(code)}</span>`;
        if (!Prism.languages[lang]) return `<span class="code-line">${escapeHtml(code)}</span>`;

        // Highlight the whole block first
        const highlighted = Prism.highlight(code, Prism.languages[lang], lang);

        // Split by newlines and wrap each line
        // We use span instead of div for better compatibility inside pre
        return highlighted.split('\n').map(line => `<span class="code-line">${line || ' '}</span>`).join('\n');
    }

    const introHtml = contentArea.innerHTML; // Store original intro

    window.copyCode = (btn) => {
        const pre = btn.nextElementSibling;
        const code = Array.from(pre.querySelectorAll('.code-line'))
            .map(line => line.textContent)
            .join('\n');
        navigator.clipboard.writeText(code).then(() => {
            const originalText = btn.textContent;
            btn.textContent = '完了';
            btn.style.color = '#2ecc71';
            btn.style.borderColor = '#2ecc71';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.color = '';
                btn.style.borderColor = '';
            }, 2000);
        });
    };

    // 5. Initial state / Hash Handling
    const hash = window.location.hash.substring(1);
    if (hash && (hash.startsWith('js-api') || hash.startsWith('rest-api'))) {
        showSection(hash);
    } else {
        generateTOC(); // Generate TOC for intro
    }

    // Handle home link
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        contentArea.innerHTML = `
            <div id="introduction">
                <h1>概要</h1>
                <p class="lead">本ドキュメントは、Obscura Plugin APIを使用して拡張機能を開発したい開発者にわかりやすいガイドを提供することを目的としています。詳細な説明を提供し、APIの使用方法を理解しやすくします。 また、多くのサンプルコードも提供し、学習を容易にします。</p>
                
                <p>Obscura Plugin APIへようこそ！APIを使って、開発者は簡単にObscuraアプリケーションの機能を拡張できます。オープンなAPIを提供することで、開発者により創造的な空間を提供し、Obscuraアプリケーションのプラグインエコシステムを豊かにすることを目指しています。</p>

                <h2 id="feature-1">Obscura Plugin APIでできること</h2>
                <div class="feature-list">
                    <div class="feature-item">
                        <h4>1. メディアアイテムの取得と操作</h4>
                        <p>ライブラリ内のメディア、評価、アーティスト情報などを取得し、自動的なタグ付けやメタデータの更新が行えます。</p>
                    </div>
                    <div class="feature-item">
                        <h4>2. ユーザーインターフェースの拡張</h4>
                        <p>インスペクターパネルへのボタン追加や、プレイヤー画面への独自の情報の表示（オーバーレイ）などが可能です。</p>
                    </div>
                    <div class="feature-item">
                        <h4>3. システム機能の利用</h4>
                        <p>外部サイトからのデータ取得（CORS回避済み）、ファイルシステムの操作、通知の表示などのOSネイティブに近い機能が利用できます。</p>
                    </div>
                </div>

                <h2 id="auth-info">認証について</h2>
                <div class="info-card">
                    <p>REST APIのリクエストには <code>Authorization</code> ヘッダーが必要です。Host Secretは、Obscuraアプリの「設定 > 開発者ツール」から取得できます。</p>
                    <div class="code-container" style="margin-top: 12px;">
                        <button class="copy-btn" onclick="copyCode(this)">コピー</button>
                        <pre class="language-bash"><code class="language-bash">${formatCode('Authorization: Bearer [Host Secret]', 'bash')}</code></pre>
                    </div>
                </div>

                <h2 id="quickstart">クイックスタート</h2>
                <div class="grid">
                    <div class="card">
                        <span class="card-tag">REFERENCE</span>
                        <h4>Plugin JS API</h4>
                        <p>UIの拡張や内部データの操作に。JavaScriptで記述します。</p>
                        <a href="javascript:void(0)" onclick="showSection('js-api-0')">API一覧を見る</a>
                    </div>
                    <div class="card">
                        <span class="card-tag">ENDPOINT</span>
                        <h4>REST API</h4>
                        <p>外部サービスやスクリプトからの連携に。HTTP経由で操作します。</p>
                        <a href="javascript:void(0)" onclick="showSection('rest-api-0')">エンドポイントを見る</a>
                    </div>
                </div>
            </div>
        `;
        document.querySelectorAll('.nav-link, .sub-nav-link').forEach(el => el.classList.remove('active'));
        homeLink.classList.add('active');
        breadcrumbCurrent.textContent = '概要';
        generateTOC();
        window.scrollTo(0, 0);
        history.pushState(null, null, '#');
    });
});
