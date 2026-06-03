/* ═══════════════════════════════════════════════════════
   QG BMS — home.js  v3  (full-page no-sidebar)
   RBAC:
     Admin    → user management only
     Manager / Director → dashboard → portal / tracker + create/delete
     Engineer → dashboard → tracker only
═══════════════════════════════════════════════════════ */

class HomeManager {
  constructor() {
    this.serverUrl      = window.location.origin;
    this.userData       = null;
    this.role           = '';
    this.trackerBids    = [];
    this.filteredBids   = [];
    this.portalBids     = [];
    this.searchTerm     = '';
    this.currentPage    = 'dashboard';
    this._pendingDelete = null;
    this._adminUsers    = [];
    this._mobileNavOpen = false;
    this.init();
  }

  /* ── INIT ─────────────────────────────────────────── */
  async init() {
    try {
      const s = sessionManager.getSession();
      if (!s) { window.location.href = '/auth/login.html'; return; }

      // Be resilient about missing session fields
      this.userData = {
        UserID:   s.userId   || s.UserID   || '',
        Username: s.username || s.Username || '',
        FullName: s.fullName || s.FullName || s.username || '',
        UserType: s.userType || s.UserType || '',
        PortalAccess:  s.portalAccess  ?? s.PortalAccess  ?? false,
        TrackerAccess: s.trackerAccess ?? s.TrackerAccess ?? false,
        AccessPermissions: s.accessPermissions || {
          portal:  s.portalAccess  ?? false,
          tracker: s.trackerAccess ?? false
        }
      };
      this.role = (this.userData.UserType || '').toLowerCase();

      this._buildNav();
      this._setUserHeader();
      this._checkAccess();
      this._initScrollEffect();
      this._navigate(this._isAdmin() ? 'users' : 'dashboard');
    } catch (e) {
      console.error('Init error:', e);
      this.toast('Failed to initialise dashboard: ' + e.message, 'error');
    }
  }

  /* ── ROLE HELPERS ─────────────────────────────────── */
  _is(r)        { return r.split('|').includes(this.role); }
  _isAdmin()    { return this._is('admin'); }
  _canCreate()  { return this._is('manager|director'); }
  _canDelete()  { return this._is('manager|director'); }
  _canApprove() { return this._is('manager|director'); }
  _hasPortal()  {
    // Check session flag first, fall back to role-based access
    const flag = this.userData.PortalAccess ?? this.userData.AccessPermissions?.portal;
    if (flag === true || flag === 'Yes') return true;
    return this._is('manager|director|admin'); // managers always have portal
  }
  _hasTracker() {
    const flag = this.userData.TrackerAccess ?? this.userData.AccessPermissions?.tracker;
    if (flag === true || flag === 'Yes') return true;
    return this._is('manager|director|engineer'); // tracker users
  }

  /* ── NAV BAR ──────────────────────────────────────── */
  _buildNav() {
    const links = document.getElementById('navLinks');
    const mobileLinks = document.getElementById('navMobileLinks');
    if (!links) return;

    const items = [];
    if (this._isAdmin()) {
      items.push({ id:'users',     icon:'fa-users',    label:'User Management' });
    } else {
      items.push({ id:'dashboard', icon:'fa-th-large', label:'Dashboard' });
      if (this._hasPortal())  items.push({ id:'portal',  icon:'fa-briefcase', label:'Bid Portal' });
      if (this._hasTracker()) items.push({ id:'tracker', icon:'fa-tasks',     label:'Bid Tracker' });
    }

    const makeLink = (item, mobile=false) =>
      `<button class="${mobile?'nav-link':'nav-link'}" id="${mobile?'m-':''}nav-${item.id}"
         onclick="homeManager._navigate('${item.id}')${mobile?';homeManager.toggleMobileNav()':''}">
         <i class="fas ${item.icon}"></i>${item.label}
       </button>`;

    links.innerHTML = items.map(i => makeLink(i)).join('');
    if (mobileLinks) mobileLinks.innerHTML = items.map(i => makeLink(i, true)).join('');
  }

