// Shared app shell: injects the sidebar (Email Marketing > SmartPing > TerraTern >
// sub-pages) and a mobile topbar around whatever a page already has in <body>.
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

  function sidebarHTML() {
    const path = window.location.pathname;
    const links = NAV.map(n => {
      const active = path === n.href ? ' active' : '';
      return `<a href="${n.href}" class="shell-link${active}"><span class="shell-icon">${n.icon}</span><span>${n.label}</span></a>`;
    }).join('');
    return `
      <div class="shell-brand">
        <img src="https://terratern.com/images/favicon_192.png" alt="TerraTern"/>
        <div>
          <div class="shell-brand-name">Email Marketing</div>
          <div class="shell-brand-sub">SmartPing</div>
        </div>
      </div>
      <div class="shell-crumb">Account</div>
      <div class="shell-tree-brand">
        <span class="shell-tree-brand-dot"></span>
        <span class="shell-tree-brand-name">TerraTern</span>
      </div>
      <nav class="shell-nav">${links}</nav>
      <div class="shell-footer">
        <div class="shell-status" id="shell-engine-status"><span class="dot"></span><span>Checking status…</span></div>
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

    function toggleSidebar(open) {
      sidebar.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
    }
    document.getElementById('shell-hamburger').addEventListener('click', () => toggleSidebar(!sidebar.classList.contains('open')));
    overlay.addEventListener('click', () => toggleSidebar(false));

    const theme = (function () { try { return localStorage.getItem('theme') || 'light'; } catch (e) { return 'light'; } })();
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
