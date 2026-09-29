// Shared app shell: injects the sidebar (Email Drip Marketing > TerraTern-SmartPing >
// TerraTern [expandable] > sub-pages) and a mobile topbar around whatever a page
// already has in <body>.
// Include with: <link rel="stylesheet" href="/shell.css"> + <script src="/shell.js" defer></script>
// Each page keeps its own markup/JS untouched — this just wraps it in a shell.
(function () {
  const NAV = [
    { label: 'Dashboard', href: '/home.html', icon: '🏠' },
    { label: 'Automation', href: '/email-automation.html', icon: '🔁' },
    { label: 'Campaigns', href: '/compose.html', icon: '📋' },
    { label: 'Analytics', href: '/analytics.html', icon: '📈' },
    { label: 'Contacts', href: '/contacts.html', icon: '👥' },
  ];

  function getPref(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function setPref(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function sidebarHTML() {
    const path = window.location.pathname;
    const links = NAV.map(n => {
      const active = path === n.href ? ' active' : '';
      return `<a href="${n.href}" class="shell-link${active}"><span class="shell-icon">${n.icon}</span><span>${n.label}</span></a>`;
    }).join('');
    const treeOpen = getPref('shell-tree-open', '1') !== '0';
    return `
      <div class="shell-brand">
        <img src="https://terratern.com/images/favicon_192.png" alt="TerraTern"/>
        <div class="shell-brand-text">
          <div class="shell-brand-name">Marketing CRM</div>
          <div class="shell-brand-sub">TerraTern-SmartPing</div>
        </div>
      </div>
      <div class="shell-tree">
        <button class="shell-tree-toggle" id="shell-tree-toggle" type="button" aria-expanded="${treeOpen}">
          <span class="shell-tree-dot"></span>
          <span class="shell-tree-name">SmartPing x TerraTern</span>
          <span class="shell-chevron${treeOpen ? ' rot' : ''}">▶</span>
        </button>
        <nav class="shell-nav${treeOpen ? '' : ' collapsed'}" id="shell-nav">${links}</nav>
      </div>
      <div class="shell-footer">
        <div class="shell-status" id="shell-engine-status"><span class="dot"></span><span>Checking status…</span></div>
        <button class="shell-collapse-btn" id="shell-collapse-btn" type="button" aria-label="Collapse sidebar">«</button>
      </div>`;
  }

  function pageTitle() {
    const t = document.title || 'TerraTern';
    return t.split('—')[0].trim();
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
  }

  function init() {
    // Move all existing body content into a wrapper so the sidebar can sit
    // beside it without touching the page's own markup/IDs/scripts.
    const existing = Array.from(document.body.childNodes);
    const wrapper = document.createElement('div');
    wrapper.className = 'app-main';
    existing.forEach(node => wrapper.appendChild(node));

    const sidebar = document.createElement('aside');
    sidebar.className = 'shell-sidebar';
    sidebar.id = 'shell-sidebar';
    if (getPref('shell-collapsed', '0') === '1') sidebar.classList.add('collapsed');
    sidebar.innerHTML = sidebarHTML();

    const overlay = document.createElement('div');
    overlay.className = 'shell-overlay';
    overlay.id = 'shell-overlay';

    const topbar = document.createElement('div');
    topbar.className = 'shell-topbar';
    topbar.innerHTML = `
      <button class="shell-hamburger" id="shell-hamburger" aria-label="Menu">☰</button>
      <div class="shell-topbar-title">${pageTitle()}</div>
      <button class="shell-theme-btn" id="shell-theme-btn">🌙</button>`;

    document.body.appendChild(sidebar);
    document.body.appendChild(overlay);
    document.body.appendChild(topbar);
    document.body.appendChild(wrapper);

    function toggleMobileSidebar(open) {
      sidebar.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
    }
    document.getElementById('shell-hamburger').addEventListener('click', () => toggleMobileSidebar(!sidebar.classList.contains('open')));
    overlay.addEventListener('click', () => toggleMobileSidebar(false));

    // Desktop collapse/expand — shrinks the sidebar to an icon rail.
    document.getElementById('shell-collapse-btn').addEventListener('click', () => {
      const collapsed = sidebar.classList.toggle('collapsed');
      setPref('shell-collapsed', collapsed ? '1' : '0');
    });

    // TerraTern tree expand/collapse — shows/hides the page links under it.
    const treeToggle = document.getElementById('shell-tree-toggle');
    const treeNav = document.getElementById('shell-nav');
    treeToggle.addEventListener('click', () => {
      const nowOpen = treeNav.classList.toggle('collapsed') === false;
      treeToggle.querySelector('.shell-chevron').classList.toggle('rot', nowOpen);
      treeToggle.setAttribute('aria-expanded', String(nowOpen));
      setPref('shell-tree-open', nowOpen ? '1' : '0');
    });

    const theme = getPref('theme', 'light');
    applyTheme(theme);
    document.getElementById('shell-theme-btn').textContent = theme === 'dark' ? '☀️' : '🌙';
    document.getElementById('shell-theme-btn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      document.getElementById('shell-theme-btn').textContent = next === 'dark' ? '☀️' : '🌙';
    });

    // Best-effort engine status pill in the sidebar footer, using the same
    // health/automation-status endpoints the pages themselves poll.
    fetch('/api/email/automation/status').then(r => r.json()).then(d => {
      const el = document.getElementById('shell-engine-status');
      const status = (d.state && d.state.status) || 'stopped';
      el.className = 'shell-status' + (status === 'running' ? '' : ' down');
      el.querySelector('span:last-child').textContent = 'Engine: ' + status;
    }).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
