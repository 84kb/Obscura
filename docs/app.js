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
            // Remove full window/ObscuraAPI prefix for sidebar to keep it clean
            const shortLabel = label.replace('window.ObscuraAPI.', '').replace('ObscuraAPI.', '');
            li.innerHTML = `<a href="javascript:void(0)" class="nav-link sub-nav-link" onclick="showSection('${id}')">${shortLabel}</a>`;
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
                    
                    <h2 id="example">利用例</h2>
                    <div class="code-container">
                        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                        <pre><code>${escapeHtml(item.example)}</code></pre>
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
                        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                        <pre><code>curl -X ${item.method} "http://localhost:8765${item.path.replace(':id', '1')}" \\
  -H "Authorization: Bearer YOUR_SECRET"</code></pre>
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

    const introHtml = contentArea.innerHTML; // Store original intro

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
    if (hash && (hash.startsWith('js-api') || hash.startsWith('rest-api'))) {
        showSection(hash);
    } else {
        generateTOC(); // Generate TOC for intro
    }

    // Handle home link
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        contentArea.innerHTML = introHtml;
        document.querySelectorAll('.nav-link, .sub-nav-link').forEach(el => el.classList.remove('active'));
        homeLink.classList.add('active');
        breadcrumbCurrent.textContent = '概要';
        generateTOC();
        window.scrollTo(0, 0);
        history.pushState(null, null, '#');
    });
});
