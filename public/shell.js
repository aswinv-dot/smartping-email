// Shared app shell: injects the sidebar (Marketing CRM > expandable product
// groups > their pages) and a mobile topbar around whatever a page already
// has in <body>.
// Include with: <link rel="stylesheet" href="/shell.css"> + <script src="/shell.js" defer></script>
// Each page keeps its own markup/JS untouched — this just wraps it in a shell.
(function () {
  const GROUPS = [
    {
      id: 'email',
      name: 'Email x SmartPing',
      links: [
        { label: 'Dashboard', href: '/home.html', icon: '🏠' },
        { label: 'Automation', href: '/email-automation.html', icon: '🔁' },
        { label: 'Campaigns', href: '/compose.html', icon: '📋' },
        { label: 'Analytics', href: '/analytics.html', icon: '📈' },
        { label: 'Contacts', href: '/contacts.html', icon: '👥' },
      ],
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp x SmartPing',
      links: [
        { label: 'Automation', href: '/wa-automation.html', icon: '⚙️' },
        { label: 'Schedules', href: '/wa-schedule.html', icon: '🗓' },
        { label: 'Campaigns', href: '/wa-campaigns.html', icon: '📋' },
        { label: "Today's Runs", href: '/wa-today.html', icon: '📅' },
        { label: 'Manual Send', href: '/wa-manual.html', icon: '▶' },
        { label: 'Rules', href: '/wa-rules.html', icon: '⚙' },
        { label: 'Dashboard', href: '/wa-dashboard.html', icon: '📊' },
        { label: 'Send Test', href: '/wa-sendtest.html', icon: '🧪' },
      ],
    },
    {
      id: 'capi',
      name: 'Meta Ads x CAPI',
      links: [
        { label: 'Dashboard', href: '/capi-dashboard.html', icon: '📊' },
      ],
    },
    {
      id: 'linktree',
      name: 'Social Media x Linktree',
      links: [
        { label: 'Linktree', href: '/linktree.html', icon: '🔗' },
      ],
    },
  ];

  function getPref(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function setPref(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function groupHTML(group) {
    const path = window.location.pathname;
    const links = group.links.map(n => {
      const active = path === n.href ? ' active' : '';
      return `<a href="${n.href}" class="shell-link${active}"><span class="shell-icon">${n.icon}</span><span>${n.label}</span></a>`;
    }).join('');
    const hasActive = group.links.some(n => n.href === path);
    const openPref = getPref(`shell-tree-open-${group.id}`, hasActive ? '1' : '1');
    const treeOpen = openPref !== '0';
    return `
      <div class="shell-tree">
        <button class="shell-tree-toggle" data-group="${group.id}" type="button" aria-expanded="${treeOpen}">
          <span class="shell-tree-dot"></span>
          <span class="shell-tree-name">${group.name}</span>
          <span class="shell-chevron${treeOpen ? ' rot' : ''}">▶</span>
        </button>
        <nav class="shell-nav${treeOpen ? '' : ' collapsed'}" data-group-nav="${group.id}">${links}</nav>
      </div>`;
  }

  function sidebarHTML() {
    return `
      <div class="shell-brand">
        <img src="https://terratern.com/images/favicon_192.png" alt="TerraTern"/>
        <div class="shell-brand-text">
          <div class="shell-brand-name">Marketing CRM</div>
        </div>
      </div>
      <div class="shell-groups">${GROUPS.map(groupHTML).join('')}</div>
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

    // Each product group's tree expand/collapse — shows/hides its page links.
    sidebar.querySelectorAll('.shell-tree-toggle').forEach(btn => {
      const gid = btn.getAttribute('data-group');
      const nav = sidebar.querySelector(`[data-group-nav="${gid}"]`);
      btn.addEventListener('click', () => {
        const nowOpen = nav.classList.toggle('collapsed') === false;
        btn.querySelector('.shell-chevron').classList.toggle('rot', nowOpen);
        btn.setAttribute('aria-expanded', String(nowOpen));
        setPref(`shell-tree-open-${gid}`, nowOpen ? '1' : '0');
      });
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
    // health/automation-status endpoint the email pages themselves poll.
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