  _setActive(id) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${id}`)?.classList.add('active');
    document.getElementById(`m-nav-${id}`)?.classList.add('active');
    this.currentPage = id;
  }

  _setUserHeader() {
    const name = this.userData.FullName || this.userData.Username || 'User';
    const init = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const el_av = document.getElementById('navAvatar');
    const el_nm = document.getElementById('navName');
    const el_rl = document.getElementById('navRole');
    const el_mn = document.getElementById('navMobileName');
    const el_mr = document.getElementById('navMobileRole');
    if (el_av) el_av.textContent = init;
    if (el_nm) el_nm.textContent = name;
    if (el_mn) el_mn.textContent = name;
    if (el_rl) { el_rl.textContent = this.userData.UserType || 'User'; el_rl.className = `nav-user-role role-${this.role}`; }
    if (el_mr) { el_mr.textContent = this.userData.UserType || 'User'; el_mr.className = `nav-user-role role-${this.role}`; }
  }

  _checkAccess() {
    const ok = this._hasPortal() || this._hasTracker() || this._isAdmin();
    if (!ok) document.getElementById('accessDenied').style.display = 'flex';
    // Init notification bell for managers/directors
    if (this._canApprove()) {
      const wrap = document.getElementById('qgNotifWrap');
      if (wrap) wrap.style.display = 'flex';
      if (typeof QGNotifications !== 'undefined') QGNotifications.init(this.role);
    }
  }

  _initScrollEffect() {
    window.addEventListener('scroll', () => {
      const nb = document.getElementById('navbar');
      if (nb) nb.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  toggleMobileNav() {
    this._mobileNavOpen = !this._mobileNavOpen;
    const panel = document.getElementById('navMobilePanel');
    const btn   = document.getElementById('navHamburger');
    panel?.classList.toggle('open', this._mobileNavOpen);
    btn?.classList.toggle('open', this._mobileNavOpen);
  }

  /* ── NAVIGATION ───────────────────────────────────── */
  async _navigate(page) {
    this._setActive(page);
    const c = document.getElementById('pageContent');
    c.innerHTML = `<div class="page-loading"><div class="spinner"></div><span>Loading…</span></div>`;
    // scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    switch (page) {
      case 'dashboard': await this._renderDashboard(); break;
      case 'portal':    await this._renderPortal();    break;
      case 'tracker':   await this._renderTracker();   break;
      case 'create':    this._goCreateBid();    break;
      case 'users':     await this._renderUsers();     break;
      default: c.innerHTML = '<p style="padding:2rem">Page not found.</p>';
    }
  }

  refreshCurrent() { this._navigate(this.currentPage); }

  /* ════════════════════════════════════════════════════
     PAGE: DASHBOARD
  ════════════════════════════════════════════════════ */
  async _renderDashboard() {
    const c     = document.getElementById('pageContent');
    const name  = this.userData.FullName || this.userData.Username || 'User';
    const greet = this._greeting();
    const hasPortal  = this._hasPortal();
    const hasTracker = this._hasTracker();

    const launchCards = (hasPortal || hasTracker) ? `
      <div class="launch-grid">
        ${hasPortal ? `
          <div class="launch-card portal-card" onclick="homeManager._navigate('portal')">
            <div class="lc-bg-orb"></div>
            <div class="lc-inner">
              <div class="lc-top">
                <div class="lc-icon-wrap"><i class="fas fa-briefcase"></i></div>
                <div class="lc-arrow"><i class="fas fa-arrow-right"></i></div>
              </div>
              <div class="lc-title">Bid Portal</div>
              <div class="lc-desc">Access the shared-drive bid document library. Browse, download and view bid files from all active projects.</div>
              <div class="lc-footer">
                <span class="lc-chip"><i class="fas fa-file-excel"></i> Document library</span>
                <button class="lc-btn" onclick="event.stopPropagation();homeManager._navigate('portal')">
                  <i class="fas fa-arrow-right"></i> Open
                </button>
              </div>
            </div>
          </div>` : ''}
        ${hasTracker ? `
          <div class="launch-card tracker-card" onclick="homeManager._navigate('tracker')">
            <div class="lc-bg-orb"></div>
            <div class="lc-inner">
              <div class="lc-top">
                <div class="lc-icon-wrap"><i class="fas fa-tasks"></i></div>
                <div class="lc-arrow"><i class="fas fa-arrow-right"></i></div>
              </div>
              <div class="lc-title">Bid Tracker</div>
              <div class="lc-desc">Track document submissions, approvals and deadlines across all active bids. Monitor completion in real time.</div>
              <div class="lc-footer">
                <span class="lc-chip"><i class="fas fa-chart-line"></i> Live tracking</span>
                <button class="lc-btn" onclick="event.stopPropagation();homeManager._navigate('tracker')">
                  <i class="fas fa-arrow-right"></i> Open
                </button>
              </div>
            </div>
          </div>` : ''}
      </div>` : '';

    c.innerHTML = `
      <div class="dash-greeting">
        <h2>${greet}, ${name} 👋</h2>
        <p>Select a module below to get started</p>
      </div>
      ${launchCards}`;
  }

  _greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  /* ════════════════════════════════════════════════════
     PAGE: BID PORTAL
  ════════════════════════════════════════════════════ */
  async _renderPortal() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <h2>Bid Portal</h2>
          <p>Access bid documents from the shared drive</p>
        </div>
        <div class="page-header-actions">
          <div class="search-wrap" style="min-width:230px">
            <i class="fas fa-search"></i>
            <input class="search-input" placeholder="Search bids…" oninput="homeManager._filterPortalBids(this.value)">
          </div>
          <button class="btn btn-ghost btn-sm" onclick="homeManager._renderPortal()" title="Refresh">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>
      <div id="portalGrid">
        <div class="page-loading"><div class="spinner"></div><span>Loading portal bids…</span></div>
      </div>`;

