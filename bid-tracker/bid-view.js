document.addEventListener('DOMContentLoaded', () => {
  const API_USERS = '/api/bid-tracker/users';
  const API_TEMPLATE = '/api/bid-tracker/template';
  const API_GET_ATTACHMENTS = '/api/bid-tracker/attachments';
  const API_GET_BID_TRIES = [
    id => `/api/bid-tracker/bid?id=${encodeURIComponent(id)}`,
    id => `/api/bid-tracker/bids/${encodeURIComponent(id)}`,
    id => `/api/bid-tracker/bid/${encodeURIComponent(id)}`,
  ];
  const API_UPDATE_BID = '/api/bid-tracker/update-bid';
  const API_ADD_DOCUMENT = '/api/bid-tracker/add-document';
  const API_REMOVE_DOCUMENT = '/api/bid-tracker/remove-document';
  const API_UPDATE_DOCUMENT = '/api/bid-tracker/document-update';
  const API_UPLOAD_ATTACHMENT = '/api/bid-tracker/document-upload';
  const API_APPROVE_BID = '/api/bid-tracker/approve-bid';
  const API_APPROVE_DOCUMENT = '/api/bid-tracker/document-approve';
  const API_GENERATE_MASTER = '/api/bid-tracker/generate-master-file';
  const API_FINALIZE_DOCUMENT = '/api/bid-tracker/finalize-document';
  const API_UPDATE_TEMPLATE_FIELD = '/api/bid-tracker/update-template-field';
  const STATUS = {
    ADDED: 'Added Attachment',
    REVIEW: 'In Review',
    PENDING: 'Pending Approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };
  const APPROVAL_STATUS = {
    APPROVED: 'Document Approved',
    REJECTED: 'Document Rejected',
    PENDING: 'Pending Review',
  };
  const state = {
    bidId: null,
    bid: null,
    users: [],
    templateData: {},
    existingDocumentTypes: [],
    existingDocMeta: new Map(),
    totalDocs: 0,
    _page: 0,
    _pageSize: 50,
    documentTypePriorities: new Map(),
    tempPriorities: new Map(),
    prioritiesMode: 'display',
    selectedDocumentTypes: [],
    currentDocType: null,
    currentCategory: null,
    workingCategories: [],
    workingDocuments: [],
    filters: { type: '', category: '', name: '' },
    filteredRows: [],
    canModerate: false,
    canEditFinalized: false,
    bidNotifications: [],
  };
  const el = {
    loading: document.getElementById('loadingContainer'),
    error: document.getElementById('errorContainer'),
    errorMessage: document.getElementById('errorMessage'),
    content: document.getElementById('bidContent'),
    headerBidTitleName: document.getElementById('headerBidTitleName'),
    displayHeaderDeadline: document.getElementById('displayHeaderDeadline'),
    displayHeaderCreatedBy: document.getElementById('displayHeaderCreatedBy'),
    displayHeaderClient: document.getElementById('displayHeaderClient'),
    editHeaderDeadlineBtn: document.getElementById('editHeaderDeadlineBtn'),
    editDeadlineModal: document.getElementById('editDeadlineModal'),
    modalDeadlineInput: document.getElementById('modalDeadlineInput'),
    saveHeaderDeadlineBtn: document.getElementById('saveHeaderDeadlineBtn'),
    docsNeeded: document.getElementById('docsNeeded'),
    docsSubmitted: document.getElementById('docsSubmitted'),
    docsApproved: document.getElementById('docsApproved'),
    docsRejected: document.getElementById('docsRejected'),
    docsPending: document.getElementById('docsPending'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    approveBidSection: document.getElementById('approveBidSection'),
    finalApproveBidBtn: document.getElementById('finalApproveBidBtn'),
    approveBidStatus: document.getElementById('approveBidStatus'),
    editStructureBtn: document.getElementById('editStructureBtn'),
    managePrioritiesBtn: document.getElementById('managePrioritiesBtn'),
    filterDocType: document.getElementById('filterDocType'),
    filterDocCategory: document.getElementById('filterCategory'),
    filterDocName: document.getElementById('filterDocName'),
    clearFiltersBtn: document.getElementById('clearFilters'),
    documentsTableBody: document.getElementById('documentsTableBody'),
    documentsCount: document.getElementById('documentsCount'),
    refreshDocumentsBtn: document.getElementById('refreshDocumentsBtn'),
    exportDocsBtn: document.getElementById('exportDocsBtn'),
    forceSaveBtn: document.getElementById('forceSaveBtn'),
    // testUploadLogicBtn: document.getElementById('testUploadLogicBtn'),
    // Add New Document Form Elements
    newDocType: document.getElementById('newDocType'),
    newDocCategory: document.getElementById('newDocCategory'),
    newDocName: document.getElementById('newDocName'),
    newDocTypeInput: document.getElementById('newDocTypeInput'),
    newCategoryInput: document.getElementById('newCategoryInput'),
    newNameInput: document.getElementById('newNameInput'),
    addNewDocTypeBtn: document.getElementById('addNewDocTypeBtn'),
    addNewCategoryBtn: document.getElementById('addNewCategoryBtn'),
    addNewNameBtn: document.getElementById('addNewNameBtn'),
    newDocPriority: document.getElementById('newDocPriority'),
    newDocSection: document.getElementById('newDocSection'),
    newDocAssigned: document.getElementById('newDocAssigned'),
    newDocDueDate: document.getElementById('newDocDueDate'),
    saveNewDocBtn: document.getElementById('saveNewDocBtn'),
    resetNewDocBtn: document.getElementById('resetNewDocBtn'),
    testUploadLogicBtn: document.getElementById('testUploadLogicBtn'),
    managePrioritiesModal: document.getElementById('managePrioritiesModal'),
    priorityDocTypeSelect: document.getElementById('priorityDocTypeSelect'),
    priorityValueInput: document.getElementById('priorityValueInput'),
    assignPriorityBtn: document.getElementById('assignPriorityBtn'),
    priorityAssignments: document.getElementById('priorityAssignments'),
    savePrioritiesBtn: document.getElementById('savePrioritiesBtn'),
    cancelPrioritiesBtn: document.getElementById('cancelPrioritiesBtn'),
    editPrioritiesBtn: document.getElementById('editPrioritiesBtn'),
    priorityDisplay: document.getElementById('priorityDisplay'),
    priorityEdit: document.getElementById('priorityEdit'),
    submitStatus: document.getElementById('submitStatus'),
  };
  const qparam = k => new URL(location.href).searchParams.get(k);
  const escapeHtml = s => (s ?? '').toString().replace(/[&<>\"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  // fetchJSON with 30-second timeout (large bids can be slow to parse)
  const fetchJSON = async (url, opts) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const r = await fetch(url, { signal: controller.signal, cache: 'no-store', ...opts });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    } finally {
      clearTimeout(timer);
    }
  };
  // toKey MUST match server.js exactly: just toLowerCase(), double-pipe separator
  // Server: `${type}||${category}||${name}`.toLowerCase()
  // Do NOT normalize spaces/underscores — that causes key mismatches with stored data
  const normalize = s => (s ?? '').toString().trim().toLowerCase();
  const toKey = (t, c, n) => `${normalize(t)}||${normalize(c)}||${normalize(n)}`;
  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    let d;
    if (typeof dateValue === 'number') {
      d = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (dateValue instanceof Date) {
      d = dateValue;
    } else {
      d = new Date(dateValue);
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  function showNotification(message, type = 'info', timeout = 2500) {
    const n = document.createElement('div');
    n.className = `notification-toast ${type}`;
    n.innerHTML = escapeHtml(message);
    document.body.appendChild(n);
    setTimeout(() => n.remove(), timeout);
  }
  function checkUserPermissions() {
    const session = (window.sessionManager?.getSession && sessionManager.getSession()) || {};
    // Use userType (the field session.js actually stores)
    const userRole = session?.userType || session?.UserType || session?.role || session?.roleName || session?.userRole || '';
    state.canModerate    = /admin|manager|director/i.test(userRole);
    state.canEditFinalized = /admin|director/i.test(userRole);

    // Notify Manager is now in the Notified column per-doc
    // Hide the top button
    const notifyBtn = document.getElementById('notifyManagerBtn');
    if (notifyBtn) notifyBtn.style.display = 'none';
    document.querySelectorAll('.manager-only').forEach(btn => {
      btn.style.display = state.canModerate ? 'inline-block' : 'none';
    });
    document.querySelectorAll('.director-admin-only').forEach(btn => {
      btn.style.display = state.canEditFinalized ? 'inline-block' : 'none';
    });
    if (el.editHeaderDeadlineBtn) {
      el.editHeaderDeadlineBtn.style.display = state.canModerate ? 'inline-block' : 'none';
    }
    if (state.canModerate) {
      document.body.classList.add('has-manager-access');
    }
    if (state.canEditFinalized) {
      document.body.classList.add('has-director-admin-access');
    }
  }

  // ── Engineer: top "Notify Manager" button → doc picker → message ──
  function initNotifyManagerBtn() {
    const btn = document.getElementById('notifyManagerBtn');
    if (!btn || btn._notifyInit) return;
    btn._notifyInit = true;
    btn.addEventListener('click', () => openNotifyManagerPicker());
  }

  // Shows finalized docs for engineer to pick which one to notify about
  function openNotifyManagerPicker() {
    const existing = document.getElementById('notifyPickerModal');
    if (existing) existing.remove();

    // Get finalized docs that haven't been notified yet
    const finalizedDocs = [...state.existingDocMeta.values()].filter(m =>
      (m.engineerFinalized || m.isFinalized) && m.attachment &&
      m.status !== 'Approved' && m.status !== 'In Review'
    );

    const modal = document.createElement('div');
    modal.id = 'notifyPickerModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';

    const docOptions = finalizedDocs.length
      ? finalizedDocs.map(m =>
          `<option value="${escapeHtml(m.type)}|||${escapeHtml(m.category)}|||${escapeHtml(m.name)}">
            ${escapeHtml(m.name)} (${escapeHtml(m.type)})
          </option>`).join('')
      : '<option value="">No finalized documents available</option>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:22px;width:460px;max-width:95vw;
        box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <i class="fa fa-bell" style="color:#1a3f8a"></i>
          <h6 style="margin:0;color:#1a3f8a;font-weight:700;font-size:1rem">Notify Manager</h6>
        </div>
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:5px">
          Select Document *
        </label>
        <select id="notifyPickerDoc" style="width:100%;padding:8px;border:1.5px solid #d1d5db;
          border-radius:8px;font-size:0.88rem;margin-bottom:12px;box-sizing:border-box">
          <option value="">— Select a document —</option>
          ${docOptions}
        </select>
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:5px">
          Message * <span style="font-weight:400;color:#9ca3af">(max 300 chars)</span>
        </label>
        <textarea id="notifyPickerMsg" maxlength="300"
          placeholder="What do you want to notify the manager about?"
          style="width:100%;height:85px;border:1.5px solid #d1d5db;border-radius:8px;
            padding:9px;font-size:0.88rem;resize:none;box-sizing:border-box;font-family:inherit"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
          <span id="notifyPickerCount" style="font-size:0.74rem;color:#94a3b8">0 / 300</span>
          <div style="display:flex;gap:8px">
            <button id="notifyPickerCancel" style="padding:6px 14px;border-radius:8px;
              border:1.5px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem;font-weight:600">
              Cancel</button>
            <button id="notifyPickerSend" style="padding:6px 18px;border-radius:8px;border:none;
              background:#1a3f8a;color:#fff;font-weight:700;cursor:pointer;font-size:0.82rem">
              <i class="fa fa-paper-plane"></i> Send</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const ta  = modal.querySelector('#notifyPickerMsg');
    const cnt = modal.querySelector('#notifyPickerCount');
    ta?.addEventListener('input', () => {
      const l = ta.value.length;
      cnt.textContent = `${l} / 300`;
      cnt.style.color = l > 270 ? '#dc2626' : '#94a3b8';
    });
    modal.querySelector('#notifyPickerCancel')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#notifyPickerSend')?.addEventListener('click', async () => {
      const sel = modal.querySelector('#notifyPickerDoc');
      const val = sel?.value;
      const msg = ta?.value?.trim();
      if (!val) { showNotification('Please select a document.', 'warning'); return; }
      if (!msg) { showNotification('Please type a message.', 'warning'); return; }

      const [docType, docCat, docName] = val.split('|||');
      const session = window.sessionManager?.getSession?.() || {};
      const sendBtn = modal.querySelector('#notifyPickerSend');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';

      try {
        const r = await fetch('/api/bid-tracker/send-notification', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidId: state.bidId, message: msg,
            fromUserId: session.userId, fromRole: 'Engineer', toRole: 'Manager',
            senderName: session.fullName || session.username || 'Engineer',
            docType, category: docCat, docName
          })
        });
        const d = await r.json();
        if (d.success) {
          modal.remove();
          state.bidNotifications = state.bidNotifications || [];
          state.bidNotifications.unshift({
            id: Date.now().toString(36), toRole: 'Manager', fromRole: 'Engineer',
            docName, category: docCat, type: docType, message: msg,
            senderName: session.fullName || session.username || 'Engineer',
            ts: new Date().toISOString()
          });
          renderDocumentsTable();
          showNotification('Manager notified ✓', 'success');
        } else showNotification('Failed: ' + (d.message||'Error'), 'danger');
      } catch { showNotification('Failed to send', 'danger'); }
      finally { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Send'; }
    });

    ta?.focus();
  }

  // ── Manager: poll for engineer notifications every 30s ─────────────
  function startManagerNotifPoll() {
    if (!state.canModerate) return;
    const poll = async () => {
      if (!state.bidId) return;
      try {
        const r = await fetch(`/api/bid-tracker/bid-notifications/${state.bidId}?role=Manager`);
        const d = await r.json();
        if (!d.success) return;
        (d.notifications || []).filter(n => !n.read).forEach(n => {
          if (window.QGNotifications?._canUse) {
            const key = 'manual_' + n.id;
            if (!QGNotifications._items.find(x => x.id === key)) {
              QGNotifications._items.unshift({ id: key, type: 'engineer_msg',
                title: `📢 ${n.senderName}`, message: `[${n.bidName}] ${n.message}`,
                bidId: n.bidId, ts: Date.now(), read: false });
              QGNotifications._save(); QGNotifications._renderBadge();
              const btn = document.getElementById('qgNotifBtn');
              if (btn) { btn.classList.add('ring'); setTimeout(() => btn.classList.remove('ring'), 700); }
            }
          }
        });
      } catch {}
    };
    poll();
    setInterval(poll, 30000);
  }

  function getUserFullName(userId) {
    if (!userId) return '—';
    if (!state.users.length) return userId;
    const user = state.users.find(u =>
      u.UserID === userId ||
      u.userId === userId ||
      u.username === userId ||
      u.email === userId
    );
    if (!user) return userId;
    return (user.fullName && user.fullName !== user.username)
      ? user.fullName
      : (user.username || userId);
  }
  function setEnhancedHeader(bid) {
    const bidName = bid.bidName || bid.name || 'Bid';
    const deadline = bid.deadline || '—';
    const client = bid.clientName || '—';
    const createdById = bid.createdBy || bid.created_user || bid.createdUser || null;
    if (el.headerBidTitleName) el.headerBidTitleName.textContent = bidName;
    if (el.displayHeaderDeadline) el.displayHeaderDeadline.textContent = deadline;
    if (el.displayHeaderClient) el.displayHeaderClient.textContent = client;
    if (el.displayHeaderCreatedBy) el.displayHeaderCreatedBy.textContent = getUserFullName(createdById);
    if (el.modalDeadlineInput) el.modalDeadlineInput.value = bid.deadline || '';
  }
  window.togglePanel = function(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const isExpanded = panel.classList.contains('expanded');
    panel.classList.toggle('expanded', !isExpanded);
    panel.classList.toggle('collapsed', isExpanded);
    const toggle = panel.querySelector('.panel-toggle span');
    if (toggle) toggle.textContent = isExpanded ? '—¼' : 'Collapse';
  };
  async function fetchBid(id) {
    // Try endpoints sequentially — avoids 3x server load on large bids
    for (const fn of API_GET_BID_TRIES) {
      try {
        const data = await fetchJSON(fn(id));
        if (data?.success === false) continue;
        const bid = data?.bid || data?.data || data || null;
        if (bid && (bid.id || bid.bidId || id)) return bid;
      } catch (e) {
        // timeout or network error — try next endpoint
        continue;
      }
    }
    throw new Error('Bid not found — check server is running');
  }
  async function loadUsers() {
    try {
      const d = await fetchJSON(API_USERS);
      if (d?.success && Array.isArray(d.users)) state.users = d.users;
    } catch {}
  }
  async function fetchExcelBinary(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }
  function workbookToTemplateData(wb) {
    const out = {};
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return out;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    for (let i = 1; i < rows.length; i++) {
      const [t, c, n] = rows[i];
      const T = (t ?? '').toString().trim();
      const C = (c ?? '').toString().trim();
      const N = (n ?? '').toString().trim();
      if (!T || !C || !N) continue;
      out[T] = out[T] || {};
      out[T][C] = out[T][C] || [];
      if (!out[T][C].includes(N)) out[T][C].push(N);
    }
    return out;
  }
  // async function loadTemplate() {
  //  //       const bufNew = await fetchExcelBinary('/NewBidTemplate.xlsx');
  //       if (bufNew) {
  //         const wb = XLSX.read(bufNew, { type: 'array' });
  //         state.templateData = workbookToTemplateData(wb);
  //         initDocTypeOptions();
  //         initNewDocTypeOptions();
  //         return;
  //       }
  //       const bufOld = await fetchExcelBinary('/BidTemplate.xlsx');
  //       if (bufOld) {
  //         const wb = XLSX.read(bufOld, { type: 'array' });
  //         state.templateData = workbookToTemplateData(wb);
  //         initDocTypeOptions();
  //         initNewDocTypeOptions();
  //         return;
  //       }
  //     }
  //   } catch (e) {
  //  //   }
  //   try {
  //     const d = await fetchJSON(API_TEMPLATE);
  //     state.templateData = d?.template || {};
  //   } catch {
  //     state.templateData = {};
  //   }
  //   initDocTypeOptions();
  //   initNewDocTypeOptions();
  // }
  async function loadTemplate() {
  try {
    if (window.XLSX) {
      const bufNew = await fetchExcelBinary('/NewBidTemplate.xlsx');
      if (bufNew) {
        const wb = XLSX.read(bufNew, { type: 'array' });
        
        // Debug the raw sheet data
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        
        state.templateData = workbookToTemplateData(wb);
        
        // Debug first document type
        const firstType = Object.keys(state.templateData)[0];
        if (firstType) {
          const firstCategory = Object.keys(state.templateData[firstType])[0];
          if (firstCategory) {
          }
        }
        
        initDocTypeOptions();
        initNewDocTypeOptions();
        return;
      }
      
      const bufOld = await fetchExcelBinary('/BidTemplate.xlsx');
      if (bufOld) {
        const wb = XLSX.read(bufOld, { type: 'array' });
        
        // Same debugging for BidTemplate.xlsx
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        
        state.templateData = workbookToTemplateData(wb);
        
        initDocTypeOptions();
        initNewDocTypeOptions();
        return;
      }
      
    } else {
    }
  } catch (e) {
  }
  
  try {
    const d = await fetchJSON(API_TEMPLATE);
    state.templateData = d?.template || {};
  } catch {
    state.templateData = {};
  }
  
  initDocTypeOptions();
  initNewDocTypeOptions();
}
  async function loadAttachmentsDirectly() {
    try {
      const response = await fetch(`${API_GET_ATTACHMENTS}?bidId=${encodeURIComponent(state.bidId)}`);
      const data = await response.json();
      if (data?.success && Array.isArray(data.attachments)) {
        data.attachments.forEach(att => {
          const type = att.type ?? att.documentType ?? '';
          const category = att.category ?? '';
          const name = att.name ?? att.document ?? '';
          const key = toKey(type, category, name);
          const existingMeta = state.existingDocMeta.get(key) || {};
          const filename = att.attachment ?? att.filename ?? att.file ?? existingMeta.attachment ?? null;
          const url = att.url ?? att.link ?? att.filePath ?? existingMeta.url ?? null;
          state.existingDocMeta.set(key, {
            ...existingMeta,
            attachment: filename,
            url: url || (filename ? `/api/bid-tracker/download/${state.bidId}/${encodeURIComponent(filename)}` : null),
            uploadDate: att.uploadDate ?? att.createdAt ?? existingMeta.uploadDate ?? null,
            uploadedBy: att.uploadedBy ?? att.userId ?? existingMeta.uploadedBy ?? null,
            status: att.status ?? existingMeta.status ?? '',
            notes: att.notes ?? existingMeta.notes ?? '',
            approvalStatus: att.approvalStatus ?? existingMeta.approvalStatus ?? APPROVAL_STATUS.PENDING,
          });
        });
      }
    } catch (e) {
    }
  }

  function loadDocsFromBid(bid) {
 // Debug log
  
  // Load document types structure - if docTypes exists, use it
  let docTypes = Array.isArray(bid.docTypes) ? bid.docTypes : [];
  
  // If no docTypes structure exists, rebuild it from documents
  if (docTypes.length === 0 && Array.isArray(bid.documents) && bid.documents.length > 0) {
    const typeMap = new Map();
    
    bid.documents.forEach(doc => {
      const type = doc.type || doc.documentType || '';
      const category = doc.category || '';
      const name = doc.name || doc.document || '';
      
      if (!type || !category || !name) return;
      
      if (!typeMap.has(type)) {
        typeMap.set(type, { type, categories: new Map() });
      }
      
      const typeObj = typeMap.get(type);
      if (!typeObj.categories.has(category)) {
        typeObj.categories.set(category, { category, names: [] });
      }
      
      const categoryObj = typeObj.categories.get(category);
      if (!categoryObj.names.includes(name)) {
        categoryObj.names.push(name);
      }
    });
    
    // Convert to expected format
    docTypes = Array.from(typeMap.values()).map(typeObj => ({
      type: typeObj.type,
      categories: Array.from(typeObj.categories.values())
    }));
    
  }
  
  state.existingDocumentTypes = docTypes.map(dt => ({
    type: dt.type,
    categories: (dt.categories || []).map(c => ({ 
      category: c.category, 
      names: [...(c.names || [])] 
    })),
  }));

  // Clear existing document metadata
  state.existingDocMeta = new Map();
  
  // Load documents with all template fields
  const rows = Array.isArray(bid.documents) ? bid.documents : [];
 // Debug log
  
  rows.forEach((r, index) => {
 // Debug log
    
    const t = r.type || r.documentType || '';
    const c = r.category || '';
    const n = r.name || r.document || '';
    if (!t || !c || !n) {
      return;
    }
    
    const k = toKey(t, c, n);
    
    // Handle attachment data
    const attachment = r.attachment || r.filename || r.attachmentName || r.file || null;
    const url = r.url || r.link || r.attachmentUrl || r.filePath || null;
    let finalUrl = url;
    if (attachment && !url) {
      finalUrl = `/api/bid-tracker/download/${state.bidId}/${encodeURIComponent(attachment)}`;
    }

    // Load all document metadata including template fields
    const docMeta = {
      // Basic document info
      status: r.status || '',
      notes: r.notes || '',
      attachment,
      url: finalUrl,
      approvalStatus: r.approvalStatus || APPROVAL_STATUS.PENDING,
      uploadDate: r.uploadDate || r.createdAt || null,
      uploadedBy: r.uploadedBy || r.userId || null,
      
      // Template fields from Excel - try multiple field name variations
      priority: r.priority || r.Priority || r.documentPriority || '',
      section: r.section || r.sectionClauseNo || r.sectionClause || r.Section || r['Section/ClauseNo'] || r['Section/Clause'] || '',
      assignedTo: r.assignedTo || r.AssignedTo || r.assigned || r.Assigned || r['Assigned To'] || '',
      dueDate: r.dueDate || r.DueDate || r.deadline || r.targetDate || '',
      
      // Finalization fields
      isFinalized:       r.isFinalized       || false,
      engineerFinalized: r.engineerFinalized || r.isFinalized || false,
      managerFinalized:  r.managerFinalized  || false,
      finalizedBy: r.finalizedBy || null,
      finalizedAt: r.finalizedAt || null,
      
      tee: (r.tee ?? r.teeSlNo ?? '') || '',
      fee: (r.fee ?? r.feeSlNo ?? '') || '',
      pee: (r.pee ?? r.peeSlNo ?? '') || '',
      notifiedAt: r.notifiedAt || null,
      notifiedTo: r.notifiedTo || null,
      managerReviewed: r.managerReviewed || false,
      managerReviewedAt: r.managerReviewedAt || null,
    };
    
 // Debug log
    state.existingDocMeta.set(k, docMeta);
  });

  // Load document type priorities
  state.documentTypePriorities = new Map();
  if (bid.documentTypePriorities && typeof bid.documentTypePriorities === 'object') {
    Object.entries(bid.documentTypePriorities).forEach(([type, priority]) => {
      state.documentTypePriorities.set(type, parseInt(priority, 10));
    });
  }
  state.prioritiesMode = state.documentTypePriorities.size > 0 ? 'display' : 'edit';

  // Reset builder state
  state.selectedDocumentTypes = [];
  state.docMeta = new Map();
  
 // Debug log
 // Debug log
}
  // Merge bid-specific document types into template data
  // state.existingDocumentTypes.forEach(dt => {
  //   if (!state.templateData[dt.type]) {
  //     state.templateData[dt.type] = {};
  //   }
  //   dt.categories.forEach(cat => {
  //     if (!state.templateData[dt.type][cat.category]) {
  //       state.templateData[dt.type][cat.category] = [];
  //     }
  //     cat.names.forEach(name => {
  //       if (!state.templateData[dt.type][cat.category].includes(name)) {
  //         state.templateData[dt.type][cat.category].push(name);
  //       }
  //     });
  //   });
  // });

  function computeDocumentsFlat() {
    // Build rows from existingDocMeta — includes ALL docs (template + manually added)
    // This ensures manually added docs show in the table and progress counts
    const rows = [];
    const seen = new Set();

    // First: docs registered in existingDocumentTypes (preserves order)
    state.existingDocumentTypes.forEach(dt => {
      dt.categories.forEach(cat => {
        cat.names.forEach(n => {
          const k = toKey(dt.type, cat.category, n);
          if (seen.has(k)) return;
          seen.add(k);
          const m = state.existingDocMeta.get(k) || {};
          rows.push({
            type: dt.type, category: cat.category, name: n,
            status: m.status || '', notes: m.notes || '',
            attachment: m.attachment || null, url: m.url || null,
            uploadDate: m.uploadDate, uploadedBy: m.uploadedBy,
            approvalStatus: m.approvalStatus || APPROVAL_STATUS.PENDING,
            section: m.section || '', assignedTo: m.assignedTo || '',
            dueDate: m.dueDate || '', priority: m.priority || '',
            isFinalized: m.isFinalized || false,
            finalizedBy: m.finalizedBy || null, finalizedAt: m.finalizedAt || null,
            tee: m.tee || '', fee: m.fee || '', pee: m.pee || '',
        notifiedAt: m.notifiedAt || null, notifiedTo: m.notifiedTo || null,
          });
        });
      });
    });

    // Then: any docs in existingDocMeta NOT already covered (manually added docs)
    state.existingDocMeta.forEach((m, k) => {
      if (seen.has(k)) return;
      if (!m.type || !m.category || !m.name) return; // skip incomplete entries
      seen.add(k);
      rows.push({
        type: m.type, category: m.category, name: m.name,
        status: m.status || '', notes: m.notes || '',
        attachment: m.attachment || null, url: m.url || null,
        uploadDate: m.uploadDate, uploadedBy: m.uploadedBy,
        approvalStatus: m.approvalStatus || APPROVAL_STATUS.PENDING,
        section: m.section || '', assignedTo: m.assignedTo || '',
        dueDate: m.dueDate || '', priority: m.priority || '',
        isFinalized: m.isFinalized || false,
        finalizedBy: m.finalizedBy || null, finalizedAt: m.finalizedAt || null,
        tee: m.tee || '', fee: m.fee || '', pee: m.pee || '',
        notifiedAt: m.notifiedAt || null, notifiedTo: m.notifiedTo || null,
      });
    });

    return rows;
  }
  function isDocumentApproved(type, category, name) {
    const meta = state.existingDocMeta.get(toKey(type, category, name)) || {};
    return meta.status === STATUS.APPROVED || meta.approvalStatus === APPROVAL_STATUS.APPROVED;
  }
  function updateProgress() {
    // Count from existingDocMeta — includes ALL docs (template + manually added)
    const allMeta = [...state.existingDocMeta.values()];
    const total = (state.totalDocs && state.totalDocs > allMeta.length) ? state.totalDocs : allMeta.length;
    const submitted   = allMeta.filter(m => m.attachment).length;
    const approved    = allMeta.filter(m => (m.status||'').trim() === STATUS.APPROVED).length;
    const rejected    = allMeta.filter(m => (m.status||'').trim() === STATUS.REJECTED || (m.status||'').trim() === 'reject').length;
    const pendingReview = allMeta.filter(m => (m.status||'').trim() === STATUS.REVIEW).length;
    const pct = total ? Math.round((approved / total) * 100) : 0;

    if (el.docsNeeded)     el.docsNeeded.textContent     = total;
    if (el.docsSubmitted)  el.docsSubmitted.textContent  = submitted;
    if (el.docsPending)    el.docsPending.textContent    = pendingReview;
    if (el.docsRejected)   el.docsRejected.textContent   = rejected;
    if (el.docsApproved)   el.docsApproved.textContent   = approved;
    if (el.progressBar)    el.progressBar.style.width    = `${pct}%`;
    if (el.progressText)   el.progressText.textContent   = `${pct}%`;
    if (el.documentsCount) el.documentsCount.textContent = `${total} documents`;
    checkBidApprovalEligibility();
    checkBidCompleteLock();
  }

  // Lock add-document form once all docs have files uploaded
  function checkBidCompleteLock() {
    const form = document.getElementById('addDocumentForm');
    if (!form) return;

    // Lock ONLY when manager/director clicked "Finalize Bid Documents" (bid.status = 'Approved')
    // Do NOT lock just because all docs are individually approved
    const shouldLock = state.bid?.status === 'Approved';

    if (shouldLock) {
      form.style.display = 'none';
      if (!document.querySelector('.bid-locked-banner')) {
        const banner = document.createElement('div');
        banner.className = 'bid-locked-banner';
        banner.style.cssText = 'background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;font-size:0.88rem;color:#991b1b;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-weight:600';
        banner.innerHTML = '<i class="fa fa-lock fa-lg"></i> Bid is finalized and approved — no new documents can be added. This bid is read-only.';
        form.insertAdjacentElement('afterend', banner);
      }
    } else {
      form.style.display = '';
      const banner = document.querySelector('.bid-locked-banner');
      if (banner) banner.remove();
    }
  }
  function checkBidApprovalEligibility() {
    if (!el.approveBidSection) return;
    const allMeta    = [...state.existingDocMeta.values()];
    const totalDocs  = allMeta.length;
    const approvedDocs = allMeta.filter(m => (m.status||'').trim() === STATUS.APPROVED).length;
    const allApproved = totalDocs > 0 && approvedDocs === totalDocs && state.bid?.status !== 'Approved';
    if (!allApproved) {
      el.approveBidSection.style.display = 'none';
      if (el.approveBidStatus) el.approveBidStatus.style.display = 'none';
      if (el.finalApproveBidBtn) el.finalApproveBidBtn.style.display = 'none';
      return;
    }
    el.approveBidSection.style.display = 'block';
    if (state.canModerate) {
      if (el.finalApproveBidBtn) el.finalApproveBidBtn.style.display = 'inline-block';
      if (el.approveBidStatus) {
        el.approveBidStatus.textContent = '';
        el.approveBidStatus.style.display = 'none';
      }
    } else {
      if (el.finalApproveBidBtn) el.finalApproveBidBtn.style.display = 'none';
      if (el.approveBidStatus) {
        el.approveBidStatus.textContent = 'Waiting for Approval';
        el.approveBidStatus.className = 'mt-3 text-muted';
        el.approveBidStatus.style.display = 'block';
      }
    }
  }
  function lockBidAfterApproval() {
    const isApproved = state.bid?.status === 'Approved';
    if (!isApproved) return;

    // Hide Add Document form completely
    const addForm = document.getElementById('addDocumentForm');
    if (addForm) {
      addForm.style.display = 'none';
      if (!document.querySelector('.bid-locked-banner')) {
        const banner = document.createElement('div');
        banner.className = 'bid-locked-banner';
        banner.style.cssText = 'background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;font-size:0.88rem;color:#991b1b;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-weight:600';
        banner.innerHTML = '<i class="fa fa-lock fa-lg"></i> Bid is finalized and approved — no new documents can be added. This bid is read-only.';
        addForm.insertAdjacentElement('afterend', banner);
      }
    }

    document.querySelectorAll('.manager-only').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    });
    if (el.editHeaderDeadlineBtn) {
      el.editHeaderDeadlineBtn.disabled = true;
      el.editHeaderDeadlineBtn.style.display = 'none';
    }
    const uploadsSection = document.getElementById('secDocumentsList');
    if (uploadsSection) {
      uploadsSection.querySelectorAll('.doc-upload-btn, .doc-save-row, .doc-remove-row').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      });
      uploadsSection.querySelectorAll('.doc-status-select, .doc-notes-input, .doc-tee, .doc-fee, .doc-pee').forEach(elem => {
        elem.disabled = true;
        elem.style.opacity = '0.5';
      });
      const existing = uploadsSection.querySelector('.locked-message');
      if (!existing) {
        const msg = document.createElement('div');
        msg.className = 'locked-message alert alert-info';
        msg.innerHTML = '<i class="fa fa-lock"></i> Document uploads are locked - Bid has been approved and finalized';
        uploadsSection.querySelector('.panel-body').prepend(msg);
      }
    }
  }
  function setupFilters() {
    updateFilterOptions();
    el.filterDocType?.addEventListener('change', () => {
      updateFilterOptions();
      applyFilters();
    });
    el.filterDocCategory?.addEventListener('change', applyFilters);
    el.filterDocName?.addEventListener('input', applyFilters);
    el.clearFiltersBtn?.addEventListener('click', clearFilters);
  }
  function updateFilterOptions() {
    const rows = computeDocumentsFlat();
    const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (el.filterDocType) {
      const cur = el.filterDocType.value || '';
      const types = uniq(rows.map(r => r.type));
      el.filterDocType.innerHTML = '<option value="">All Types</option>' + types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
      if (cur) el.filterDocType.value = cur;
    }
    if (el.filterDocCategory) {
      const selType = (el.filterDocType?.value || '').toLowerCase();
      const cur = el.filterDocCategory.value || '';
      const pool = selType ? rows.filter(r => r.type.toLowerCase() === selType) : rows;
      const cats = uniq(pool.map(r => r.category));
      el.filterDocCategory.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (cur) el.filterDocCategory.value = cur;
    }
  }
  function applyFilters() {
    const typeQ = (el.filterDocType?.value || '').toLowerCase();
    const catQ = (el.filterDocCategory?.value || '').toLowerCase();
    const nameQ = (el.filterDocName?.value || '').toLowerCase();
    const all = computeDocumentsFlat();
    state.filters = { type: typeQ, category: catQ, name: nameQ };
    state.filteredRows = all.filter(r => {
      const tOK = !typeQ || r.type.toLowerCase() === typeQ;
      const cOK = !catQ || r.category.toLowerCase() === catQ;
      const nOK = !nameQ || r.name.toLowerCase().includes(nameQ);
      return tOK && cOK && nOK;
    });
    renderDocumentsTable();
    // Make table draggable after every render
    setTimeout(() => {
      document.querySelectorAll('table thead th:not([data-nodrag])').forEach(th => {
        if (!th.getAttribute('draggable')) {
          th.setAttribute('draggable','true');
          if (!th.querySelector('.drag-handle')) {
            const h = document.createElement('span');
            h.className = 'drag-handle'; h.textContent = '⠿';
            th.appendChild(h);
          }
        }
      });
      document.querySelectorAll('table').forEach(t => { if(typeof initColResize==='function') initColResize(t); });
    }, 100);
  }
  function clearFilters() {
    if (el.filterDocType) el.filterDocType.value = '';
    if (el.filterDocCategory) el.filterDocCategory.value = '';
    if (el.filterDocName) el.filterDocName.value = '';
    state.filters = { type: '', category: '', name: '' };
    state.filteredRows = [];
    updateFilterOptions();
    renderDocumentsTable();
  }
  function initDocTypeOptions() {
    if (!el.docTypeSelect) return;
    el.docTypeSelect.innerHTML = '<option value="">Select Document Type</option>';
    Object.keys(state.templateData || {}).forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      el.docTypeSelect.appendChild(o);
      // setupNewDocumentForm();
      // initNewDocTypeOptions();
    });
    const firstType = el.docTypeSelect.options[1]?.value || null;
    if (firstType) {
      state.currentDocType = firstType;
      el.docTypeSelect.value = firstType;
      initCategoryOptions();
    } else {
      updateControls();
    }
  }

  // function initNewDocTypeOptions() {
  //   if (!el.newDocType) return;
  //   el.newDocType.innerHTML = '<option value="">Select Document Type</option>';
    
  //   // Load from Excel template data
  //   if (state.templateData && Object.keys(state.templateData).length > 0) {
  //     Object.keys(state.templateData).sort().forEach(t => {
  //       const o = document.createElement('option');
  //       o.value = t; 
  //       o.textContent = t;
  //       el.newDocType.appendChild(o);
  //     });
  //   }
  // }
  function initNewDocTypeOptions() {
    
    if (!el.newDocType) {
      return;
    }
    
    el.newDocType.innerHTML = '<option value="">Select Document Type</option>';
    
    // Load from Excel template data
    if (state.templateData && Object.keys(state.templateData).length > 0) {
      Object.keys(state.templateData).sort().forEach((t, index) => {
        const o = document.createElement('option');
        o.value = t; 
        o.textContent = t;
        el.newDocType.appendChild(o);
      });
    } else {
  }
}
  
  function initNewCategoryOptions(docType) {
    if (!el.newDocCategory || !docType) return;
    el.newDocCategory.innerHTML = '<option value="">Select Category</option>';
    el.newDocCategory.disabled = false;
    el.addNewCategoryBtn.disabled = false;
    
    if (state.templateData?.[docType]) {
      Object.keys(state.templateData[docType]).forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        el.newDocCategory.appendChild(o);
      });
    }
  }
  
  function initNewDocNameOptions(docType, category) {
    if (!el.newDocName || !docType || !category) return;
    el.newDocName.innerHTML = '<option value="">Select Document</option>';
    el.newDocName.disabled = false;
    el.addNewNameBtn.disabled = false;
    
    if (Array.isArray(state.templateData?.[docType]?.[category])) {
      state.templateData[docType][category].forEach(d => {
        const name = d.file || d;
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        el.newDocName.appendChild(o);
      });
    }
  }
  
  function setupNewDocumentForm() {
    // Document Type dropdown change
    el.newDocType?.addEventListener('change', (e) => {
      const docType = e.target.value;
      if (docType) {
        initNewCategoryOptions(docType);
        // Reset dependent dropdowns
        el.newDocName.innerHTML = '<option value="">Select Document</option>';
        el.newDocName.disabled = true;
        el.addNewNameBtn.disabled = true;
      } else {
        el.newDocCategory.innerHTML = '<option value="">Select Category</option>';
        el.newDocCategory.disabled = true;
        el.addNewCategoryBtn.disabled = true;
        el.newDocName.innerHTML = '<option value="">Select Document</option>';
        el.newDocName.disabled = true;
        el.addNewNameBtn.disabled = true;
      }
    });
    
    // Category dropdown change
    el.newDocCategory?.addEventListener('change', (e) => {
      const category = e.target.value;
      const docType = el.newDocType.value;
      if (docType && category) {
        initNewDocNameOptions(docType, category);
      } else {
        el.newDocName.innerHTML = '<option value="">Select Document</option>';
        el.newDocName.disabled = true;
        el.addNewNameBtn.disabled = true;
      }
    });
    
    // Add new type button
    el.addNewDocTypeBtn?.addEventListener('click', () => {
      if (el.newDocTypeInput.style.display === 'none') {
        el.newDocTypeInput.style.display = 'block';
        el.newDocTypeInput.focus();
        el.addNewDocTypeBtn.innerHTML = '<i class="fa fa-check"></i>';
      } else {
        const newType = el.newDocTypeInput.value.trim();
        if (newType && !state.templateData[newType]) {
          state.templateData[newType] = {};
          const option = document.createElement('option');
          option.value = newType;
          option.textContent = newType;
          el.newDocType.appendChild(option);
          el.newDocType.value = newType;
          initNewCategoryOptions(newType);
        }
        el.newDocTypeInput.style.display = 'none';
        el.newDocTypeInput.value = '';
        el.addNewDocTypeBtn.innerHTML = '<i class="fa fa-plus"></i>';
      }
    });
    
    // Add new category button
    el.addNewCategoryBtn?.addEventListener('click', () => {
      if (el.newCategoryInput.style.display === 'none') {
        el.newCategoryInput.style.display = 'block';
        el.newCategoryInput.focus();
        el.addNewCategoryBtn.innerHTML = '<i class="fa fa-check"></i>';
      } else {
        const newCategory = el.newCategoryInput.value.trim();
        const docType = el.newDocType.value;
        if (newCategory && docType && !state.templateData[docType][newCategory]) {
          state.templateData[docType][newCategory] = [];
          const option = document.createElement('option');
          option.value = newCategory;
          option.textContent = newCategory;
          el.newDocCategory.appendChild(option);
          el.newDocCategory.value = newCategory;
          initNewDocNameOptions(docType, newCategory);
        }
        el.newCategoryInput.style.display = 'none';
        el.newCategoryInput.value = '';
        el.addNewCategoryBtn.innerHTML = '<i class="fa fa-plus"></i>';
      }
    });
    
    // Add new document name button
    el.addNewNameBtn?.addEventListener('click', () => {
      if (el.newNameInput.style.display === 'none') {
        el.newNameInput.style.display = 'block';
        el.newNameInput.focus();
        el.addNewNameBtn.innerHTML = '<i class="fa fa-check"></i>';
      } else {
        const newName = el.newNameInput.value.trim();
        const docType = el.newDocType.value;
        const category = el.newDocCategory.value;
        if (newName && docType && category && !state.templateData[docType][category].includes(newName)) {
          state.templateData[docType][category].push(newName);
          const option = document.createElement('option');
          option.value = newName;
          option.textContent = newName;
          el.newDocName.appendChild(option);
          el.newDocName.value = newName;
        }
        el.newNameInput.style.display = 'none';
        el.newNameInput.value = '';
        el.addNewNameBtn.innerHTML = '<i class="fa fa-plus"></i>';
      }
    });
    
    // Save new document button
    el.saveNewDocBtn?.addEventListener('click', handleSaveNewDocument);
    
    // Reset form button
    el.resetNewDocBtn?.addEventListener('click', resetNewDocumentForm);
  }
  
  function resetNewDocumentForm() {
    el.newDocType.value = '';
    el.newDocCategory.innerHTML = '<option value="">Select Category</option>';
    el.newDocCategory.disabled = true;
    el.newDocName.innerHTML = '<option value="">Select Document</option>';
    el.newDocName.disabled = true;
    el.addNewCategoryBtn.disabled = true;
    el.addNewNameBtn.disabled = true;
    el.newDocPriority.value = '';
    el.newDocSection.value = '';
    el.newDocAssigned.value = '';
    el.newDocDueDate.value = '';
    
    // Hide custom input fields
    el.newDocTypeInput.style.display = 'none';
    el.newCategoryInput.style.display = 'none';
    el.newNameInput.style.display = 'none';
    el.addNewDocTypeBtn.innerHTML = '<i class="fa fa-plus"></i>';
    el.addNewCategoryBtn.innerHTML = '<i class="fa fa-plus"></i>';
    el.addNewNameBtn.innerHTML = '<i class="fa fa-plus"></i>';
  }
  
  async function handleSaveNewDocument() {
    // Hard block — cannot add docs to an approved/finalized bid
    if (state.bid?.status === 'Approved') {
      showNotification('Bid is finalized — no new documents can be added.', 'danger');
      return;
    }
    const allMeta = [...state.existingDocMeta.values()];
    const allDocsApproved = allMeta.length > 0 &&
      allMeta.every(m => (m.status || '').trim() === STATUS.APPROVED);
    if (allDocsApproved) {
      showNotification('All documents are approved — bid is locked.', 'danger');
      return;
    }
    try {
      // Get values from form
      const docType = el.newDocType.value.trim() || el.newDocTypeInput.value.trim();
      const category = el.newDocCategory.value.trim() || el.newCategoryInput.value.trim();
      const name = el.newDocName.value.trim() || el.newNameInput.value.trim();
      const priority = el.newDocPriority.value.trim();
      const section = el.newDocSection.value.trim();
      const assigned = el.newDocAssigned.value.trim();
      const dueDate = el.newDocDueDate.value;
      
      // Validation
      if (!docType || !category || !name) {
        showNotification('Document Type, Category, and Name are required', 'warning');
        return;
      }
      
      // Check if document already exists
      const key = toKey(docType, category, name);
      if (state.existingDocMeta.has(key)) {
        showNotification('Document already exists in the table', 'warning');
        return;
      }
      // Save to server — include ALL fields
      const addResponse = await fetch(API_ADD_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidId: state.bidId,
          documentType: docType,
          category:     category,
          document:     name,
          priority:     priority || '',
          section:      section  || '',
          assignedTo:   assigned || '',
          dueDate:      dueDate  || '',
          attachment:   null,
          url:          null,
          status:       '',
          notes:        ''
        })
      });
      const addResult = await addResponse.json();
      if (!addResult?.success) throw new Error(addResult?.message || 'Failed to add document');
      const updatedBid = await fetchBid(state.bidId);
      state.bid = updatedBid;
      loadDocsFromBid(updatedBid);
      updateProgress();       // ← refresh header stat numbers immediately

      state.existingDocumentTypes.forEach(dt => {
        if (!state.templateData[dt.type]) {
          state.templateData[dt.type] = {};
        }
        dt.categories.forEach(cat => {
          if (!state.templateData[dt.type][cat.category]) {
            state.templateData[dt.type][cat.category] = [];
          }
          cat.names.forEach(name => {
            if (!state.templateData[dt.type][cat.category].includes(name)) {
              state.templateData[dt.type][cat.category].push(name);
            }
          });
        });
      });

      // Refresh template dropdowns with new document types
      initNewDocTypeOptions();
      resetNewDocumentForm();
      renderDocumentsTable();
      updateFilterOptions();
      
      showNotification('New document added successfully', 'success');
    } catch (error) {
      showNotification('Failed to add new document', 'danger');
    }
  }





  function initCategoryOptions() {
    if (!el.categorySelect) return;
    el.categorySelect.innerHTML = '<option value="">Select Category</option>';
    const t = state.currentDocType;
    if (t && state.templateData?.[t]) {
      Object.keys(state.templateData[t]).forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        el.categorySelect.appendChild(o);
      });
    }
    const firstCat = el.categorySelect.options[1]?.value || null;
    if (firstCat) {
      state.currentCategory = firstCat;
      el.categorySelect.value = firstCat;
      initDocNameOptions();
    } else {
      updateControls();
    }
  }
  function initDocNameOptions() {
    if (!el.docNameSelect) return;
    el.docNameSelect.innerHTML = '<option value="">Select Document</option>';
    const t = state.currentDocType;
    const c = state.currentCategory;
    if (t && c && Array.isArray(state.templateData?.[t]?.[c])) {
      state.templateData[t][c].forEach(d => {
        const name = d.file || d;
        const o = document.createElement('option');
        o.value = name; o.textContent = name;
        el.docNameSelect.appendChild(o);
      });
    }
    const firstName = el.docNameSelect.options[1]?.value || null;
    if (firstName) {
      el.docNameSelect.value = firstName;
    }
    updateControls();
  }
  function updateControls() {
    const hasType = !!state.currentDocType;
    const hasCat = !!state.currentCategory;
    const hasWorkingDocs = state.workingDocuments.length > 0;
    const hasSavedCats = state.workingCategories.length > 0;
    const hasSelectedTypes = state.selectedDocumentTypes.length > 0;
    if (el.categorySelect) el.categorySelect.disabled = !hasType;
    if (el.toggleAddCategory) el.toggleAddCategory.disabled = !hasType;
    if (el.docNameSelect) el.docNameSelect.disabled = !hasCat;
    if (el.addDocumentName) el.addDocumentName.disabled = !hasCat;
    if (el.toggleAddDocument) el.toggleAddDocument.disabled = !hasCat;
    if (el.saveCategory) el.saveCategory.style.display = (hasCat && hasWorkingDocs) ? 'inline-block' : 'none';
    if (el.saveAllCategories) el.saveAllCategories.style.display = (hasSavedCats || (hasCat && hasWorkingDocs)) ? 'inline-block' : 'none';
    if (el.saveDocType) el.saveDocType.style.display = (hasSavedCats || hasSelectedTypes) ? 'inline-block' : 'none';
    if (el.addToDocuments) el.addToDocuments.style.display = hasSelectedTypes ? 'inline-block' : 'none';
    updatePreviewPath();
    renderWorkingPills();
    renderDocTypeList();
  }
  function updatePreviewPath() {
    if (!el.docPreviewPath) return;
    const t = state.currentDocType || 'Select Type';
    const c = state.currentCategory || 'Select Category';
    const d = (el.docNameSelect?.value?.trim() || el.newDocumentInput?.value?.trim() || 'Select Document');
    el.docPreviewPath.textContent = `${t} › ${c} › ${d}`;
  }
  function renderWorkingPills() {
    if (el.selectedDocNames) {
      el.selectedDocNames.innerHTML = state.workingDocuments.map((n, i) =>
        `<div class="doc-name-item">
           <span>${escapeHtml(n)}</span>
           <div><button type="button" data-act="del-doc" data-idx="${i}" class="btn btn-outline-danger btn-xs">Remove</button></div>
         </div>`).join('');
    }
    if (el.selectedCategories) {
      el.selectedCategories.innerHTML = state.workingCategories.map((c, i) =>
        `<div class="category-item">
           <span><strong>${escapeHtml(c.category)}</strong> (${c.names.length} documents)</span>
           <div><button type="button" data-act="del-cat" data-idx="${i}" class="btn btn-outline-danger btn-xs">Remove</button></div>
         </div>`).join('');
    }
    bindPillActions();
  }
  function bindPillActions() {
    document.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = () => {
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (act === 'del-doc') state.workingDocuments.splice(idx, 1);
        if (act === 'del-cat') state.workingCategories.splice(idx, 1);
        if (act === 'del-type') state.selectedDocumentTypes.splice(idx, 1);
        renderWorkingPills();
        renderDocTypeList();
        renderDocumentsTable();
        updateControls();
      };
    });
  }
  function renderDocTypeList() {
    if (!el.docTypeList) return;
    const html = state.selectedDocumentTypes.map((t, i) => {
      const totalDocs = t.categories.reduce((s, c) => s + c.names.length, 0);
      return `<div class="doc-type-item">
        <div><strong>${escapeHtml(t.type)}</strong> <span class="badge bg-primary">Built</span></div>
        <div class="text-secondary" style="margin-top:4px">${t.categories.length} categories, ${totalDocs} documents</div>
        <button type="button" data-act="del-type" data-idx="${i}" class="btn btn-outline-danger btn-xs" style="float:right;margin-top:6px">Remove</button>
      </div>`;
    }).join('');
    el.docTypeList.innerHTML = html || '<div class="text-muted small">No document types built yet…</div>';
  }
  async function persistStructure(reason) {
    try {
      const session = window.sessionManager?.getSession?.();
      const flatDocs = computeDocumentsFlat();
      const documentsWithAttachments = flatDocs.map(doc => ({
        type: doc.type, category: doc.category, name: doc.name,
        status: doc.status, notes: doc.notes,
        attachment: doc.attachment, filename: doc.attachment, attachmentName: doc.attachment,
        url: doc.url, link: doc.url, filePath: doc.url,
        approvalStatus: doc.approvalStatus, uploadDate: doc.uploadDate, uploadedBy: doc.uploadedBy,
        section: doc.section, assignedTo: doc.assignedTo, dueDate: doc.dueDate, priority: doc.priority,
        isFinalized: doc.isFinalized, finalizedBy: doc.finalizedBy, finalizedAt: doc.finalizedAt,
        tee: doc.tee || '',
        fee: doc.fee || '',
        pee: doc.pee || '',
      }));
      const priorities = {};
      state.documentTypePriorities.forEach((priority, type) => { priorities[type] = priority; });
      const payload = {
        bidId: state.bidId,
        userId: session?.userId,
        docTypes: [...state.existingDocumentTypes],
        documents: documentsWithAttachments,
        documentTypePriorities: priorities,
        reason,
      };
      const response = await fetch(API_UPDATE_BID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result?.success && !result?.ok) throw new Error(result?.message || 'Failed to persist structure');
    } catch (e) {
      if (reason === 'upload') showNotification('Upload successful but data sync failed. Please click Save button.', 'warning');
    }
  }

  function installColumnResizers() {
  const table = document.querySelector('#secDocumentsList table');
  if (!table) return;

  const thead = table.querySelector('thead');
  if (!thead) return;

  const ths = Array.from(thead.querySelectorAll('th'));
  const storageKey = `docsColWidths:${state.bidId}`;

  // Apply saved widths (if any)
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    ths.forEach((th, i) => {
      const w = saved[i];
      if (w) th.style.width = `${w}px`;
    });
  } catch {}

  ths.forEach((th, i) => {
    // ensure we don't duplicate handles on re-renders
    th.querySelector('.col-resizer')?.remove();

    th.style.position = 'relative';
    const handle = document.createElement('span');
    handle.className = 'col-resizer';
    th.appendChild(handle);

    let startX = 0;
    let startW = 0;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newW = Math.max(80, startW + dx); // min width 80px
      th.style.width = `${newW}px`;

      // keep cells in this column aligned with header width
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const td = tr.children[i];
        if (td) td.style.width = `${newW}px`;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // persist widths
      const widths = ths.map((h) => {
        const w = parseInt((h.style.width || '').replace('px', ''), 10);
        return Number.isFinite(w) && w > 0 ? w : h.offsetWidth;
      });
      try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch {}
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startW = th.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}


  // Expose page navigation globally so inline onclick can reach it
  window._docPage = function(p) {
    const allRows = state.filteredRows.length > 0 ? state.filteredRows : computeDocumentsFlat();
    const pageSize = state._pageSize || 50;
    const totalPages = Math.ceil(allRows.length / pageSize);
    state._page = Math.max(0, Math.min(p, totalPages - 1));
    renderDocumentsTable();
  };
  window._docPageSize = function(sz) {
    state._pageSize = sz;
    state._page = 0;
    renderDocumentsTable();
  };

  function renderDocumentsTable() {
    const allRows = state.filteredRows.length > 0 ? state.filteredRows : computeDocumentsFlat();
    updateFilterOptions();
    initializePriorityDocTypes();
    const tbody = el.documentsTableBody;
    if (!tbody) return;

    // Remove old pagination
    const oldPg = document.getElementById('_docPagination');
    if (oldPg) oldPg.remove();

    if (!allRows.length) {
      tbody.innerHTML = `<tr><td colspan="19" class="text-center text-muted">No documents yet</td></tr>`;
      updateProgress();
      return;
    }
    allRows.sort((a, b) => {
      const pa = state.documentTypePriorities.get(a.type) ?? Number.MAX_SAFE_INTEGER;
      const pb = state.documentTypePriorities.get(b.type) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      const ta = a.type.localeCompare(b.type);
      if (ta) return ta;
      const ca = a.category.localeCompare(b.category);
      if (ca) return ca;
      return a.name.localeCompare(b.name);
    });

    // ── Pagination ──
    const pageSize = state._pageSize || 50;
    const totalRows = allRows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    if (state._page >= totalPages) state._page = 0;
    const start = state._page * pageSize;
    const end   = Math.min(start + pageSize, totalRows);
    const pg    = state._page;

    tbody.innerHTML = allRows.slice(start, end).map(row => renderRowHTML(row)).join('');
    bindRowEvents(tbody);
    installColumnResizers();
    updateProgress();

    if (totalPages > 1) {
      const ctrl = document.createElement('div');
      ctrl.id = '_docPagination';
      ctrl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 6px;flex-wrap:wrap;font-size:0.83rem;border-top:1px solid #e2e8f0;margin-top:4px';
      ctrl.innerHTML = `
        <span style="color:#64748b">Showing <b>${start+1}–${end}</b> of <b>${totalRows}</b> documents</span>
        <div style="display:flex;gap:4px;margin-left:auto;align-items:center">
          <button onclick="_docPage(0)"        ${pg===0?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem">«</button>
          <button onclick="_docPage(${pg-1})"  ${pg===0?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem">‹ Prev</button>
          <span style="padding:4px 14px;background:#1a3f8a;color:#fff;border-radius:6px;font-weight:700;font-size:0.82rem">${pg+1} / ${totalPages}</span>
          <button onclick="_docPage(${pg+1})"  ${pg===totalPages-1?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem">Next ›</button>
          <button onclick="_docPage(${totalPages-1})" ${pg===totalPages-1?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem">»</button>
          <select onchange="_docPageSize(+this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;font-size:0.82rem;margin-left:6px">
            ${[25,50,100,200].map(n=>`<option value="${n}"${pageSize===n?' selected':''}>${n} / page</option>`).join('')}
          </select>
        </div>`;
      tbody.closest('table')?.insertAdjacentElement('afterend', ctrl);
    }
  }



  function renderRowHTML(r) {
    const key = toKey(r.type, r.category, r.name);
    const meta = state.existingDocMeta.get(key) || {};
    // Destructure for use in template literals
    const type = r.type, category = r.category, name = r.name;


    // const disabled = state.bid?.status === 'Approved' ? 'disabled' : '';
    // const isFinalized = meta.isFinalized || false;
    // const uploadDisabled = (isFinalized || state.bid?.status === 'Approved') ? 'disabled' : '';
    // const isApproved = meta.status === STATUS.APPROVED;

    const isApproved   = meta.status === STATUS.APPROVED;
    const isRejected   = meta.status === STATUS.REJECTED || (meta.status||'').toLowerCase() === 'reject';
    const isInReview   = meta.status === STATUS.REVIEW;
    // Separate finalization flags — independent per role
    const engineerFinalized = meta.engineerFinalized || meta.isFinalized || false;  // backward compat
    const managerFinalized  = meta.managerFinalized  || false;
    // isFinalized for this user's role
    const isFinalized  = state.canModerate ? managerFinalized : engineerFinalized;
    const bidApproved  = state.bid?.status === 'Approved';

    // ENGINEER: locked once submitted (In Review) or approved
    // MANAGER:  only locked when bid itself is fully approved
    const engSubmitted = !state.canModerate && isInReview;
    const rowLocked    = isApproved || bidApproved || engSubmitted;

    // ENGINEER: upload locked when finalized OR submitted OR approved
    // (must Unfinalize to re-upload — this is the intended flow)
    // MANAGER: upload locked only when approved
    const uploadDisabled = (
      bidApproved || isApproved ||
      (!state.canModerate && engineerFinalized) ||  // engineer must unfinalize first
      (isInReview && meta.attachment)               // submitted with file
    ) ? 'disabled' : '';

    const disabled = bidApproved ? 'disabled' : '';



    
    const statusVal = meta.status || '';
    const notesVal = meta.notes || '';
    const uploadedByName = getUserFullName(meta.uploadedBy);
    const tee = meta.tee || '';
    const fee = meta.fee || '';
    const pee = meta.pee || '';
    const attachmentLabel = meta.attachment ? `<div class="attachment-info">
        <div class="attachment-name line-clamp-2" title="${escapeHtml(meta.attachment)}">${escapeHtml(decodeURIComponent(meta.attachment).replace(/.*[/\\]/, ''))}</div>
        <div class="upload-status upload-success">Uploaded</div>
      </div>` : `<div class="upload-status upload-pending">No file</div>`;
    const viewBtn = meta.url ? `<a href="${escapeHtml(meta.url)}" target="_blank" class="btn btn-outline btn-xs">View</a>` : `<span class="text-muted">—</span>`;
    const downloadBtn = meta.url ? `<a href="${escapeHtml(meta.url)}" download class="btn btn-outline btn-xs">Download</a>` : `<span class="text-muted">—</span>`;
    const statusOptions = [STATUS.REVIEW, STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED]
      .map(s => `<option value="${s}" ${s === statusVal ? 'selected' : ''}>${s}</option>`).join('');
    const approveDisabled = state.canModerate ? '' : 'disabled';
    // const removeDisabled = isDocumentApproved(r.type, r.category, r.name) ? 'disabled' : '';
    const removeDisabled = (isDocumentApproved(r.type, r.category, r.name) || rowLocked) ? 'disabled' : '';
    // const evaluationDisabled = !isFinalized ? 'disabled' : '';
    // Disable evaluation/editing unless explicitly finalized
    // TEE/FEE/PEE editable for engineer: before finalize or after unfinalize (not when submitted/approved)
    // For manager: always editable unless approved
    const evaluationDisabled = state.canModerate
      ? (isApproved || bidApproved ? 'disabled' : '')
      : (isApproved || bidApproved || engSubmitted) ? 'disabled' : '';

    const finalizedClass = isFinalized ? 'finalized-document' : '';
    // ── Style constants ──
    const S_FIN   = 'display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;border:none;background:#1a3f8a;color:#fff;font-size:0.78rem;font-weight:700;cursor:pointer';
    const S_UNFIN = 'display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;border:1.5px solid #2563eb;background:#eff6ff;color:#1d4ed8;font-size:0.78rem;font-weight:600;cursor:pointer';
    const S_REFIN = 'display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;border:none;background:#d97706;color:#fff;font-size:0.78rem;font-weight:700;cursor:pointer';

    let finalizeBtn;

    if (isApproved || bidApproved) {
      finalizeBtn = `<span style="color:#059669;font-weight:700;font-size:0.78rem"><i class="fa fa-check-circle"></i> Approved</span>`;

    } else if (state.canModerate) {
      // ── MANAGER / DIRECTOR — independent, uses managerFinalized flag ──
      if (!meta.attachment) {
        finalizeBtn = `<span class="text-muted" style="font-size:0.78rem">No file</span>`;
      } else if (managerFinalized) {
        finalizeBtn = `<div style="display:flex;flex-direction:column;gap:6px">
          <span style="color:#2563eb;font-size:0.73rem;font-weight:700"><i class="fa fa-lock"></i> Finalized (you)</span>
          <button type="button" class="finalize-btn unfinalize-document-btn" data-state="finalized" style="${S_UNFIN}">
            <i class="fa fa-unlock"></i> Unfinalize
          </button>
        </div>`;
      } else {
        finalizeBtn = `<button type="button" class="finalize-btn finalize-document-btn" data-state="not-finalized" style="${S_FIN}">
          <i class="fa fa-lock"></i> Finalize
        </button>`;
      }

    } else {
      // ── ENGINEER — uses engineerFinalized flag, strict submit flow ──
      if (isRejected) {
        finalizeBtn = meta.attachment
          ? `<div style="display:flex;flex-direction:column;gap:6px">
              <span style="color:#dc2626;font-size:0.73rem;font-weight:700"><i class="fa fa-times-circle"></i> Rejected</span>
              <button type="button" class="finalize-btn finalize-document-btn" data-state="not-finalized" style="${S_REFIN}">
                <i class="fa fa-lock"></i> Re-finalize
              </button>
            </div>`
          : `<span style="color:#dc2626;font-size:0.78rem;font-weight:600"><i class="fa fa-upload"></i> Upload first</span>`;

      } else if (isInReview) {
        finalizeBtn = `<div style="display:flex;flex-direction:column;gap:6px">
          <span style="color:#d97706;font-size:0.73rem;font-weight:700"><i class="fa fa-clock"></i> Awaiting review</span>
          <button type="button" class="finalize-btn unfinalize-document-btn" data-state="finalized" style="${S_UNFIN}">
            <i class="fa fa-unlock"></i> Unfinalize
          </button>
        </div>`;

      } else if (engineerFinalized) {
        finalizeBtn = `<div style="display:flex;flex-direction:column;gap:6px">
          <span style="color:#2563eb;font-size:0.73rem;font-weight:700"><i class="fa fa-lock"></i> Finalized</span>
          <button type="button" class="finalize-btn unfinalize-document-btn" data-state="finalized" style="${S_UNFIN}">
            <i class="fa fa-unlock"></i> Unfinalize
          </button>
        </div>`;

      } else if (meta.attachment) {
        finalizeBtn = `<button type="button" class="finalize-btn finalize-document-btn" data-state="not-finalized" style="${S_FIN}">
          <i class="fa fa-lock"></i> Finalize
        </button>`;

      } else {
        finalizeBtn = `<span class="text-muted" style="font-size:0.78rem">Upload first</span>`;
      }
    }
    // Engineers: all columns locked once finalized (must unfinalize to edit)
    // Managers: columns editable even when finalized (they can always edit)
    const engLocked = state.canModerate ? false : (engineerFinalized || rowLocked);
    // Section/Clause — optional, editable for all, locked only when approved/submitted
    const sectionLocked = isApproved || bidApproved || (engSubmitted && !state.canModerate);
    const editableSection = sectionLocked
      ? escapeHtml(meta.section || '—')
      : `<div class="edit-field-container">
          <span class="edit-field-display section-display">${escapeHtml(meta.section || '')}</span>
          <input type="text" class="edit-field-input section-input form-control form-control-sm" style="display:none;" value="${escapeHtml(meta.section || '')}" />
          <button type="button" class="edit-field-btn section-edit-btn" style="display:inline-flex">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

    // AssignedTo: when locked show email from users list, when editable show input
    const assignedEmail = (() => {
      const v = meta.assignedTo || '';
      if (!v) return '—';
      // Try to find matching user and return their email
      const u = state.users.find(u =>
        u.email === v || u.username === v || u.fullName === v ||
        u.UserID === v || u.email?.toLowerCase() === v.toLowerCase()
      );
      return u?.email || v; // fall back to stored value if no match
    })();
    // AssignedTo — optional, editable for all, locked only when approved/submitted
    const assignedLocked = isApproved || bidApproved || (engSubmitted && !state.canModerate);
    const editableAssigned = assignedLocked
      ? `<span style="font-size:0.82rem;color:#374151">${escapeHtml(assignedEmail)}</span>`
      : `<div class="edit-field-container">
          <span class="edit-field-display assigned-display">${escapeHtml(meta.assignedTo || '')}</span>
          <input type="text" class="edit-field-input assigned-input form-control form-control-sm" style="display:none;" value="${escapeHtml(meta.assignedTo || '')}" />
          <button type="button" class="edit-field-btn assigned-edit-btn" style="display:inline-flex">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

    // DueDate — optional, editable for all, locked only when approved/submitted
    const dueLocked = isApproved || bidApproved || (engSubmitted && !state.canModerate);
    const editableDueDate = dueLocked
      ? (formatDate(meta.dueDate) || '—')
      : `<div class="edit-field-container">
          <span class="edit-field-display due-date-display">${formatDate(meta.dueDate) || ''}</span>
          <input type="date" class="edit-field-input due-date-input form-control form-control-sm" style="display:none;" value="${meta.dueDate || ''}" />
          <button type="button" class="edit-field-btn due-date-edit-btn" style="display:inline-flex">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

        //  const editableTee = `<div class="edit-field-container">
        //    <span class="edit-field-display tee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(tee || '')}</span>
        //    <input type="text" class="edit-field-input tee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(tee || '')}" placeholder="e.g., 1, 1.a" />
        //     <button type="button" class="edit-field-btn tee-edit-btn" style="display:${isFinalized ? 'inline-flex' : 'none'};" title="${isFinalized ? 'Edit' : 'Finalize to edit'}">
        //      <i class="fa fa-edit"></i>
        //    </button>
        //  </div>`;

        const editableTee = `<div class="edit-field-container">
           <span class="edit-field-display tee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(tee || '')}</span>
           <input type="text" class="edit-field-input tee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(tee || '')}" placeholder="e.g., 1, 1.a" ${(!state.canModerate && engSubmitted) ? 'disabled' : ''} />
            <button type="button" class="edit-field-btn tee-edit-btn" style="display:${!rowLocked && !isApproved && !engSubmitted ? 'inline-flex' : 'none'}" title="Edit">
             <i class="fa fa-edit"></i>
           </button>
         </div>`;

          const editableFee = `<div class="edit-field-container">
                <span class="edit-field-display fee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(fee || '')}</span>
                <input type="text" class="edit-field-input fee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(fee || '')}" placeholder="e.g., 1, 1.a" ${(!state.canModerate && engSubmitted) ? 'disabled' : ''} />
                <button type="button" class="edit-field-btn fee-edit-btn" style="display:${!rowLocked && !isApproved && !engSubmitted ? 'inline-flex' : 'none'}" title="Edit">
                  <i class="fa fa-edit"></i>
                </button>
              </div>`;
          const editablePee = `<div class="edit-field-container">
                <span class="edit-field-display pee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(pee || '')}</span>
                <input type="text" class="edit-field-input pee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(pee || '')}" placeholder="e.g., 1, 1.a" ${(!state.canModerate && engSubmitted) ? 'disabled' : ''} />
                <button type="button" class="edit-field-btn pee-edit-btn" style="display:${!rowLocked && !isApproved && !engSubmitted ? 'inline-flex' : 'none'}" title="Edit">
                  <i class="fa fa-edit"></i>
                </button>
              </div>`;
          const rowClass = `${finalizedClass} ${rowLocked ? 'row-locked' : ''}`;
          return `
            <tr data-key="${escapeHtml(key)}" class="${rowClass}"${(!state.canModerate && meta.status === STATUS.REVIEW) ? ' data-submitted="true"' : ''}>
        <td>${escapeHtml(r.type)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td class="text-start">${escapeHtml(r.name)}</td>
        <td class="text-center">
          <span class="priority-display">${state.documentTypePriorities.has(r.type) ? state.documentTypePriorities.get(r.type) : (meta.priority ? escapeHtml(meta.priority) : '-')}</span>
        </td>
        <td>${editableSection}</td>
        <td>${editableAssigned}</td>
        <td>${editableDueDate}</td>
        <td>
          <div class="file-actions">
            ${(!state.canModerate && engineerFinalized && meta.attachment && !isInReview && !isApproved && !isRejected)
              ? `<span style="font-size:0.71rem;color:#64748b;font-style:italic;display:block;padding:2px 0">Unfinalize to re-upload</span>`
              : (isApproved
                ? `<span style="font-size:0.71rem;color:#059669;font-style:italic">Approved</span>`
                : `<button type="button" class="btn btn-outline btn-xs doc-upload-btn" ${uploadDisabled}
                    ${uploadDisabled ? 'title="Locked"' : 'title="Upload file"'}
                  >Upload</button>`)
            }
            ${attachmentLabel}
          </div>
        </td>

        <td class="text-center">${viewBtn}</td>
        <td class="text-center">${downloadBtn}</td>
        <td class="text-center">${escapeHtml(uploadedByName || '—')}</td>
        <td style="min-width:160px;vertical-align:middle">
          ${(() => {
            // Normalize for comparison — handles escaped HTML and case differences
            const _nn = s => (s||'').toLowerCase().replace(/&amp;/g,'&').trim();
            const _nm = _nn(name), _nc = _nn(category);

            // last manager→engineer feedback for this doc
            const managerMsg = (state.bidNotifications || []).find(n =>
              n.toRole === 'Engineer' && n.fromRole !== 'Engineer' &&
              _nn(n.docName) === _nm && _nn(n.category) === _nc && n.type !== 'cleared'
            );
            // manager clicked 'Notified' (cleared) — no message needed
            const managerCleared = meta.managerReviewed === true ||
              (state.bidNotifications || []).some(n =>
                n.type === 'cleared' && n.fromRole !== 'Engineer' &&
                _nn(n.docName) === _nm && _nn(n.category) === _nc
              );
            // last engineer→manager notification for this doc
            const engNotif = (state.bidNotifications || []).find(n =>
              n.toRole === 'Manager' && n.fromRole === 'Engineer' &&
              _nn(n.docName) === _nm && _nn(n.category) === _nc
            );

            if (isApproved || bidApproved) {
              return `<span style="color:#059669;font-size:0.75rem;font-weight:600">
                <i class="fa fa-check-circle"></i> Approved</span>`;
            }

            // ── MANAGER / DIRECTOR ──────────────────────────────────
            if (state.canModerate) {
              return `<div style="display:flex;flex-direction:column;gap:5px">
                ${engNotif
                  ? `<span title="${escapeHtml(engNotif.message)} (${new Date(engNotif.ts).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})})"
                      style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:10px;
                        font-size:0.73rem;font-weight:600;background:#d1fae5;color:#065f46;cursor:default;
                        max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      <i class="fa fa-bell"></i>
                      ${escapeHtml(engNotif.message.slice(0,22))}${engNotif.message.length>22?'…':''}
                    </span>`
                  : engineerFinalized
                    ? `<span style="font-size:0.73rem;color:#d97706;font-weight:600">
                        <i class="fa fa-clock"></i> Awaiting notification</span>`
                    : `<span style="color:#9ca3af;font-size:0.74rem">—</span>`
                }
                <div style="display:flex;gap:5px;flex-wrap:wrap">
                  <button type="button" class="doc-notify-engineer-btn"
                    data-doc="${escapeHtml(name)}" data-cat="${escapeHtml(category)}" data-type="${escapeHtml(type)}"
                    style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                      border-radius:8px;border:1.5px solid #f59e0b;background:#fffbeb;color:#b45309;
                      font-size:0.73rem;font-weight:600;cursor:pointer">
                    <i class="fa fa-reply"></i> ${managerMsg ? 'Re-feedback' : 'Feedback'}
                  </button>
                  <button type="button" class="doc-mark-notified-btn"
                    data-doc="${escapeHtml(name)}" data-cat="${escapeHtml(category)}" data-type="${escapeHtml(type)}"
                    style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                      border-radius:8px;border:1.5px solid #059669;background:#d1fae5;color:#065f46;
                      font-size:0.73rem;font-weight:600;cursor:pointer">
                    <i class="fa fa-check"></i> Notified
                  </button>
                </div>
                ${managerMsg
                  ? `<span style="font-size:0.7rem;color:#64748b;font-style:italic;
                      max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${escapeHtml(managerMsg.message)}">
                      ✓ "${escapeHtml(managerMsg.message.slice(0,24))}${managerMsg.message.length>24?'…':''}"
                    </span>`
                  : managerCleared
                    ? `<span style="font-size:0.7rem;color:#059669;font-weight:600">
                        ✓ Marked as notified</span>`
                  : ''
                }
              </div>`;
            }

            // ── ENGINEER ────────────────────────────────────────────
            // Show manager's response (feedback message OR "Notified" cleared status)
            // Then show Notify Manager button (only when finalized & not yet submitted)
            return `<div style="display:flex;flex-direction:column;gap:5px">

              ${/* Manager sent feedback message */managerMsg
                ? `<span title="${escapeHtml(managerMsg.message)} — ${new Date(managerMsg.ts).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}"
                    style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:10px;
                      font-size:0.73rem;font-weight:600;background:#fef3c7;color:#92400e;cursor:default;
                      max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    <i class="fa fa-comment"></i>
                    ${escapeHtml(managerMsg.message.slice(0,24))}${managerMsg.message.length>24?'…':''}
                  </span>`
                : managerCleared
                  ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;
                      border-radius:10px;font-size:0.73rem;font-weight:600;background:#d1fae5;color:#065f46">
                      <i class="fa fa-check-circle"></i> Reviewed — can submit
                    </span>`
                  : ''
              }

              ${/* Notify Manager button — shown when finalized, not yet submitted/approved */
                engineerFinalized && !isInReview && !isApproved
                ? `<button type="button" class="doc-notify-manager-btn"
                    data-doc="${escapeHtml(name)}" data-cat="${escapeHtml(category)}" data-type="${escapeHtml(type)}"
                    style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                      border-radius:8px;border:1.5px solid #1a3f8a;background:#eff6ff;color:#1a3f8a;
                      font-size:0.73rem;font-weight:600;cursor:pointer">
                    <i class="fa fa-bell"></i>
                    ${engNotif ? 'Re-notify Manager' : 'Notify Manager'}
                  </button>`
                : isInReview
                  ? `<span style="font-size:0.73rem;color:#64748b;font-style:italic">Submitted</span>`
                  : !engineerFinalized
                    ? `<span style="color:#9ca3af;font-size:0.74rem">—</span>`
                    : ''
              }

            </div>`;
          })()}
                </td>
        <td class="text-center">${finalizeBtn}</td>
        <td>${editableTee}</td>
        <td>${editableFee}</td>
        <td>${editablePee}</td>
        <td>
          <span class="status-display">${escapeHtml(statusVal || 'Not Started')}</span>
        </td>
        <td class="doc-approval-cell">
          ${(() => {
            // Use already-computed flags from row scope
            const isPending    = meta.status === STATUS.PENDING;
            const isAdded      = meta.status === STATUS.ADDED;
            const hasFile      = !!meta.attachment;

            // Reuse style constants from finalize section
            const AP = 'display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;border:none;background:#059669;color:#fff;font-size:0.78rem;font-weight:700;cursor:pointer';
            const RJ = 'display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:0.78rem;font-weight:700;cursor:pointer';
            const AR_ROW = 'display:flex;gap:8px;align-items:center;margin-top:4px';

            // ── APPROVED — shown to everyone ──
            if (isApproved || bidApproved) {
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:#d1fae5;color:#059669;border:1.5px solid #6ee7b7">
                <i class="fa fa-check-circle"></i> Approved
              </span>`;
            }

            // ── REJECTED — shown to everyone ──
            if (isRejected) {
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5">
                <i class="fa fa-times-circle"></i> Rejected
              </span>`;
            }

            // ════════════════════════════════════════════
            // MANAGER / DIRECTOR — can always approve/reject when file exists
            // Independent of engineer's finalize state
            // ════════════════════════════════════════════
            if (state.canModerate) {
              if (!hasFile) {
                return `<span class="text-muted small">Awaiting upload</span>`;
              }
              const label = isInReview
                ? `<span style="font-size:0.71rem;color:#d97706;font-weight:700;display:block;margin-bottom:4px"><i class="fa fa-clock"></i> Submitted for review</span>`
                : isFinalized
                  ? `<span style="font-size:0.71rem;color:#2563eb;font-weight:700;display:block;margin-bottom:4px"><i class="fa fa-lock"></i> Finalized</span>`
                  : `<span style="font-size:0.71rem;color:#64748b;font-weight:600;display:block;margin-bottom:4px"><i class="fa fa-file"></i> File uploaded</span>`;
              return `<div>
                ${label}
                <div style="${AR_ROW}">
                  <button type="button" class="doc-approve-btn" style="${AP}" onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
                    <i class="fa fa-check"></i> Approve
                  </button>
                  <button type="button" class="doc-reject-btn" style="${RJ}" onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">
                    <i class="fa fa-times"></i> Reject
                  </button>
                </div>

              </div>`;
            }

            // ════════════════════════════════════════════
            // ENGINEER — strict Submit flow
            // Only Submit button after Finalize; locked while In Review
            // ════════════════════════════════════════════
            if (isInReview) {
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:#fef3c7;color:#d97706;border:1.5px solid #fcd34d">
                <i class="fa fa-paper-plane"></i> Submitted
              </span>`;
            }
            if (isFinalized) {
              return `<button type="button" class="btn-doc-submit" style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:8px;border:none;background:#2563c8;color:#fff;font-size:0.82rem;font-weight:700;cursor:pointer" onmouseover="this.style.background='#1a3f8a'" onmouseout="this.style.background='#2563c8'">
                <i class="fa fa-paper-plane"></i> Submit for Review
              </button>`;
            }
            if (hasFile) {
              return `<span class="text-muted small" style="font-size:0.8rem">Finalize to submit</span>`;
            }
            return `<span class="text-muted small" style="font-size:0.8rem">Upload first</span>`;
          })()}
        </td>
        <td> 
         <textarea class="form-control form-control-sm doc-notes-input" rows="1" ${evaluationDisabled||(engSubmitted?'disabled':'')}>${escapeHtml(notesVal)}</textarea>
        </td>
        <td class="doc-actions-cell">
          <div class="doc-action-row">
            <button type="button" class="btn btn-success btn-xs doc-save-row" ${evaluationDisabled||engSubmitted?'disabled':''} aria-label="Save" title="Save"><i class="fa fa-save"></i></button>
            <button type="button" class="btn btn-danger btn-xs doc-remove-row ${removeDisabled ? 'disabled' : ''}" ${(removeDisabled || disabled) ? 'disabled' : ''} aria-label="Remove" title="Remove"><i class="fa fa-trash"></i></button>
        </td>
      </tr>
    `;
  }
  function bindRowEvents(tbody) {
    tbody.querySelectorAll('tr').forEach(tr => {
      const key = tr.getAttribute('data-key');
      if (!key) return;
      const [type, category, name] = key.split('||').map(s => s.replaceAll('&amp;', '&'));
      const uploadBtn = tr.querySelector('.doc-upload-btn');
      uploadBtn?.addEventListener('click', () => handleUploadFile(type, category, name, tr));
      const saveBtn = tr.querySelector('.doc-save-row');
      saveBtn?.addEventListener('click', () => handleSaveRow(type, category, name, tr));
      const removeBtn = tr.querySelector('.doc-remove-row');
      removeBtn?.addEventListener('click', () => handleRemoveRow(type, category, name));
            // Robust query (support both legacy and new class names)
      const approveBtn = tr.querySelector('.doc-approve-btn, .btn-approve');
      const rejectBtn  = tr.querySelector('.doc-reject-btn, .btn-reject');
      approveBtn?.addEventListener('click', () => handleApproveReject(type, category, name, true));
      rejectBtn?.addEventListener('click', () => handleApproveReject(type, category, name, false));

      // Manager: Notify Engineer per-doc button
      const notifyEngBtn = tr.querySelector('.doc-notify-engineer-btn');
      notifyEngBtn?.addEventListener('click', () => openNotifyEngineerModal(type, category, name));

      // Manager: "Notified" button — clears mandatory check without message
      const markNotifiedBtn = tr.querySelector('.doc-mark-notified-btn');
      markNotifiedBtn?.addEventListener('click', () => handleMarkDocNotified(type, category, name));

      // Engineer: Notify Manager per-doc button
      const notifyMgrBtn = tr.querySelector('.doc-notify-manager-btn');
      notifyMgrBtn?.addEventListener('click', () => openNotifyManagerDocModal(type, category, name));

      // New: Submit ↑ sets status and reveals actions appropriately
      const submitBtn = tr.querySelector('.btn-doc-submit');
      submitBtn?.addEventListener('click', () => handleSubmitForApproval(type, category, name, tr));

      const finalizeBtn = tr.querySelector('.finalize-document-btn');

      finalizeBtn?.addEventListener('click', () => handleFinalizeDocument(type, category, name, true));
      const unfinalizeBtn = tr.querySelector('.unfinalize-document-btn');
      unfinalizeBtn?.addEventListener('click', () => handleFinalizeDocument(type, category, name, false));
      bindEditFieldEvents(tr, type, category, name);
    });
  }
  function bindEditFieldEvents(tr, type, category, name) {
   const fields = ['section', 'assigned', 'due-date', 'tee', 'fee', 'pee'];
    fields.forEach(field => {
      const editBtn = tr.querySelector(`.${field}-edit-btn`);
      const display = tr.querySelector(`.${field}-display`);
      const input = tr.querySelector(`.${field}-input`);
      if (!editBtn || !display || !input) return;
      editBtn.addEventListener('click', () => {
        const key = toKey(type, category, name);
        const meta = state.existingDocMeta.get(key) || {};
        const isFinalized = meta.isFinalized || false;

        // TEE/FEE/PEE: editable before AND after finalize, only blocked when submitted/approved
        // Section/Assigned/Due-date: blocked when engineerFinalized (must unfinalize to edit)
        const isTEEField = ['tee','fee','pee'].includes(field);
        const curMeta = state.existingDocMeta.get(toKey(type, category, name)) || {};
        const curSubmitted = curMeta.status === STATUS.REVIEW;
        const curApproved  = curMeta.status === STATUS.APPROVED;
        if (curApproved) return; // nothing editable after approve
        if (isTEEField && !state.canModerate && curSubmitted) return; // TEE locked after submit
        if (!isTEEField) {
          // Section/assigned/due-date: locked when finalized for engineer
          const curFinalized = curMeta.engineerFinalized || curMeta.isFinalized || false;
          if (!state.canModerate && curFinalized) return;
        }
        display.style.display = 'none';
        input.style.display = 'inline-block';
        editBtn.innerHTML = '<i class="fa fa-check"></i>';
        editBtn.className = 'edit-field-btn save-btn';
        input.focus();
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'edit-field-btn cancel-btn';
        cancelBtn.innerHTML = '<i class="fa fa-times"></i>';
        cancelBtn.onclick = () => cancelEdit();
        editBtn.parentNode.insertBefore(cancelBtn, editBtn.nextSibling);
        const cancelEdit = () => {
          display.style.display = 'inline-block';
          input.style.display = 'none';
          editBtn.innerHTML = '<i class="fa fa-edit"></i>';
          editBtn.className = `edit-field-btn ${field}-edit-btn manager-only`;
          cancelBtn.remove();
        };
        editBtn.onclick = () => saveEdit();
        const saveEdit = async () => {
          try {
            const newValue = input.value.trim();
            
            // TEE/FEE/PEE accept any value including duplicates across rows
            // (multiple docs can share the same priority number)
            
            const fieldMap = { 
              'section': 'section', 
              'assigned': 'assignedTo', 
              'due-date': 'dueDate',
              'tee': 'tee',
              'fee': 'fee', 
              'pee': 'pee'
            };
            const fieldName = fieldMap[field];
            meta[fieldName] = newValue;
            // For TEE/FEE/PEE, store both as direct field and in priorities object
            if (['tee', 'fee', 'pee'].includes(fieldName)) {
              meta[fieldName] = newValue; // Store as direct field
              if (!meta.priorities) meta.priorities = {};
              meta.priorities[fieldName] = { slNo: newValue, category: '' }; // Backward compatibility
            }
            state.existingDocMeta.set(key, meta);

            // persist via the working /api/bid-tracker/update-bid route
            await persistStructure('inline-field-edit');

            // refresh UI 
            display.textContent = (field === 'due-date') ? formatDate(newValue) : newValue;
            cancelEdit();
            showNotification(`${fieldName} updated successfully`, 'success');

          } catch (error) {
            showNotification(`Failed to update ${field}`, 'danger');
            cancelEdit();
          }
        };
      });
    });
  }
  async function handleFinalizeDocument(type, category, name, finalize) {
    try {
      const key = toKey(type, category, name);
      const meta = state.existingDocMeta.get(key) || {};
      if (finalize && !meta.attachment) {
        if (!confirm('No attachment found for this document. Finalize anyway?')) return;
      }

      // When unfinalize: reset status from In Review back to Added Attachment
      // so engineer can re-upload and re-submit
      const isCurrentlyInReview = (meta.status || '') === STATUS.REVIEW;
      const resetToAdded = !finalize && isCurrentlyInReview;

      const wasRejected = (meta.status === 'Rejected') || (meta.status||'').toLowerCase() === 'reject';
      const currentUserId = (window.sessionManager?.getSession?.() || {}).userId;
      const currentUserRole = (window.sessionManager?.getSession?.() || {}).userType || '';
      const payload = {
        bidId: state.bidId,
        type, category, name,
        finalize,
        userId: currentUserId,
        userRole: currentUserRole,
        finalizedBy: finalize ? currentUserId : null,
        resetStatus: (finalize && wasRejected) || resetToAdded
      };
      const response = await fetch(API_FINALIZE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result?.success && !result?.ok) throw new Error(result?.message || 'Failed to finalize document');
      // Update the correct flag based on role
      if (/manager|director|admin/i.test(currentUserRole)) {
        meta.managerFinalized = finalize;
      } else {
        meta.engineerFinalized = finalize;
        meta.isFinalized = finalize;
        // Reset status on unfinalize so row re-renders correctly
        if (!finalize && resetToAdded) {
          meta.status = meta.attachment ? STATUS.ADDED : '';
        }
      }
      meta.finalizedBy = finalize ? currentUserId : null;
      meta.finalizedAt = finalize ? new Date().toISOString() : null;
      state.existingDocMeta.set(key, meta);
      // Re-render from local state — no re-fetch needed, avoids wiping all loaded docs
      renderDocumentsTable();
      updateProgress();
      showNotification(finalize ? 'Document finalized successfully' : 'Document unfinalized successfully', 'success');
    } catch (error) {
      showNotification('Failed to finalize document', 'danger');
    }
  }

  async function handleSubmitForApproval(type, category, name, tr) {
    try {
      const key = toKey(type, category, name);
      const meta = state.existingDocMeta.get(key) || {};

      // Must have a file
      if (!meta.attachment) {
        showNotification('Upload a file before submitting for review.', 'danger');
        return;
      }

      // meta.managerReviewed = true when manager clicked "Notified"
      // Also treat docs already In Review / Approved / Rejected as reviewed (old bids)
      const alreadyReviewed = meta.managerReviewed ||
        [STATUS.REVIEW, STATUS.APPROVED, STATUS.REJECTED].includes((meta.status||'').trim()) ||
        (meta.status||'').toLowerCase() === 'reject';

      if (!alreadyReviewed) {
        // Check if manager gave feedback (without clicking Notified)
        const normName = (s) => (s||'').toLowerCase().replace(/&amp;/g,'&').trim();
        const _hasFeedback = (state.bidNotifications || []).some(n =>
          n.toRole === 'Engineer' && n.fromRole !== 'Engineer' && n.type !== 'cleared' &&
          normName(n.docName) === normName(name) &&
          normName(n.category) === normName(category)
        );
        const _engNotified = (state.bidNotifications || []).some(n =>
          n.toRole === 'Manager' && n.fromRole === 'Engineer' &&
          normName(n.docName) === normName(name) &&
          normName(n.category) === normName(category)
        );
        if (!_engNotified) {
          showNotification('Notify the manager first using "Notify Manager" in the Notified column.', 'danger');
        } else if (_hasFeedback) {
          showNotification('Manager sent feedback — make changes, re-notify, and wait for manager to click "Notified".', 'warning');
        } else {
          showNotification('Waiting for manager to click "Notified" before you can submit.', 'warning');
        }
        return;
      }



      // Validate TEE/FEE/PEE must be filled before engineer submits
      if (!meta.tee || !meta.fee || !meta.pee) {
        const missing = [
          !meta.tee && 'TEE',
          !meta.fee && 'FEE',
          !meta.pee && 'PEE',
        ].filter(Boolean).join(', ');
        showNotification(
          `Please fill ${missing} reference number${missing.includes(',') ? 's' : ''} before submitting.`,
          'danger'
        );
        return;
      }

      // Persist to server first
      const payload = {
        bidId: state.bidId,
        type, category, name,
        status: STATUS.REVIEW,  // Set to "In Review"
        notes: meta.notes || '',
        priorities: meta.priorities || {
          tee: { slNo: meta.tee || '', category: '' },
          fee: { slNo: meta.fee || '', category: '' },
          pee: { slNo: meta.pee || '', category: '' },
        }
      };
      const r = await fetch(API_UPDATE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || 'Submit failed');
      
      // Update client state AFTER successful server response
      meta.status = STATUS.REVIEW;
      state.existingDocMeta.set(key, meta);
      
      // Re-render the entire table to ensure consistent state
      renderDocumentsTable();
      showNotification('Submitted for approval', 'success');
    } catch (e) {
      showNotification('Failed to submit for approval', 'danger');
    }
  }

  async function handleUploadFile(type, category, name, tr) {
    if (state.bid?.status === 'Approved') return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.onchange = async () => {
      if (!fileInput.files || fileInput.files.length === 0) {
        document.body.removeChild(fileInput);
        return;
      }
      const file = fileInput.files[0];
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('bidId', state.bidId);
        fd.append('type', type);
        fd.append('category', category);
        fd.append('name', name);
        const r = await fetch(API_UPLOAD_ATTACHMENT, { method: 'POST', body: fd });
        const d = await r.json();
        if (!d?.success && !d?.ok) throw new Error(d?.message || 'Upload failed');
        const key = toKey(type, category, name);
        const existingMeta = state.existingDocMeta.get(key) || {};
        const filename = d.filename || d.storedName || file.name;
        const url = d.url || existingMeta.url || `/api/bid-tracker/download/${state.bidId}/${encodeURIComponent(filename)}`;
        state.existingDocMeta.set(key, {
          ...existingMeta,
          attachment: filename,
          url,
          // status: STATUS.REVIEW,
          status: existingMeta.status || STATUS.ADDED,

          uploadDate: new Date().toISOString(),
          uploadedBy: (window.sessionManager?.getSession?.() || {}).userId,
        });
        await persistStructure('upload');
        renderDocumentsTable();
        showNotification('File uploaded', 'success');
      } catch (e) {
        showNotification('Upload failed', 'danger');
      } finally {
        document.body.removeChild(fileInput);
      }
    };
  }
  async function handleSaveRow(type, category, name, tr) {
    try {
      const key = toKey(type, category, name);
      const notes = tr.querySelector('.doc-notes-input');
      const meta = state.existingDocMeta.get(key) || {};
      // Status is now automatic - don't change it manually
      meta.notes = notes?.value || meta.notes || '';
      
      // TEE/FEE/PEE values are now handled by inline editing, not here
      // Keep existing values
      meta.tee = meta.tee || '';
      meta.fee = meta.fee || '';  
      meta.pee = meta.pee || '';
      
      // // Update priorities object for backward compatibility
      // meta.priorities = {
      //   tee: { slNo: meta.tee, category: '' },
      //   fee: { slNo: meta.fee, category: '' },
      //   pee: { slNo: meta.pee, category: '' },
      // };
      state.existingDocMeta.set(key, meta);
      const payload = {
        bidId: state.bidId,
        type,
        category,
        name,
        status: meta.status,
        notes: meta.notes,
        priorities: meta.priorities,
      };
      const r = await fetch(API_UPDATE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || 'Save failed');
      showNotification('Row saved', 'success');
      updateProgress();
    } catch (e) {
      showNotification('Failed to save row', 'danger');
    }
  }
  async function handleRemoveRow(type, category, name) {
    try {
      if (state.bid?.status === 'Approved') return;
      if (isDocumentApproved(type, category, name)) return;
      if (!confirm('Remove this document from the bid?')) return;
      const r = await fetch(API_REMOVE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: state.bidId, type, category, name }),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || 'Remove failed');
      // state.existingDocumentTypes.forEach(dt => {
      //   if (dt.type !== type) return;
      //   dt.categories.forEach(cat => {
      //     if (cat.category !== category) return;
      //     cat.names = cat.names.filter(n => n !== name);
      //   });
      //   dt.categories = dt.categories.filter(c => c.names.length > 0);
      // });
      // state.existingDocumentTypes = state.existingDocumentTypes.filter(dt => dt.categories.length > 0);
      // state.existingDocMeta.delete(toKey(type, category, name));
      // await persistStructure('remove');
      const updatedBid = await fetchBid(state.bidId);
      loadDocsFromBid(updatedBid);
      renderDocumentsTable();
      showNotification('Document removed', 'success');
    } catch (e) {
      showNotification('Failed to remove document', 'danger');
    }
  }
  async function handleApproveReject(type, category, name, approve) {
  try {
    if (!state.canModerate) return;
    
    if (approve) {
      // Show approval confirmation modal first
      const modalEl = document.getElementById('approvalInfoModal');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = new bootstrap.Modal(modalEl);
        
        // Set up one-time event listeners for approve/cancel buttons
        const approveBtn = modalEl.querySelector('#approvalConfirmBtn');
        const cancelBtn = modalEl.querySelector('#approvalCancelBtn');
        
        const handleApprove = async () => {
          modal.hide();
          await processApproval(type, category, name);
          cleanup();
        };
        
        const handleCancel = () => {
          modal.hide();
          cleanup();
        };
        
        const cleanup = () => {
          approveBtn.removeEventListener('click', handleApprove);
          cancelBtn.removeEventListener('click', handleCancel);
        };
        
        approveBtn.addEventListener('click', handleApprove);
        cancelBtn.addEventListener('click', handleCancel);
        
        modal.show();
      } else {
        // Fallback if modal not available
        await processApproval(type, category, name);
      }
    } else {
      // Handle rejection with reason prompt
      await processRejection(type, category, name);
    }
  } catch (e) {
    showNotification('Failed to update approval', 'danger');
  }
}  
  // ── Engineer: Notify Manager for a specific doc (from Notified column) ──

  // ── Manager: "Notified" — clears submit block without message ──────
  async function handleMarkDocNotified(docType, docCat, docName) {
    const session = window.sessionManager?.getSession?.() || {};
    try {
      const r = await fetch('/api/bid-tracker/send-notification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidId: state.bidId,
          message: '(Reviewed — engineer can proceed)',
          fromUserId: session.userId, fromRole: 'Manager', toRole: 'Engineer',
          senderName: session.fullName || session.username || 'Manager',
          docType, category: docCat, docName, notifType: 'cleared'
        })
      });
      const d = await r.json();
      if (d.success) {
        state.bidNotifications = state.bidNotifications || [];
        state.bidNotifications.unshift({
          id: Date.now().toString(36), toRole: 'Engineer', fromRole: 'Manager',
          type: 'cleared', docName, category: docCat,
          message: '(Reviewed — engineer can proceed)',
          senderName: session.fullName || session.username || 'Manager',
          ts: new Date().toISOString()
        });
        // Also set flag on local meta for immediate submit unlock
        const key = toKey(docType, docCat, docName);
        const localMeta = state.existingDocMeta.get(key);
        if (localMeta) {
          localMeta.managerReviewed = true;
          localMeta.managerReviewedAt = new Date().toISOString();
        }
        renderDocumentsTable();
        showNotification('Marked as notified — engineer can now submit ✓', 'success');
      }
    } catch { showNotification('Failed', 'danger'); }
  }

  // ── Manager: Notify Engineer for a specific doc ─────────────────────
  // ── Shared notify modal for both flows ──────────────────────────────
  function _openNotifyModal(opts, docType, docCat, docName) {
    const { title, btnColor, fromRole, toRole } = opts;
    const existing = document.getElementById('_notifySharedModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = '_notifySharedModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:22px;width:430px;max-width:95vw;
        box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <i class="fa fa-bell" style="color:${btnColor}"></i>
          <h6 style="margin:0;color:#1a3f8a;font-weight:700;font-size:1rem">${title}</h6>
        </div>
        <p style="margin:0 0 10px;font-size:0.78rem;color:#64748b">
          Doc: <strong>${escapeHtml(docName)}</strong>
        </p>
        <textarea id="_notifySharedText" maxlength="300"
          placeholder="Type your message... (max 300 characters)"
          style="width:100%;height:90px;border:1.5px solid #d1d5db;border-radius:8px;
            padding:9px;font-size:0.88rem;resize:none;box-sizing:border-box;font-family:inherit"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
          <span id="_notifySharedCount" style="font-size:0.74rem;color:#94a3b8">0 / 300</span>
          <div style="display:flex;gap:8px">
            <button id="_notifySharedCancel" style="padding:6px 14px;border-radius:8px;
              border:1.5px solid #d1d5db;background:#f8fafc;cursor:pointer;font-size:0.82rem;font-weight:600">
              Cancel</button>
            <button id="_notifySharedSend" style="padding:6px 18px;border-radius:8px;border:none;
              background:${btnColor};color:#fff;font-weight:700;cursor:pointer;font-size:0.82rem">
              <i class="fa fa-paper-plane"></i> Send</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const ta = modal.querySelector('#_notifySharedText');
    const cnt = modal.querySelector('#_notifySharedCount');
    ta?.addEventListener('input', () => {
      const l = ta.value.length;
      cnt.textContent = `${l} / 300`;
      cnt.style.color = l > 270 ? '#dc2626' : '#94a3b8';
    });
    modal.querySelector('#_notifySharedCancel')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#_notifySharedSend')?.addEventListener('click', async () => {
      const msg = ta?.value?.trim();
      if (!msg) { showNotification('Please type a message.', 'warning'); return; }
      const session = window.sessionManager?.getSession?.() || {};
      const sendBtn = modal.querySelector('#_notifySharedSend');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/bid-tracker/send-notification', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidId: state.bidId, message: msg,
            fromUserId: session.userId, fromRole, toRole,
            senderName: session.fullName || session.username || fromRole,
            docType, category: docCat, docName
          })
        });
        const d = await res.json();
        if (d.success) {
          modal.remove();
          state.bidNotifications = state.bidNotifications || [];
          state.bidNotifications.unshift({
            id: Date.now().toString(36), toRole, fromRole,
            docName, category: docCat, type: docType, message: msg,
            senderName: session.fullName || session.username || fromRole,
            ts: new Date().toISOString()
          });
          renderDocumentsTable();
          showNotification(`${toRole === 'Manager' ? 'Manager' : 'Engineer'} notified ✓`, 'success');
        } else showNotification('Failed: ' + (d.message||'Error'), 'danger');
      } catch { showNotification('Failed to send', 'danger'); }
      finally { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Send'; }
    });
    ta?.focus();
  }

  // ── Engineer: Notify Manager per-doc ────────────────────────────────
  function openNotifyManagerDocModal(docType, docCat, docName) {
    _openNotifyModal({ title: 'Notify Manager', btnColor: '#1a3f8a',
      fromRole: 'Engineer', toRole: 'Manager' }, docType, docCat, docName);
  }

  // ── Manager: Send Feedback to Engineer per-doc ───────────────────────
  function openNotifyEngineerModal(docType, docCat, docName) {
    _openNotifyModal({ title: 'Send Feedback to Engineer', btnColor: '#f59e0b',
      fromRole: 'Manager', toRole: 'Engineer' }, docType, docCat, docName);
  }


  async function processApproval(type, category, name) {
    try {
      // Manager cannot approve without a file
      const key = toKey(type, category, name);
      const meta = state.existingDocMeta.get(key) || {};
      if (!meta.attachment) {
        showNotification('Cannot approve — no file has been uploaded for this document.', 'danger');
        return;
      }
      // Manager cannot approve without TEE/FEE/PEE filled
      if (!meta.tee || !meta.fee || !meta.pee) {
        const missing = [!meta.tee && 'TEE', !meta.fee && 'FEE', !meta.pee && 'PEE']
          .filter(Boolean).join(', ');
        showNotification(
          `Fill ${missing} before approving. You can still Reject without them.`,
          'danger'
        );
        return;
      }
      const payload = { bidId: state.bidId, type, category, name, action: 'approve' };
      const r = await fetch(API_APPROVE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || `Server error ${r.status}`);
      const updatedBid = await fetchBid(state.bidId);
      loadDocsFromBid(updatedBid);
      renderDocumentsTable();
      updateProgress();
      // Reload attachments so View/Download/UploadedBy show immediately without refresh
      loadAttachmentsDirectly().then(() => renderDocumentsTable()).catch(() => {});
      showNotification('Document approved ✓', 'success');
    } catch (e) {
      showNotification('Failed to approve: ' + e.message, 'danger');
    }
  }

  async function processRejection(type, category, name) {
    try {
      const reason = prompt('Reason for rejection (optional):');
      if (reason === null) return;
      const payload = { bidId: state.bidId, type, category, name, action: 'reject', reason };
      const r = await fetch(API_APPROVE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || `Server error ${r.status}`);
      const updatedBid = await fetchBid(state.bidId);
      loadDocsFromBid(updatedBid);
      renderDocumentsTable();
      updateProgress();
      // Reload attachments so columns update immediately
      loadAttachmentsDirectly().then(() => renderDocumentsTable()).catch(() => {});
      showNotification('Document rejected — engineer notified', 'warning');
    } catch (e) {
      showNotification('Failed to reject: ' + e.message, 'danger');
    }
  }

  async function exportDocuments() {
    try {
      const r = await fetch(API_GENERATE_MASTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: state.bidId }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${(state.bid?.bidName || 'Bid')}_Documents.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showNotification('Exported to Excel', 'success');
        return;
      }
      const rows = computeDocumentsFlat();
      // const headers = ['Type','Category','Document','Priority','Section','AssignedTo','DueDate','Status','Notes','Attachment','UploadedBy','UploadDate','URL','IsFinalized','FinalizedBy','FinalizedAt','TEE SlNo','TEE Category','FEE SlNo','FEE Category','PEE SlNo','PEE Category'];
      const headers = [
              'Document Type',
              'Category',
              'Document Name',
              'Section/Clause',
              'TEE',
              'FEE',
              'PEE',
              'Attachment(FilePath)'
            ];

      const csv = [
        headers.join(','),
        ...rows.map(r => {
          const m = state.existingDocMeta.get(toKey(r.type, r.category, r.name)) || {};
          // const cols = [
          //   r.type, r.category, r.name, r.priority || '', m.section || '', m.assignedTo || '', m.dueDate || '',
          //   m.status || '', (m.notes || '').replace(/\n/g, ' ').replace(/,/g, ';'),
          //   m.attachment || '', getUserFullName(m.uploadedBy || ''), m.uploadDate || '', m.url || '',
          //   m.isFinalized || false, getUserFullName(m.finalizedBy || ''), m.finalizedAt || '',
          //   m.priorities?.tee?.slNo || '', m.priorities?.tee?.category || '',
          //   m.priorities?.fee?.slNo || '', m.priorities?.fee?.category || '',
          //   m.priorities?.pee?.slNo || '', m.priorities?.pee?.category || '',
          // ];
          const cols = [
                        r.type,                          // Document Type
                        r.category,                      // Category
                        r.name,                          // Document Name
                        (m.section || ''),               // Section/Clause
                        (m.tee || ''),                   // TEE
                        (m.fee || ''),                   // FEE
                        (m.pee || ''),                   // PEE
                        (m.url || '')                    // Attachment(FilePath)
                      ];

          return cols.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',');
        })
      ].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${(state.bid?.bidName || 'Bid')}_Documents.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showNotification('Exported to CSV (fallback)', 'info');
    } catch (e) {
      showNotification('Export failed', 'danger');
    }
  }

  async function approveWholeBid() {
    try {
      if (!state.canModerate) return;
      if (!confirm('Please recheck before finalizing')) return;
            // ⬇️ get current user id from session (covers multiple key names)
      const session = (window.sessionManager?.getSession && sessionManager.getSession()) || {};
      const userId = session.userId || session.UserID || session.username || '';
      if (!userId) {
        showNotification('Cannot approve: missing user session.', 'danger');
        return;
      }
      const r = await fetch(API_APPROVE_BID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: state.bidId, userId }),
      });
      const d = await r.json();
      if (!r.ok || (!d?.success && !d?.ok)) {
        throw new Error(d?.message || `Approve failed (${r.status})`);
      }

      state.bid.status = 'Approved';
      lockBidAfterApproval();
      renderDocumentsTable();
      updateProgress();
      checkBidCompleteLock();
      showNotification('Bid approved and locked', 'success');
      try {
        await exportDocuments();
      } catch (err) {
        showNotification('Master file generation failed', 'danger');
      }
    } catch (e) {
      showNotification('Failed to approve bid', 'danger');
    }
  }
  function initializePriorityDocTypes() {
    if (!el.priorityDocTypeSelect) return;
    const types = [...new Set(state.existingDocumentTypes.map(t => t.type))].sort((a,b)=>a.localeCompare(b));
    el.priorityDocTypeSelect.innerHTML = `<option value="">Select Type</option>` + types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  }
  function renderPriorityDisplay() {
    if (!el.priorityDisplay || !el.priorityList) return;
    el.priorityDisplay.style.display = 'block';
    if (el.priorityEdit) el.priorityEdit.style.display = 'none';
    const pairs = [...state.documentTypePriorities.entries()].sort((a,b)=>a[1]-b[1]);
    el.priorityList.innerHTML = pairs.length
      ? pairs.map(([type, val]) => `<li>${escapeHtml(type)} — <strong>${val}</strong></li>`).join('')
      : '<div class="text-muted">No priorities set.</div>';
  }
  function renderPriorityAssignments() {
    if (!el.priorityDisplay || !el.priorityEdit) return;
    el.priorityDisplay.style.display = 'none';
    el.priorityEdit.style.display = 'block';
    if (el.priorityAssignments) {
      const entries = [...state.documentTypePriorities.entries()].sort((a,b)=>a[1]-b[1]);
      el.priorityAssignments.innerHTML = entries.length
        ? entries.map(([type, val]) =>
            `<div class="d-flex align-items-center justify-content-between mb-2">
               <span>${escapeHtml(type)}</span>
               <div class="d-flex align-items-center gap-2">
                 <input type="number" class="form-control form-control-sm priority-inline" data-type="${escapeHtml(type)}" value="${val}" style="width:100px">
                 <button type="button" class="btn btn-outline-danger btn-sm remove-priority" data-type="${escapeHtml(type)}">Remove</button>
               </div>
             </div>`).join('')
        : '<div class="text-muted">No assignments yet.</div>';
      el.priorityAssignments.querySelectorAll('.remove-priority').forEach(b => {
        b.onclick = () => {
          const t = b.getAttribute('data-type');
          state.documentTypePriorities.delete(t);
          renderPriorityAssignments();
        };
      });
      el.priorityAssignments.querySelectorAll('.priority-inline').forEach(inp => {
        inp.onchange = () => {
          const t = inp.getAttribute('data-type');
          const v = parseInt(inp.value, 10);
          if (!isFinite(v)) return;
          state.documentTypePriorities.set(t, v);
        };
      });
    }
  }
  function wirePrioritiesModalEvents() {
    function updatePriorityButtons() {
      const hasType = !!(el.priorityDocTypeSelect?.value || '').trim();
      const val = parseInt(el.priorityValueInput?.value, 10);
      const hasValue = Number.isFinite(val);
      if (el.assignPriorityBtn) {
        el.assignPriorityBtn.disabled = !(hasType && hasValue);
      }
      if (el.savePrioritiesBtn) {
        el.savePrioritiesBtn.disabled = (state.documentTypePriorities.size === 0);
      }
    }
    el.priorityDocTypeSelect?.addEventListener('change', updatePriorityButtons);
    el.priorityValueInput?.addEventListener('input', updatePriorityButtons);
    el.priorityAssignments?.addEventListener('input', (e) => {
      if (e.target.classList?.contains('priority-inline')) {
        updatePriorityButtons();
      }
    });
    el.priorityAssignments?.addEventListener('click', (e) => {
      if (e.target.closest?.('.remove-priority')) {
        setTimeout(updatePriorityButtons, 0);
      }
    });
    el.assignPriorityBtn?.addEventListener('click', () => {
      const t = el.priorityDocTypeSelect?.value?.trim();
      const v = parseInt(el.priorityValueInput?.value, 10);
      if (!t || !Number.isFinite(v)) {
        showNotification('Select a Type and enter a numeric priority.', 'warning');
        return;
      }
      state.documentTypePriorities.set(t, v);
      if (el.priorityValueInput) el.priorityValueInput.value = '';
      renderPriorityAssignments();
      updatePriorityButtons();
    });
    el.savePrioritiesBtn?.addEventListener('click', async () => {
      await persistStructure('priorities-save');
      renderDocumentsTable();
      const modal = bootstrap.Modal.getInstance(el.managePrioritiesModal);
      modal?.hide();
      showNotification('Priorities saved', 'success');
    });
    el.cancelPrioritiesBtn?.addEventListener('click', () => {
      const modal = bootstrap.Modal.getInstance(el.managePrioritiesModal);
      modal?.hide();
    });
    el.editPrioritiesBtn?.addEventListener('click', () => {
      state.prioritiesMode = 'edit';
      renderPriorityAssignments();
      updatePriorityButtons();
    });
    el.managePrioritiesBtn?.addEventListener('click', () => {
      if (!state.canModerate) return;
      const modal = new bootstrap.Modal(el.managePrioritiesModal);
      modal.show();
      initializePriorityDocTypes();
      if (state.documentTypePriorities.size > 0) {
        renderPriorityDisplay();
      } else {
        renderPriorityAssignments();
      }
      setTimeout(updatePriorityButtons, 0);
    });
  }
  (async () => {
    try {
      const id = qparam('id');
      if (!id) throw new Error('Missing bid id');
      state.bidId = id;
      // ── Load users first so names show correctly on first render ──
      await loadUsers();
      const bid = await fetchBid(id);
      state.bid = bid;
      state.totalDocs = bid.totalDocs || bid.documentsRequired || 0;
      setEnhancedHeader(bid);
      loadDocsFromBid(bid);
      // Load notifications for this bid
      state.bidNotifications = [];
      fetch(`/api/bid-tracker/bid-notifications/${state.bidId}`)
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            state.bidNotifications = d.notifications || [];
            renderDocumentsTable(); // re-render with notifications
          }
        }).catch(() => {});
      checkUserPermissions();
      setupNewDocumentForm();

      // ── Show page immediately — don't wait for template or attachments ──
      el.loading.style.display = 'none';
      el.content.style.display = 'block';
      renderDocumentsTable();
      setupFilters();
      checkBidApprovalEligibility();
      lockBidAfterApproval();
      checkBidCompleteLock();
      startManagerNotifPoll();

      // ── Load template and attachments in background after page is visible ──
      loadAttachmentsDirectly().then(() => {
        renderDocumentsTable();   // re-render once attachments arrive
      }).catch(() => {});

      loadTemplate().then(() => {
        // Merge bid-specific document types into template data
        state.existingDocumentTypes.forEach(dt => {
          if (!state.templateData[dt.type]) {
            state.templateData[dt.type] = {};
          }
          dt.categories.forEach(cat => {
            if (!state.templateData[dt.type][cat.category]) {
              state.templateData[dt.type][cat.category] = [];
            }
            cat.names.forEach(name => {
              if (!state.templateData[dt.type][cat.category].includes(name)) {
                state.templateData[dt.type][cat.category].push(name);
              }
            });
          });
        });
        initNewDocTypeOptions();
      }).catch(() => {});
      document.querySelectorAll('.panel').forEach(panel => {
        const toggle = panel.querySelector('.panel-toggle span');
        if (panel.id === 'secDocumentsList') {
        // keep "Upload Documents" expanded by default
        panel.classList.remove('collapsed');
        panel.classList.add('expanded');
        if (toggle) toggle.textContent = 'Collapse';
      } else {
        // other panels start collapsed
        panel.classList.add('collapsed');
        panel.classList.remove('expanded');
        if (toggle) toggle.textContent = '—¼';
      }
      });
      document.querySelectorAll('.panel-header').forEach(header => {
        header.addEventListener('click', () => {
          const panel = header.closest('.panel');
          if (panel) togglePanel(panel.id);
        });
      });
      document.querySelectorAll('.panel-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const panel = btn.closest('.panel');
          if (panel) togglePanel(panel.id);
        });
      });
      el.editHeaderDeadlineBtn?.addEventListener('click', () => {
        if (!state.canModerate) return;
        const modal = new bootstrap.Modal(el.editDeadlineModal);
        modal.show();
      });
      el.saveHeaderDeadlineBtn?.addEventListener('click', async () => {
        const newDeadline = el.modalDeadlineInput?.value;
        if (!newDeadline) return;
        try {
          await fetch(API_UPDATE_BID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bidId: state.bidId, deadline: newDeadline }),
          });
          if (el.displayHeaderDeadline) el.displayHeaderDeadline.textContent = newDeadline;
          state.bid.deadline = newDeadline;
          bootstrap.Modal.getInstance(el.editDeadlineModal)?.hide();
          showNotification('Deadline updated successfully', 'success');
        } catch {
          showNotification('Failed to update deadline', 'danger');
        }
      });
      wirePrioritiesModalEvents();
      el.refreshDocumentsBtn?.addEventListener('click', async () => {
        await loadAttachmentsDirectly();
        renderDocumentsTable();
        showNotification('Refreshed', 'success');
      });
            // Remove the Export button from the UI completely
      el.exportDocsBtn?.remove();

      // el.exportDocsBtn?.addEventListener('click', exportDocuments);
      el.forceSaveBtn?.addEventListener('click', async () => {
        await persistStructure('force-save');
        showNotification('Saved', 'success');
      });
      el.testUploadLogicBtn?.addEventListener('click', () => {
        showNotification('Test: upload logic OK (client side)', 'info');
      });
      el.finalApproveBidBtn?.addEventListener('click', approveWholeBid);
    } catch (e) {
      el.loading.style.display = 'none';
      el.error.style.display = 'block';
      el.errorMessage.textContent = 'Failed to load bid: ' + (e.message || e);
    }
  })();
});