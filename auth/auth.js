/* ═══════════════════════════════════════════════════
   QG BMS — auth.js   Custom role-colored user picker
═══════════════════════════════════════════════════ */

const ROLE_DASHBOARD = {
  Admin:    '/home/home.html',
  Manager:  '/home/home.html',
  Director: '/home/home.html',
  Engineer: '/home/home.html',
};

const ROLE_STYLE = {
  Admin:    { color:'#dc2626', bg:'rgba(239,68,68,0.10)',   icon:'fa-shield-alt',   label:'Admin'    },
  Manager:  { color:'#2563eb', bg:'rgba(59,130,246,0.10)',  icon:'fa-user-tie',     label:'Manager'  },
  Director: { color:'#7c3aed', bg:'rgba(139,92,246,0.10)', icon:'fa-user-crown',   label:'Director' },
  Engineer: { color:'#059669', bg:'rgba(16,185,129,0.10)', icon:'fa-hard-hat',     label:'Engineer' },
};

const authUI = {
  users:        [],
  allUsers:     [],
  selectOpen:   false,
  selectedUser: null,

  /* ── Load users and render custom dropdown ── */
  async loadUsers() {
    const items = document.getElementById('cselItems');
    if (!items) return;
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch('/api/bid-tracker/users', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      this.allUsers = d.users || [];
      this.users    = [...this.allUsers];
      this._renderItems(this.users);
    } catch {
      if (items) items.innerHTML = `<div class="csel-empty" onclick="authUI.loadUsers()" style="cursor:pointer">
        <i class="fas fa-wifi-slash"></i> Could not load users — click to retry</div>`;
    }
  },

  _renderItems(list) {
    const items = document.getElementById('cselItems');
    if (!items) return;
    if (!list.length) { items.innerHTML = '<div class="csel-empty">No users found</div>'; return; }

    const roleOrder = ['Admin','Director','Manager','Engineer'];
    const groups = {};
    list.forEach(u => {
      const role = u.userType || u.UserType || 'Other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(u);
    });

    const orderedRoles = [
      ...roleOrder.filter(r => groups[r]),
      ...Object.keys(groups).filter(r => !roleOrder.includes(r))
    ];

    let html = '';
    orderedRoles.forEach(role => {
      const rs = ROLE_STYLE[role] || { color:'#64748b', bg:'rgba(100,116,139,0.10)', icon:'fa-user', label:role };
      html += `
        <div class="csel-group-header" style="color:${rs.color};background:${rs.bg}">
          <i class="fas ${rs.icon}"></i> ${rs.label}
        </div>`;
      groups[role].forEach(u => {
        const uname = u.username || u.Username || '';
        const fname = u.fullName || u.FullName || uname;
        const init  = fname.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const isSelected = this.selectedUser?.username === uname;
        html += `
          <div class="csel-item ${isSelected?'selected':''}" onclick="authUI.selectUser('${uname}','${fname.replace(/'/g,"\\'")}','${role}')">
            <div class="csel-avatar" style="background:linear-gradient(135deg,${rs.color},${rs.color}88)">${init}</div>
            <div class="csel-info">
              <span class="csel-name">${fname}</span>
              <span class="csel-uname">@${uname}</span>
            </div>
            ${isSelected ? '<i class="fas fa-check" style="color:'+rs.color+';margin-left:auto"></i>' : ''}
          </div>`;
      });
    });
    items.innerHTML = html;
  },

  selectUser(username, fullName, role) {
    this.selectedUser = { username, fullName, role };

    // Set hidden inputs
    document.getElementById('userSelect').value = username;
    document.getElementById('username').value   = username;

    // Update display
    const rs      = ROLE_STYLE[role] || { color:'#64748b', bg:'rgba(100,116,139,0.10)', icon:'fa-user', label:role };
    const init    = fullName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const display = document.getElementById('cselDisplay');
    if (display) display.innerHTML = `
      <div class="csel-avatar sm" style="background:linear-gradient(135deg,${rs.color},${rs.color}88)">${init}</div>
      <div class="csel-info">
        <span class="csel-name">${fullName}</span>
        <span class="csel-badge" style="background:${rs.bg};color:${rs.color}">${rs.label}</span>
      </div>`;

    // Enable sign-in button
    const btn = document.getElementById('loginBtn');
    if (btn) btn.disabled = false;

    this.closeSelect();
    this._renderItems(this.users);    // re-render to show checkmark
    setTimeout(() => document.getElementById('password')?.focus(), 60);
  },

  filterSelect(val) {
    const q = val.toLowerCase();
    this.users = !q ? [...this.allUsers] : this.allUsers.filter(u => {
      const n = (u.fullName||u.FullName||u.username||'').toLowerCase();
      const r = (u.userType||u.UserType||'').toLowerCase();
      return n.includes(q) || r.includes(q);
    });
    this._renderItems(this.users);
  },

  toggleSelect() { this.selectOpen ? this.closeSelect() : this.openSelect(); },

  openSelect() {
    this.selectOpen = true;
    const list = document.getElementById('customSelectList');
    const btn  = document.getElementById('customSelectBtn');
    const arr  = document.getElementById('cselArrow');
    if (list) list.style.display = 'block';
    if (btn)  btn.classList.add('open');
    if (arr)  arr.style.transform = 'rotate(180deg)';
    document.getElementById('cselSearch')?.focus();
    setTimeout(() => document.addEventListener('click', this._outsideClick = e => {
      if (!document.getElementById('customSelectWrap')?.contains(e.target)) this.closeSelect();
    }), 50);
  },

  closeSelect() {
    this.selectOpen = false;
    const list = document.getElementById('customSelectList');
    const btn  = document.getElementById('customSelectBtn');
    const arr  = document.getElementById('cselArrow');
    if (list) list.style.display = 'none';
    if (btn)  btn.classList.remove('open');
    if (arr)  arr.style.transform = '';
    document.getElementById('cselSearch').value = '';
    this.users = [...this.allUsers];
    document.removeEventListener('click', this._outsideClick);
  },

  togglePassword() {
    const i = document.getElementById('password');
    const ic = document.getElementById('eyeIcon');
    i.type = i.type === 'password' ? 'text' : 'password';
    ic.className = i.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  },

  setLoading(on) {
    const btn = document.getElementById('loginBtn');
    document.getElementById('btnText').style.display   = on ? 'none'  : 'flex';
    document.getElementById('btnSpinner').style.display= on ? 'flex'  : 'none';
    btn.disabled = on;
  },

  showStatus(msg, type='error') {
    const el   = document.getElementById('statusMsg');
    const icons = { error:'fa-exclamation-circle', success:'fa-check-circle', info:'fa-info-circle' };
    el.className = `status-msg ${type}`;
    el.innerHTML = `<i class="fas ${icons[type]}"></i> ${msg}`;
    el.style.display = 'flex';
    if (type !== 'error') setTimeout(() => el.style.display='none', 5000);
  },

  clearStatus() { document.getElementById('statusMsg').style.display = 'none'; },

  showSuccess(userData) {
    const name  = userData.FullName || userData.Username || 'User';
    const role  = userData.UserType || 'User';
    const rs    = ROLE_STYLE[role] || { color:'#64748b' };
    const init  = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('successAvatar').textContent      = init;
    document.getElementById('successAvatar').style.background = `linear-gradient(135deg,${rs.color},${rs.color}88)`;
    document.getElementById('successName').textContent        = `Welcome, ${name.split(' ')[0]}!`;
    document.getElementById('successRoleLabel').textContent   = `Signed in as ${role}`;
    document.getElementById('successCard').style.display      = 'flex';
    document.getElementById('loginForm').style.display        = 'none';
    document.getElementById('statusMsg').style.display        = 'none';
  }
};

