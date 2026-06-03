/* ═══════════════════════════════════════════════════════════
   QG BMS — Shared Theme JS  (qg-theme.js)
   Include AFTER session.js on every page.

   Provides:
   1. initQGNavbar(config)   — builds unified navbar
   2. initQGTableDrag(table) — makes any table draggable
   3. QGNotifications        — in-app bell for managers
   4. initQGPage()           — call once on DOMContentLoaded
═══════════════════════════════════════════════════════════ */

/* ── 1. RESIZABLE TABLE COLUMNS ─────────────────────────── */
function initColResize(table) {
  if (!table || table._resizeInited) return;
  table._resizeInited = true;

  // Do NOT force table-layout:fixed — let columns size naturally
  // Just add resize handles so users can adjust if needed
  const ths = [...table.querySelectorAll('thead tr:first-child th')];
  if (!ths.length) return;

  ths.forEach((th, idx) => {
    if (idx === ths.length - 1) return; // skip last column

    // Remove old resizer if re-init
    const old = th.querySelector('.col-resizer');
    if (old) old.remove();

    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    resizer.style.cssText = `
      position:absolute; right:-2px; top:0; bottom:0; width:8px;
      cursor:col-resize; z-index:100; background:transparent;
      border-right:2px solid rgba(255,255,255,0.3);
    `;
    th.style.position = 'relative';
    th.style.overflow = 'hidden';
    th.appendChild(resizer);

    resizer.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = th.offsetWidth;

      resizer.style.borderRightColor = 'rgba(255,255,255,0.9)';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMouseMove(ev) {
        const delta = ev.clientX - startX;
        const newW  = Math.max(50, startW + delta);
        th.style.width = newW + 'px';
      }

      function onMouseUp() {
        resizer.style.borderRightColor = 'rgba(255,255,255,0.3)';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('mouseover', () => {
      resizer.style.borderRightColor = 'rgba(255,255,255,0.85)';
      resizer.style.background = 'rgba(255,255,255,0.12)';
    });
    resizer.addEventListener('mouseout', () => {
      resizer.style.borderRightColor = 'rgba(255,255,255,0.3)';
      resizer.style.background = 'transparent';
    });
  });
}

/* Auto-init resize on all tables — also watches for dynamic tables */
function initAllQGTableDrag() { initAllColResize(); } // backward compat
function initAllColResize() {
  // Wait for tables to have real widths
  setTimeout(() => {
    document.querySelectorAll('table').forEach(t => initColResize(t));
  }, 200);

  const observer = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      const tables = n.matches?.('table') ? [n] : [...(n.querySelectorAll?.('table') || [])];
      if (tables.length) {
        setTimeout(() => tables.forEach(t => initColResize(t)), 150);
      }
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ── 2. NOTIFICATION SYSTEM ─────────────────────────────── */
const QGNotifications = {
  _items: [],
  _open:  false,
  _canUse: false,

  init(role) {
    const roles = ['manager','director','admin'];
    this._canUse = roles.includes((role||'').toLowerCase());
    if (!this._canUse) return;

    this._items = JSON.parse(localStorage.getItem('qg_notifs') || '[]');
    // Render badge
    this._renderBadge();
    // Poll every 30s
    this._poll();
    setInterval(() => this._poll(), 30000);
    // Close on outside click
    document.addEventListener('click', e => {
      const wrap = document.getElementById('qgNotifWrap');
      if (wrap && !wrap.contains(e.target) && this._open) {
        this._open = false;
        const panel = document.getElementById('qgNotifPanel');
        if (panel) panel.style.display = 'none';
      }
    });
  },

  toggle() {
    this._open = !this._open;
    const panel = document.getElementById('qgNotifPanel');
    if (!panel) return;
    panel.style.display = this._open ? 'block' : 'none';
    if (this._open) this._renderList();
  },

  add({ type, title, message, bidId }) {
    const n = { id: Date.now().toString(36), type, title, message, bidId, ts: Date.now(), read: false };
    this._items.unshift(n);
    if (this._items.length > 200) this._items.pop(); // keep up to 200 entries as log
    this._save();
    this._renderBadge();
    if (this._open) this._renderList();
    const btn = document.getElementById('qgNotifBtn');
    if (btn) { btn.classList.add('ring'); setTimeout(() => btn.classList.remove('ring'), 700); }
  },

  click(id) {
    const n = this._items.find(x => x.id === id);
    if (!n) return;
    n.read = true;
    this._save();
    this._renderBadge();
    this._renderList();
    if (n.bidId) window.open(`/bid-tracker/bid-view.html?id=${encodeURIComponent(n.bidId)}`, '_blank');
  },

  clearAll() {
    // Mark all as read — never delete, keep full log
    this._items.forEach(n => { n.read = true; });
    this._save();
    this._renderBadge();
    this._renderList();
  },

  /* Permanently clear all (only if explicitly called) */
  _deleteAll() {
    this._items = [];
    this._save();
    this._renderBadge();
    this._renderList();
  },

  _save() { localStorage.setItem('qg_notifs', JSON.stringify(this._items)); },

  _renderBadge() {
    const unread = this._items.filter(n => !n.read).length;
    const badge  = document.getElementById('qgNotifBadge');
    if (!badge) return;
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  },

  _renderList() {
    const list = document.getElementById('qgNotifList');
    if (!list) return;
    if (!this._items.length) {
      list.innerHTML = '<div class="qg-notif-empty"><i class="fas fa-bell-slash" style="font-size:1.5rem;margin-bottom:0.5rem;opacity:0.3"></i><br>No notifications yet</div>';
      return;
    }
    const icons = { upload:'fa-upload', submit:'fa-paper-plane', approve:'fa-check-circle', reject:'fa-times-circle' };
    list.innerHTML = this._items.map(n => `
      <div class="qg-notif-item${n.read?' read':''}" onclick="QGNotifications.click('${n.id}')">
        <div class="qg-notif-icon ${n.type||'upload'}">
          <i class="fas ${icons[n.type]||'fa-bell'}"></i>
        </div>
        <div class="qg-notif-body">
          <div class="qg-notif-title">${n.title}</div>
          <div class="qg-notif-msg">${n.message}</div>
          <div class="qg-notif-time">${this._ago(n.ts)}</div>
        </div>
        ${!n.read ? '<div class="qg-notif-dot"></div>' : ''}
      </div>`).join('');
  },

  async _poll() {
    try {
      const session = window.sessionManager?.getSession?.() || {};
      const userId = session.userId || session.UserID;
      if (!userId) return;
      const r = await fetch(`/api/bid-tracker/get-all-bids/${userId}`, { cache:'no-store' });
      const d = await r.json();
      if (!d.success) return;
      const lastCheck = parseInt(localStorage.getItem('qg_notif_lc') || '0');
      const now = Date.now();
      (d.bids || []).forEach(bid => {
        const upd = new Date(bid.lastUpdated || 0).getTime();
        if (upd > lastCheck && upd > now - 300000) { // within last 5 min
          const subm = bid.documentsSubmitted || 0;
          if (subm > 0) {
            const dup = this._items.find(n => n.bidId === bid.id && n.ts > lastCheck);
            if (!dup) {
              this.add({
                type: 'submit',
                title: 'Document submitted for review',
                message: `${bid.name} — ${subm} doc${subm>1?'s':''} awaiting approval`,
                bidId: bid.id
              });
            }
          }
        }
      });
      localStorage.setItem('qg_notif_lc', now.toString());
    } catch {}
  },

  _ago(ts) {
    const d = Date.now() - ts;
    if (d < 60000)   return 'just now';
    if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
    return new Date(ts).toLocaleDateString('en-GB');
  }
};

/* ── 3. NAVBAR BUILDER ──────────────────────────────────── */
function buildQGNavbar({ containerId, logoHref, links, userName, userRole, showNotif }) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const initials = (userName||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const roleClass = 'role-' + (userRole||'').toLowerCase();

  const linksHtml = (links||[]).map(l =>
    `<button class="qg-nav-link${l.active?' active':''}" onclick="${l.onclick||''}">${l.icon?`<i class="fas ${l.icon}"></i>`:''}${l.label}</button>`
  ).join('');

  const notifHtml = showNotif ? `
    <div class="qg-notif-wrap" id="qgNotifWrap">
      <button class="qg-notif-btn" id="qgNotifBtn" onclick="QGNotifications.toggle()">
        <i class="fas fa-bell"></i>
        <span class="qg-notif-badge" id="qgNotifBadge" style="display:none">0</span>
      </button>
      <div class="qg-notif-panel" id="qgNotifPanel" style="display:none">
        <div class="qg-notif-head">
          <span>Notifications</span>
          <button onclick="QGNotifications.clearAll()">Mark all read</button>
        </div>
        <div class="qg-notif-list" id="qgNotifList"></div>
      </div>
    </div>` : '';

  wrap.innerHTML = `
    <nav class="qg-navbar">
      <a class="qg-navbar-brand" href="${logoHref||'/home/home.html'}">
        <div class="qg-navbar-logo">
          <img src="/assets/qg.jpg" alt="QG" onerror="this.parentElement.style.background='#1a3f8a';this.style.display='none'">
        </div>
        <div class="qg-navbar-title">
          <span class="name">Quadgen Wireless</span>
          <span class="sub">Bid Management System</span>
        </div>
      </a>
      <div class="qg-navbar-links">${linksHtml}</div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        ${notifHtml}
        <div class="qg-user-block">
          <div class="qg-user-row">
            <div class="qg-user-avatar">${initials}</div>
            <div>
              <div class="qg-user-name">${userName||'User'}</div>
              <div class="qg-user-role ${roleClass}">${userRole||''}</div>
            </div>
          </div>
          <button class="qg-signout" onclick="sessionManager?.logout?.()">
            <i class="fas fa-sign-out-alt"></i> Sign out
          </button>
        </div>
      </div>
    </nav>`;
}

/* ── 4. PAGE INIT ───────────────────────────────────────── */
function initQGPage() {
  initAllQGTableDrag();
}

document.addEventListener('DOMContentLoaded', initQGPage);

// Expose for cross-file usage
window.initColResize_impl = initColResize;
window.initColResize = initColResize;