    try {
      const d = await (await fetch(`${this.serverUrl}/api/bids`)).json();
      this.portalBids = d.success ? (d.bids || []) : [];
      this._renderPortalGrid(this.portalBids);
    } catch {
      document.getElementById('portalGrid').innerHTML =
        '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load bids</h4><p>Check network or server status.</p></div>';
    }
  }

  _filterPortalBids(v) {
    const q = v.toLowerCase();
    this._renderPortalGrid(!q ? this.portalBids : this.portalBids.filter(b => b.name.toLowerCase().includes(q)));
  }

  _renderPortalGrid(bids) {
    const g = document.getElementById('portalGrid');
    if (!g) return;
    if (!bids.length) { g.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h4>No bids found</h4></div>'; return; }
    g.innerHTML = `<div class="bid-grid">${bids.map(bid => {
      const ok = bid.fileExists && bid.accessible;
      return `<div class="bid-portal-card ${bid.fileExists?'':'missing'}">
        <div class="bpc-header">
          <div class="bpc-icon"><i class="fas fa-folder-open"></i></div>
          ${ok ? '<span class="badge badge-green"><i class="fas fa-check-circle"></i> Ready</span>'
               : bid.fileExists ? '<span class="badge badge-amber"><i class="fas fa-lock"></i> Restricted</span>'
                                : '<span class="badge badge-red"><i class="fas fa-exclamation-triangle"></i> Missing</span>'}
        </div>
        <div class="bpc-name">${bid.name}</div>
        <div class="bpc-actions">
          <button class="btn btn-ghost btn-sm" onclick="homeManager._showPortalInfo('${bid.id}')">
            <i class="fas fa-info-circle"></i> Details
          </button>
          <button class="btn btn-primary btn-sm" onclick="homeManager._openPortal('${bid.id}')">
            <i class="fas fa-arrow-right"></i> Open
          </button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  /* View bid info in modal — always fetches fresh data from server */
  async _viewBidDetails(bidId) {
    // Show modal immediately with loading state
    const cachedBid = this.trackerBids.find(b => b.id === bidId) || {};
    document.getElementById('modalTitle').textContent = cachedBid.name || 'Loading…';
    document.getElementById('modalBody').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:3rem;gap:0.75rem;color:var(--tx-s)">
        <div class="spinner"></div><span>Fetching live data…</span>
      </div>`;
    document.getElementById('modalActionBtn').innerHTML = '<i class="fas fa-external-link-alt"></i> Open Bid';
    document.getElementById('modalActionBtn').onclick = () => {
      this.closeModal();
      window.open(`/bid-tracker/bid-view.html?id=${encodeURIComponent(bidId)}`, '_blank');
      // Refresh tracker after user returns from bid-view (they may have made changes)
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        this._silentRefreshBid(bidId);
      };
      window.addEventListener('focus', onFocus);
    };
    this._showModal('bidModal');

    // Fetch the full raw bid from server (includes live docMeta)
    let bid;
    try {
      const r = await fetch(`${this.serverUrl}/api/bid-tracker/bid/${encodeURIComponent(bidId)}`, {
        cache: 'no-store'
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Not found');
      bid = d.bid;
    } catch (e) {
      document.getElementById('modalBody').innerHTML =
        `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Could not load bid data</h4><p>${e.message}</p></div>`;
      return;
    }

    // Compute stats directly from raw docMeta — same logic as bid-view.js updateProgress()
    const docs    = Object.values(bid.docMeta || {});
    const total   = docs.length;
    const subm    = docs.filter(d => d.attachment).length;
    const app     = docs.filter(d => (d.status || '').trim() === 'Approved').length;
    const rej     = docs.filter(d => ['Rejected','reject'].includes((d.status||'').trim())).length;
    const pending = docs.filter(d => (d.status||'').trim() === 'In Review').length;
    const notSt   = docs.filter(d => !d.attachment).length;
    const pct     = total > 0 ? Math.round((app / total) * 100) : 0;

    document.getElementById('modalTitle').textContent = bid.name || bid.bidName || 'Bid Details';
    document.getElementById('modalBody').innerHTML = `
      <div class="info-section">
        <h4><i class="fas fa-folder-open"></i> Bid Information</h4>
        <div class="info-grid">
          <div class="info-item"><label>Client</label><span>${bid.clientName || '—'}</span></div>
          <div class="info-item"><label>Status</label><span>${this._statusBadge(bid.status)}</span></div>
          <div class="info-item"><label>Created By</label><span>${bid.createdBy || '—'}</span></div>
          <div class="info-item"><label>Deadline</label><span>${bid.deadline ? new Date(bid.deadline).toLocaleDateString('en-GB') : '—'}</span></div>
          ${bid.description ? `<div class="info-item" style="grid-column:1/-1"><label>Description</label><span>${bid.description}</span></div>` : ''}
        </div>
      </div>
      <div class="info-section">
        <h4><i class="fas fa-chart-bar"></i> Document Progress</h4>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
          <div style="background:#f8faff;border:1px solid #c7ddf5;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#0f1e36;line-height:1">${total}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Total</div>
          </div>
          <div style="background:#fef9ee;border:1px solid #fde68a;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#d97706;line-height:1">${subm}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#92400e;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Submitted</div>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#059669;line-height:1">${app}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#064e3b;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Approved</div>
          </div>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#dc2626;line-height:1">${rej}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#7f1d1d;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Rejected</div>
          </div>
          <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">${pending}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#1e3a8a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">In Review</div>
          </div>
          <div style="background:#f8faff;border:1px solid #cbd5e1;border-radius:10px;padding:0.85rem;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:#94a3b8;line-height:1">${notSt}</div>
            <div style="font-size:0.7rem;font-weight:600;color:#475569;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Not Started</div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--tx-s);margin-bottom:0.4rem">
            <span>Approval Progress</span><span style="font-weight:700;color:${pct===100?'#059669':'#2563eb'}">${pct}%</span>
          </div>
          <div style="height:10px;background:#e2e8f4;border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct===100?'#10b981':'linear-gradient(90deg,#2563eb,#3b82f6)'};border-radius:6px;transition:width 0.6s ease"></div>
          </div>
          <div style="font-size:0.72rem;color:var(--tx-m);margin-top:5px">${app} of ${total} documents approved</div>
        </div>
      </div>`;
    // Update button with full handler (now that we have confirmed bid loaded)
    const btn = document.getElementById('modalActionBtn');
    btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Bid';
    btn.onclick = () => {
      this.closeModal();
      window.open(`/bid-tracker/bid-view.html?id=${encodeURIComponent(bidId)}`, '_blank');
      // Refresh tracker stats after user may have made changes
      setTimeout(() => this._silentRefreshBid(bidId), 3000);
    };
  }

  /* Silently refresh all bid stats — called after user returns from bid-view */
  async _silentRefreshBid(bidId) {
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/get-all-bids/${this.userData.UserID}`, {
        cache: 'no-store'
      })).json();
      if (!d.success) return;
      this.trackerBids  = d.bids || [];
      this.filteredBids = [...this.trackerBids];
      // Re-render if tracker table is visible
      if (document.getElementById('trackerWrap')) {
        this._applyFilters();
        this.toast('Bid stats updated', 'success', 2000);
      }
    } catch {}
  }

  _showPortalInfo(bidId) {
    const bid = this.portalBids.find(b => b.id === bidId);
    if (!bid) return;
    document.getElementById('modalTitle').textContent = bid.name;
    document.getElementById('modalBody').innerHTML = `
      <div class="info-section">
        <h4><i class="fas fa-info-circle"></i> Bid Details</h4>
        <div class="info-grid">
          <div class="info-item"><label>Bid ID</label><span style="font-family:var(--mono);font-size:0.78rem">${bid.id}</span></div>
          <div class="info-item"><label>File exists</label><span>${bid.fileExists ? '✅ Yes' : '❌ No'}</span></div>
          <div class="info-item"><label>Accessible</label><span>${bid.accessible ? '✅ Yes' : '⚠️ Restricted'}</span></div>
        </div>
      </div>`;
    const btn = document.getElementById('modalActionBtn');
    btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Portal';
    btn.onclick = () => this._openPortal(bidId);
    this._showModal('bidModal');
  }

  _openPortal(bidId) {
    this.closeModal();
    window.open(`/existing-portal/qg_bid_portal.html?bid=${encodeURIComponent(bidId)}`, '_blank', 'noopener,noreferrer');
  }

  /* ════════════════════════════════════════════════════
     PAGE: BID TRACKER
  ════════════════════════════════════════════════════ */
  async _renderTracker() {
    const c = document.getElementById('pageContent');

    // ── Render the shell immediately (instant) ──
    c.innerHTML = `
      <div class="page-header">
        <div class="page-header-text"><h2>Bid Tracker</h2><p>Track and manage bid document submissions</p></div>
        <div class="page-header-actions">
          <div class="filter-bar">
            <div class="search-wrap">
              <i class="fas fa-search"></i>
              <input class="search-input" id="trackerSearch" placeholder="Search bids…"
                oninput="homeManager._searchTracker(this.value)">
            </div>
            <select class="filter-select" id="statusFilter" onchange="homeManager._applyFilters()">
              <option value="">All statuses</option>
              <option>Planning</option><option>Active</option>
              <option>In Progress</option><option>Under Review</option>
              <option>Completed</option><option>Cancelled</option>
            </select>
          </div>
          ${this._canCreate() ? `
            <button class="btn btn-primary" onclick="homeManager._navigate('create')">
              <i class="fas fa-plus-circle"></i> Create New Bid
            </button>` : ''}
          <button class="btn btn-ghost btn-sm" id="trackerRefreshBtn"
            onclick="homeManager._forceRefreshTracker()" title="Refresh">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <h3>All Bids</h3>
          <span id="trackerCount" class="badge badge-gray">—</span>
        </div>
        <div class="table-wrap" id="trackerWrap">
          ${this.trackerBids.length
            ? '' /* will be filled by _renderTrackerTable below */
            : this._skeletonRows()}
        </div>
      </div>`;

    // ── Always fetch fresh from server — real-time data ──
    await this._loadTrackerBids();
  }

  _skeletonRows() {
    const cols = 7;
    return `<table class="data-table">
      <thead><tr>
        <th class="resizable"><i class="fas fa-folder-open"></i> Bid Name<div class="col-resizer"></div></th>
        <th class="resizable"><i class="fas fa-user-edit"></i> Created By<div class="col-resizer"></div></th>
        <th class="resizable"><i class="fas fa-building"></i> Client<div class="col-resizer"></div></th>
        <th class="resizable"><i class="fas fa-tag"></i> Status<div class="col-resizer"></div></th>
        <th class="resizable"><i class="fas fa-chart-bar"></i> Progress<div class="col-resizer"></div></th>
        <th class="resizable"><i class="fas fa-calendar-alt"></i> Deadline<div class="col-resizer"></div></th>
        <th><i class="fas fa-sliders-h"></i> Actions</th>
      </tr></thead>
      <tbody>
        ${[1,2,3,4,5].map(() => `
          <tr class="skeleton-row">
            <td><div class="skel skel-lg"></div><div class="skel skel-sm" style="margin-top:4px;width:55%"></div></td>
            <td><div class="skel skel-md"></div></td>
            <td><div class="skel skel-pill"></div></td>
            <td><div class="skel skel-md" style="width:80%"></div></td>
            <td><div class="skel skel-sm"></div></td>
            <td><div style="display:flex;gap:4px"><div class="skel skel-btn"></div><div class="skel skel-btn"></div></div></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  }

  async _forceRefreshTracker() {
    const btn = document.getElementById('trackerRefreshBtn');
    if (btn) { btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>'; btn.disabled = true; }
    await this._loadTrackerBids();
    if (btn) { btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; btn.disabled = false; }
  }

  async _loadTrackerBids() {
    // Show skeleton while fetching
    const wrap = document.getElementById('trackerWrap');
    if (wrap && !this.trackerBids.length) wrap.innerHTML = this._skeletonRows();
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/get-all-bids/${this.userData.UserID}`, {
        cache: 'no-store'   // always bypass browser cache — get live data
      })).json();
      if (!d.success) throw new Error(d.message);
      this.trackerBids  = d.bids || [];
      this.filteredBids = [...this.trackerBids];
      this._applyFilters();  // respect any active search/filter, then render
    } catch (e) {
      const w = document.getElementById('trackerWrap');
      if (w) w.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load bids</h4><p>${e.message}</p></div>`;
    }
  }

  _searchTracker(v) { this.searchTerm = v.toLowerCase(); this._applyFilters(); }

  _applyFilters() {
    const q  = this.searchTerm;
    const st = (document.getElementById('statusFilter')?.value || '').toLowerCase();
    this.filteredBids = this.trackerBids.filter(b => {
      const mq = !q || (b.name||'').toLowerCase().includes(q) || (b.clientName||'').toLowerCase().includes(q) || (b.createdBy||'').toLowerCase().includes(q);
      const ms = !st || (b.status||'').toLowerCase() === st;
      return mq && ms;
    });
    this._renderTrackerTable();
  }

  _renderTrackerTable() {
    const wrap  = document.getElementById('trackerWrap');
    const count = document.getElementById('trackerCount');
    if (!wrap) return;
    if (count) count.textContent = `${this.filteredBids.length} bid${this.filteredBids.length!==1?'s':''}`;

    if (!this.filteredBids.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h4>No bids match</h4><p>Adjust your search or filter.</p></div>';
      return;
    }

    const canDel = this._canDelete();
    wrap.innerHTML = `
      <table class="data-table">
        <thead id="trackerThead"><tr>
          <th class="resizable"><i class="fas fa-folder-open"></i> Bid Name<div class="col-resizer"></div></th>
          <th class="resizable"><i class="fas fa-user-edit"></i> Created By<div class="col-resizer"></div></th>
          <th class="resizable"><i class="fas fa-building"></i> Client<div class="col-resizer"></div></th>
          <th class="resizable"><i class="fas fa-tag"></i> Status<div class="col-resizer"></div></th>
          <th class="resizable"><i class="fas fa-chart-bar"></i> Progress<div class="col-resizer"></div></th>
          <th class="resizable"><i class="fas fa-calendar-alt"></i> Deadline<div class="col-resizer"></div></th>
          <th><i class="fas fa-sliders-h"></i> Actions</th>
        </tr></thead>
        <tbody>${this.filteredBids.map((b, i) => {
          const req   = b.documentsRequired   || 0;
          const app   = b.documentsApproved   || 0;
          const inPrg = b.documentsInProgress || 0;
          const subm  = b.documentsSubmitted  || 0;
          const rej   = b.documentsRejected   || 0;
          const pct   = req > 0 ? Math.round((app/req)*100) : 0;
          const safeId   = encodeURIComponent(b.id);
          const safeName = (b.name||b.bidName||'').replace(/'/g,"\\'");
          return `<tr style="animation-delay:${i*0.04}s" id="bid-row-${b.id}">
            <td>
              <div style="font-weight:700">${b.name||b.bidName||'—'}</div>
              ${b.description?`<div style="font-size:0.74rem;color:var(--tx-m)">${b.description.slice(0,55)}</div>`:''}
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:0.45rem">
                <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2563c8,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.65rem;flex-shrink:0">
                  ${(b.createdBy||'?').slice(0,2).toUpperCase()}
                </div>
                <span style="font-size:0.82rem;color:var(--tx-s)">${b.createdBy||'—'}</span>
              </div>
            </td>
            <td style="font-size:0.82rem;color:var(--tx-s)">${b.clientName||'—'}</td>
            <td>${this._statusBadge(b.status)}</td>
            <td style="min-width:120px">
              <div class="prog-bar-wrap">
                <div class="prog-bar-bg"><div class="prog-bar ${pct===100?'done':''}" style="width:${pct}%"></div></div>
                <span class="prog-pct">${pct}%</span>
              </div>
              <div style="font-size:0.68rem;color:var(--tx-m);margin-top:2px">${app} approved / ${req} total</div>
            </td>
            <td style="font-size:0.82rem">${b.deadline?new Date(b.deadline).toLocaleDateString('en-GB'):'—'}</td>
            <td>
              <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
                <button class="btn btn-sm"
                  style="background:#f0f9ff;color:#0284c7;border:1px solid #bae6fd;border-radius:7px;cursor:pointer;padding:0.32rem 0.82rem;font-weight:700;font-size:0.78rem;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:all 0.15s"
                  onmouseover="this.style.background='#0284c7';this.style.color='#fff'"
                  onmouseout="this.style.background='#f0f9ff';this.style.color='#0284c7'"
                  onclick="homeManager._viewBidDetails('${b.id}')">
                  <i class="fas fa-info-circle"></i> View
                </button>
                <button class="btn btn-sm"
                  style="background:var(--accent-soft);color:var(--accent);border:1px solid rgba(59,130,246,0.2);border-radius:7px;cursor:pointer;padding:0.32rem 0.82rem;font-weight:700;font-size:0.78rem;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:all 0.15s"
                  onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
                  onmouseout="this.style.background='var(--accent-soft)';this.style.color='var(--accent)'"
                  onclick="window.open('/bid-tracker/bid-view.html?id=${safeId}','_blank')">
                  <i class="fas fa-eye"></i> Open
                </button>
                ${canDel ? `<button class="btn btn-sm"
                  style="background:var(--red-soft);color:var(--red);border:1px solid rgba(239,68,68,0.2);border-radius:7px;cursor:pointer;padding:0.32rem 0.82rem;font-weight:700;font-size:0.78rem;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:all 0.15s"
                  onmouseover="this.style.background='var(--red)';this.style.color='#fff'"
                  onmouseout="this.style.background='var(--red-soft)';this.style.color='var(--red)'"
                  onclick="homeManager._promptDelete('${b.id}','${safeName}')">
                  <i class="fas fa-trash"></i> Delete
                </button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  /* ════════════════════════════════════════════════════
     PAGE: CREATE BID
  ════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════
     CREATE BID — redirect to dedicated page
  ════════════════════════════════════════════════════ */
  _goCreateBid() {
    if (!this._canCreate()) { this.toast('Permission denied', 'error'); this._navigate('tracker'); return; }
    window.open('/bid-tracker/create-bid.html', '_blank');
    // Navigate back to tracker so the active state is sensible
    this._navigate('tracker');
  }

  /* kept as fallback / not used directly any more */
  async _renderCreate() {
    if (!this._canCreate()) { this.toast('Permission denied', 'error'); this._navigate('tracker'); return; }
    const c = document.getElementById('pageContent');
    let templateDocTypes = [];
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/template`)).json();
      if (d.success && d.template) templateDocTypes = Object.keys(d.template);
    } catch {}

    c.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <h2>Create New Bid</h2>
          <p>Fill in the details or upload a template Excel to pre-populate document types</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-ghost btn-sm" onclick="homeManager._navigate('tracker')">
            <i class="fas fa-arrow-left"></i> Back to Tracker
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1rem;align-items:start">
        <div class="card">
          <div class="card-head"><h3><i class="fas fa-file-alt" style="color:var(--accent);margin-right:6px"></i>Bid Details</h3></div>
          <div class="card-body">
            <div class="create-bid-form">
              <div class="form-section-title">Basic Information</div>
              <div style="grid-column:1/-1">
                <label class="field-label" for="cb_name">Bid Name <span class="required">*</span></label>
                <input class="field-input" id="cb_name" type="text" placeholder="e.g. BSNL Tender Q1 2025">
              </div>
              <div>
                <label class="field-label" for="cb_client">Client Name</label>
                <input class="field-input" id="cb_client" type="text" placeholder="e.g. BSNL">
              </div>
              <div>
                <label class="field-label" for="cb_deadline">Submission Deadline <span class="required">*</span></label>
                <input class="field-input" id="cb_deadline" type="date">
              </div>
              <div style="grid-column:1/-1">
                <label class="field-label" for="cb_desc">Description</label>
                <textarea class="field-input field-textarea" id="cb_desc" rows="2" placeholder="Brief description…"></textarea>
              </div>
              <div class="form-section-title">Template Upload</div>
              <div style="grid-column:1/-1">
                <label class="field-label">Excel Template <span style="font-weight:400;color:var(--tx-m)">(optional)</span></label>
                <div style="display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap">
                  <label class="btn btn-ghost btn-sm" style="cursor:pointer">
                    <i class="fas fa-upload"></i> Choose file
                    <input type="file" id="cb_template" accept=".xlsx,.xls" style="display:none"
                      onchange="homeManager._handleTemplateUpload(this)">
                  </label>
                  <span id="cb_templateName" style="font-size:0.8rem;color:var(--tx-s)">No file selected</span>
                </div>
                <div id="cb_templateStatus" style="margin-top:0.5rem;font-size:0.8rem;color:var(--tx-s)"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><i class="fas fa-list-check" style="color:var(--green);margin-right:6px"></i>Document Types</h3>
            <span id="docTypeCount" class="badge badge-gray">0 types</span>
          </div>
          <div class="card-body" id="docTypePanel">
            <div class="empty-state" style="padding:2rem">
              <i class="fas fa-file-upload"></i>
              <h4>No document types</h4>
              <p>Upload a template to auto-populate.</p>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:1.1rem;display:flex;justify-content:flex-end;gap:0.75rem;align-items:center">
        <span id="cb_validationMsg" style="font-size:0.82rem;color:var(--red)"></span>
        <button class="btn btn-ghost" onclick="homeManager._navigate('tracker')">Cancel</button>
        <button class="btn btn-primary" id="cb_submitBtn" onclick="homeManager._submitCreateBid()">
          <i class="fas fa-plus-circle"></i> Create Bid
        </button>
      </div>`;

    if (templateDocTypes.length) this._renderDocTypes(templateDocTypes, []);
  }

  async _handleTemplateUpload(input) {
    if (!input.files?.length) return;
    const file = input.files[0];
    document.getElementById('cb_templateName').textContent = file.name;
    document.getElementById('cb_templateStatus').textContent = 'Uploading…';
    const fd = new FormData();
    fd.append('file', file);
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/template-upload`, { method:'POST', body:fd })).json();
      if (!d.success) throw new Error(d.message);
      document.getElementById('cb_templateStatus').textContent = `✅ ${d.rows?.length || 0} documents loaded`;
      this._cbTemplateData = d;
      const docTypes = [...new Set((d.rows||[]).map(r=>r.type).filter(Boolean))];
      this._renderDocTypes(docTypes, d.rows || []);
    } catch (e) {
      document.getElementById('cb_templateStatus').textContent = `❌ ${e.message}`;
    }
  }

  _renderDocTypes(types, rows) {
    const panel = document.getElementById('docTypePanel');
    const count = document.getElementById('docTypeCount');
    if (!panel) return;
    if (count) count.textContent = `${types.length} type${types.length!==1?'s':''}`;
    if (!types.length) {
      panel.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="fas fa-check"></i><h4>Default template will be used</h4></div>';
      return;
    }
    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:380px;overflow-y:auto;padding-right:4px">
        ${types.map(t => {
          const cats = rows.length ? [...new Set(rows.filter(r=>r.type===t).map(r=>r.category).filter(Boolean))] : [];
          const docs = rows.length ? rows.filter(r=>r.type===t).length : 0;
          return `<div style="padding:0.75rem;background:var(--surface2);border:1px solid var(--border);border-radius:9px">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:${cats.length?'0.4rem':'0'}">
              <i class="fas fa-folder" style="color:var(--accent);font-size:0.85rem"></i>
              <span style="font-weight:600;font-size:0.88rem">${t}</span>
              ${docs?`<span class="badge badge-gray" style="margin-left:auto">${docs} docs</span>`:''}
            </div>
            ${cats.slice(0,4).map(cat=>`<div style="font-size:0.75rem;color:var(--tx-s);padding:1px 0 1px 1.2rem"><i class="fas fa-angle-right" style="margin-right:4px;color:var(--tx-m)"></i>${cat}</div>`).join('')}
            ${cats.length>4?`<div style="font-size:0.72rem;color:var(--tx-m);padding-left:1.2rem">+${cats.length-4} more</div>`:''}
          </div>`;
        }).join('')}
      </div>`;
  }

  async _submitCreateBid() {
    const name     = document.getElementById('cb_name')?.value.trim();
    const deadline = document.getElementById('cb_deadline')?.value;
    const client   = document.getElementById('cb_client')?.value.trim();
    const desc     = document.getElementById('cb_desc')?.value.trim();
    const msg      = document.getElementById('cb_validationMsg');
    if (!name)     { if (msg) msg.textContent = 'Bid Name is required'; return; }
    if (!deadline) { if (msg) msg.textContent = 'Deadline is required';  return; }
    if (msg) msg.textContent = '';
    const btn = document.getElementById('cb_submitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }
    try {
      const tpl = this._cbTemplateData;
      const payload = {
        userId: this.userData.UserID, bidName: name,
        clientName: client||'', description: desc||'', deadline,
        docTypes: tpl?.docTypes?.length ? tpl.docTypes : [{ type:'General', categories:[{ category:'Documents', names:[] }] }],
        documents: tpl?.rows||[], selectedDocuments: tpl?.rows||[],
        teamMembers: [], documentTypePriorities: {}
      };
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/create-bid`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      })).json();
      if (!d.success) throw new Error(d.message||'Failed to create bid');
      this.toast(`Bid "${name}" created!`, 'success');
      this._cbTemplateData = null;
      this.trackerBids = [];   // clear cache so tracker re-fetches with new bid
      if (d.bid?.id) setTimeout(() => window.open(`/bid-tracker/bid-view.html?id=${encodeURIComponent(d.bid.id)}`, '_blank'), 600);
      this._navigate('tracker');
    } catch (e) {
      this.toast(e.message, 'error');
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-plus-circle"></i> Create Bid'; }
    }
  }

  /* ════════════════════════════════════════════════════
     PAGE: USER MANAGEMENT  (Admin only)
  ════════════════════════════════════════════════════ */
  async _renderUsers() {
    if (!this._isAdmin()) {
      document.getElementById('pageContent').innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h4>Access denied</h4></div>'; return;
    }
    const c = document.getElementById('pageContent');
    c.innerHTML = `
      <div class="page-header">
        <div class="page-header-text"><h2>User Management</h2><p>System users and their access — read-only view</p></div>
        <div class="page-header-actions">
          <div class="filter-bar">
            <div class="search-wrap">
              <i class="fas fa-search"></i>
              <input class="search-input" id="userSearch" placeholder="Search users…" oninput="homeManager._filterUsers(this.value)">
            </div>
            <select class="filter-select" id="roleFilter" onchange="homeManager._filterUsers()">
              <option value="">All roles</option>
              <option>Manager</option><option>Engineer</option><option>Director</option><option>Admin</option>
            </select>
            <select class="filter-select" id="statusFilter2" onchange="homeManager._filterUsers()">
              <option value="">All statuses</option><option>Active</option><option>Inactive</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="homeManager._renderUsers()" title="Refresh">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>
      <div id="userStatsRow" class="stats-row" style="grid-template-columns:repeat(4,1fr)"></div>
      <div class="card">
        <div class="card-head">
          <h3>System Users</h3>
          <span id="userCount" class="badge badge-gray">Loading…</span>
        </div>
        <div class="table-wrap" id="userTableWrap">
          <div class="page-loading"><div class="spinner"></div><span>Loading…</span></div>
        </div>
      </div>`;
    await this._loadUsers();
  }

  async _loadUsers() {
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/users`)).json();
      if (!d.success) throw new Error(d.message);
      this._adminUsers = d.users || [];
      this._renderUserStats();
      this._renderUserTable(this._adminUsers);
    } catch (e) {
      const w = document.getElementById('userTableWrap');
      if (w) w.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load users</h4><p>${e.message}</p></div>`;
    }
  }

  _renderUserStats() {
    const u = this._adminUsers;
    const sr = document.getElementById('userStatsRow');
    if (!sr) return;
    sr.innerHTML = `
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-users"></i></div>
        <div><div class="stat-num">${u.length}</div><div class="stat-label">Total Users</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-user-check"></i></div>
        <div><div class="stat-num">${u.filter(x=>(x.status||x.Status)==='Active').length}</div><div class="stat-label">Active</div></div></div>
      <div class="stat-card"><div class="stat-icon amber"><i class="fas fa-user-tie"></i></div>
        <div><div class="stat-num">${u.filter(x=>(x.userType||x.UserType)==='Manager').length}</div><div class="stat-label">Managers</div></div></div>
      <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-hard-hat"></i></div>
        <div><div class="stat-num">${u.filter(x=>(x.userType||x.UserType)==='Engineer').length}</div><div class="stat-label">Engineers</div></div></div>`;
  }

  _filterUsers(sv) {
    const q  = (sv !== undefined ? sv : document.getElementById('userSearch')?.value || '').toLowerCase();
    const rl = (document.getElementById('roleFilter')?.value || '').toLowerCase();
    const st = (document.getElementById('statusFilter2')?.value || '').toLowerCase();
    this._renderUserTable(this._adminUsers.filter(u => {
      const n = (u.fullName||u.FullName||u.username||'').toLowerCase();
      const un= (u.username||u.Username||'').toLowerCase();
      const dp= (u.department||u.Department||'').toLowerCase();
      const ut= (u.userType||u.UserType||'').toLowerCase();
      const us= (u.status||u.Status||'').toLowerCase();
      return (!q||n.includes(q)||un.includes(q)||dp.includes(q)) && (!rl||ut===rl) && (!st||us===st);
    }));
  }

  _renderUserTable(users) {
    const wrap  = document.getElementById('userTableWrap');
    const count = document.getElementById('userCount');
    if (!wrap) return;
    if (count) count.textContent = `${users.length} user${users.length!==1?'s':''}`;
    if (!users.length) { wrap.innerHTML = '<div class="empty-state"><i class="fas fa-users-slash"></i><h4>No users match</h4></div>'; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>User</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th>Portal</th><th>Tracker</th>
        </tr></thead>
        <tbody>${users.map(u => {
          const nm  = u.fullName||u.FullName||u.username||u.Username||'—';
          const un  = u.username||u.Username||'—';
          const ut  = u.userType||u.UserType||'—';
          const dp  = u.department||u.Department||'—';
          const st  = u.status||u.Status||'Active';
          const ini = nm.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          const pa  = u.portalAccess!==undefined?u.portalAccess:u['Portal Access']==='Yes';
          const ta  = u.trackerAccess!==undefined?u.trackerAccess:u['Tracker Access']==='Yes';
          return `<tr>
            <td><div class="user-cell"><div class="user-avatar-sm">${ini}</div>
              <div><div class="user-name-col">${nm}</div></div></div></td>
            <td><span class="user-username">${un}</span></td>
            <td>${this._roleBadge(ut)}</td>
            <td style="font-size:0.82rem;color:var(--tx-s)">${dp}</td>
            <td>${st==='Active'?'<span class="badge badge-green">Active</span>':'<span class="badge badge-gray">Inactive</span>'}</td>
            <td style="text-align:center">${pa?'<i class="fas fa-check-circle" style="color:var(--green)"></i>':'<i class="fas fa-times-circle" style="color:var(--tx-m)"></i>'}</td>
            <td style="text-align:center">${ta?'<i class="fas fa-check-circle" style="color:var(--green)"></i>':'<i class="fas fa-times-circle" style="color:var(--tx-m)"></i>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  /* ── DELETE ───────────────────────────────────────── */
  _promptDelete(bidId, bidName) {
    if (!this._canDelete()) { this.toast('Permission denied', 'error'); return; }
    this._pendingDelete = { bidId, bidName };
    const t = document.getElementById('deleteConfirmText');
    const r = document.getElementById('deleteReason');
    if (t) t.textContent = `Permanently delete "${bidName}"? This cannot be undone.`;
    if (r) r.value = '';
    this._showModal('deleteModal');
  }

  async confirmDeleteBid() {
    const pd = this._pendingDelete;
    if (!pd) return;
    const reason = (document.getElementById('deleteReason')?.value||'').trim();
    if (!reason) { this.toast('Provide a deletion reason', 'error'); return; }
    const btn = document.getElementById('confirmDeleteBtn');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Deleting…'; }
    try {
      const d = await (await fetch(`${this.serverUrl}/api/bid-tracker/delete-bid`, {
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ bidId:pd.bidId, reason, deletedBy:this.userData.UserID,
          deletedByName:this.userData.FullName||this.userData.Username, userType:this.userData.UserType })
      })).json();
      if (!d.success) throw new Error(d.message||'Failed to delete');
      this.toast(`Bid "${pd.bidName}" deleted`, 'success');
      this.closeDeleteModal();
      this._navigate('tracker');
    } catch (e) {
      this.toast(e.message, 'error');
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-trash"></i> Delete'; }
    }
  }

  closeDeleteModal() { this._pendingDelete=null; this._hideModal('deleteModal'); }

  /* ── MODALS ───────────────────────────────────────── */
  _showModal(id) { document.getElementById('modalBackdrop').style.display='block'; document.getElementById(id).style.display='flex'; }
  _hideModal(id) {
    document.getElementById(id).style.display='none';
    if (!['bidModal','deleteModal'].some(m=>document.getElementById(m)?.style.display==='flex'))
      document.getElementById('modalBackdrop').style.display='none';
  }
  closeModal() { this._hideModal('bidModal'); this._hideModal('deleteModal'); }

  /* ── BADGE HELPERS ────────────────────────────────── */
  _statusBadge(s) {
    const m = { 'Planning':'badge-gray','Active':'badge-green','In Progress':'badge-blue',
      'Under Review':'badge-amber','Completed':'badge-green','Approved':'badge-green','Cancelled':'badge-red' };
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'Planning'}</span>`;
  }
  _roleBadge(r) {
    const m = { 'Admin':'badge-red','Manager':'badge-blue','Director':'badge-purple','Engineer':'badge-green' };
    return `<span class="badge ${m[r]||'badge-gray'}">${r}</span>`;
  }

  /* ── TOASTS ───────────────────────────────────────── */
  toast(msg, type='info', duration=3500) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i>
      <span class="toast-msg">${msg}</span>
      <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    c.appendChild(t);
    setTimeout(()=>t.remove(), duration);
  }

  showError(msg)   { this.toast(msg,'error'); }
  showSuccess(msg) { this.toast(msg,'success'); }
}

/* ── COLUMN RESIZE ── */
function initColResize(table) {
  // Actual implementation is in qg-theme.js
  // This is called after table renders; qg-theme.js auto-observes new tables too
  if (!table || table._resizeInited) return;
  if (typeof initAllColResize === 'undefined') return;
  // Re-run on this specific table
  table._resizeInited = false;
  const win_fn = window.initColResize_impl;
  if (win_fn) win_fn(table);
}

const homeManager = new HomeManager();