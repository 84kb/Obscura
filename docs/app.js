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

        // Scroll to top
        window.scrollTo(0, 0);

        // Update URL hash without jumping
        history.pushState(null, null, `#${id}`);
    };

    function renderNav(container, items, typePrefix) {
        items.forEach((item, index) => {
            const li = document.createElement('li');
            const id = `${typePrefix}-${index}`;
            const label = item.name || `${item.method} ${item.path}`;
            li.innerHTML = `<a href="javascript:void(0)" class="nav-link sub-nav-link" onclick="showSection('${id}')">${label}</a>`;
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
                    <p class="description">${item.description}</p>
                    
                    <h3>Code Example</h3>
                    <div class="code-container">
                        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                        <pre><code>${escapeHtml(item.example)}</code></pre>
                    </div>
                </div>
            `;
        } else {
            const paramsHtml = item.params && item.params.length > 0 ? `
                <h3>Parameters</h3>
                <table class="param-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Description</th>
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
            ` : '<p>No parameters required.</p>';

            html = `
                <div class="api-content">
                    <span class="type-tag">REST API</span>
                    <div class="title-row">
                        <span class="method-badge ${item.method.toLowerCase()}">${item.method}</span>
                        <h1>${item.path}</h1>
                    </div>
                    <p class="label-text">${item.label}</p>
                    <p class="description">${item.description}</p>

                    <div class="info-card" style="margin-top: 20px;">
                        <strong>Permission:</strong> <code>${item.permission || 'none'}</code>
                    </div>

                    ${paramsHtml}

                    <h3>Example Request</h3>
                    <div class="code-container">
                        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                        <pre><code>curl -X ${item.method} "http://localhost:8765${item.path.replace(':id', '1')}" \\
  -H "Authorization: Bearer YOUR_SECRET"</code></pre>
                    </div>
                </div>
            `;
        }
        contentArea.innerHTML = html;
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

    window.copyCode = (btn) => {
        const pre = btn.nextElementSibling;
        const code = pre.textContent;
        navigator.clipboard.writeText(code).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.background = '#2ecc71';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        });
    };

    // 5. Initial state / Hash Handling
    const hash = window.location.hash.substring(1);
    if (hash) {
        showSection(hash);
    } else {
        // Show intro by default
        const intro = document.getElementById('introduction');
        if (intro) {
            // Intro is already there, make sure nav reflects it
            document.querySelector('.nav-link[href="#introduction"]').classList.add('active');
        }
    }

    // Handle home link
    document.querySelector('.nav-link[href="#introduction"]').addEventListener('click', (e) => {
        e.preventDefault();
        contentArea.innerHTML = `
            <div id="introduction">
                <h1>Obscura Plugin API</h1>
                <p class="lead">Obscuraの機能を拡張し、メディアとの対話を自動化するためのAPIドキュメント。 JavaScript Plugin APIとREST APIの両方を提供しています。</p>
                
                <div class="info-card">
                    <h3>認証について</h3>
                    <p>REST APIのリクエストには <code>Authorization</code> ヘッダーが必要です。</p>
                    <pre><code>Authorization: Bearer [Host Secret]</code></pre>
                    <p>Host Secretは、Obscuraアプリの「設定 > 開発者ツール」から確認・取得できます。</p>
                </div>

                <h2>クイックスタート</h2>
                <div class="grid">
                    <div class="card">
                        <h4>Plugin JS API</h4>
                        <p>アプリのUIを拡張したり、内部データを操作します。<code>.js</code>ファイルをプラグインフォルダに配置するだけで動作します。</p>
                        <a href="javascript:void(0)" onclick="showSection('js-api-0')">リファレンスを見る</a>
                    </div>
                    <div class="card">
                        <h4>REST API</h4>
                        <p>外部ツールや自作スクリプトからHTTPリクエスト経由でObscuraを操作します。</p>
                        <a href="javascript:void(0)" onclick="showSection('rest-api-0')">エンドポイント一覧</a>
                    </div>
                </div>
            </div>
        `;
        document.querySelectorAll('.nav-link, .sub-nav-link').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        breadcrumbCurrent.textContent = 'はじめに';
        history.pushState(null, null, '#');
    });
});