class AuthenticationManager {
  constructor() {
    this.serverUrl = window.location.origin;
    this.init();
  }

  init() {
    if (sessionManager.isAuthenticated()) { this._redirectByRole(); return; }
    document.getElementById('loginForm')?.addEventListener('submit', e => this.handleLogin(e));
    setTimeout(() => authUI.loadUsers(), 0);
  }

  async handleLogin(e) {
    e.preventDefault();
    authUI.clearStatus();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const selVal   = document.getElementById('userSelect').value;

    if (!selVal || !username) {
      authUI.showStatus('Please select your account from the dropdown.', 'error');
      return;
    }
    if (!password) {
      authUI.showStatus('Please enter your password.', 'error');
      document.getElementById('password').focus();
      return;
    }

    authUI.setLoading(true);
    try {
      const r = await fetch(`${this.serverUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const d = await r.json();
      if (r.ok && d.success) {
        const session = sessionManager.createSession(d.userData);
        if (session) {
          authUI.showSuccess(d.userData);
          setTimeout(() => this._redirectByRole(d.userData), 1400);
        } else {
          authUI.showStatus('Failed to create session. Please try again.', 'error');
        }
      } else {
        authUI.showStatus(d.message || 'Invalid password. Please try again.', 'error');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
      }
    } catch {
      authUI.showStatus('Network error. Check your connection and try again.', 'error');
    } finally {
      authUI.setLoading(false);
    }
  }

  _redirectByRole(userData) {
    const session  = userData || sessionManager.getSession();
    if (!session)  { window.location.href = '/auth/login.html'; return; }
    const userType = session.UserType || session.userType || '';
    window.location.href = ROLE_DASHBOARD[userType] || '/home/home.html';
  }
}

document.addEventListener('DOMContentLoaded', () => { window.authManager = new AuthenticationManager(); });