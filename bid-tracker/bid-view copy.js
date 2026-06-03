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
  const fetchJSON = async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  };
  const normalize = s => (s ?? '').toString().trim().toLowerCase();
  const toKey = (t, c, n) => `${normalize(t)}|||${normalize(c)}|||${normalize(n)}`;
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
    const userRole = session?.role || session?.roleName || session?.userRole || '';
    state.canModerate = !!(
      window.sessionManager?.hasAnyRole
        ? sessionManager.hasAnyRole(['Admin', 'Manager', 'Director'])
        : /admin|manager|director/i.test(userRole)
    );
    state.canEditFinalized = !!(
      window.sessionManager?.hasAnyRole
        ? sessionManager.hasAnyRole(['Admin', 'Director'])
        : /admin|director/i.test(userRole)
    );
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
  function getUserFullName(userId) {
    if (!userId || !state.users.length) return userId || 'â€”';
    const user = state.users.find(u => u.username === userId || u.UserID === userId);
    if (!user) return userId || 'â€”';
    return user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
  }
  function setEnhancedHeader(bid) {
    const bidName = bid.bidName || bid.name || 'Bid';
    const deadline = bid.deadline || 'â€”';
    const client = bid.clientName || 'â€”';
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
    if (toggle) toggle.textContent = isExpanded ? 'â–¼' : 'Collapse';
  };
  async function fetchBid(id) {
    for (const fn of API_GET_BID_TRIES) {
      try {
        const data = await fetchJSON(fn(id));
        if (data?.success === false) continue;
        const bid = data?.bid || data?.data || data || null;
        if (bid && (bid.id || bid.bidId || id)) return bid;
      } catch {}
    }
    throw new Error('Not found');
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
  async function loadTemplate() {
    try {
      if (window.XLSX) {
        const bufNew = await fetchExcelBinary('/NewBidTemplate.xlsx');
        if (bufNew) {
          const wb = XLSX.read(bufNew, { type: 'array' });
          state.templateData = workbookToTemplateData(wb);
          initDocTypeOptions();
          return;
        }
        const bufOld = await fetchExcelBinary('/BidTemplate.xlsx');
        if (bufOld) {
          const wb = XLSX.read(bufOld, { type: 'array' });
          state.templateData = workbookToTemplateData(wb);
          initDocTypeOptions();
          return;
        }
      }
    } catch (e) {
      console.warn('Excel template load failed:', e);
    }
    try {
      const d = await fetchJSON(API_TEMPLATE);
      state.templateData = d?.template || {};
    } catch {
      state.templateData = {};
    }
    initDocTypeOptions();
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
      console.warn('Attachment preload failed:', e);
    }
  }

  function loadDocsFromBid(bid) {
  console.log('Loading bid data:', bid); // Debug log
  
  // Load document types structure - if docTypes exists, use it
  let docTypes = Array.isArray(bid.docTypes) ? bid.docTypes : [];
  
  // If no docTypes structure exists, rebuild it from documents
  if (docTypes.length === 0 && Array.isArray(bid.documents) && bid.documents.length > 0) {
    console.log('No docTypes found, rebuilding from documents...');
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
    
    console.log('Rebuilt docTypes:', docTypes);
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
  console.log('Processing documents:', rows); // Debug log
  
  rows.forEach((r, index) => {
    console.log(`Processing document ${index + 1}:`, r); // Debug log
    
    const t = r.type || r.documentType || '';
    const c = r.category || '';
    const n = r.name || r.document || '';
    if (!t || !c || !n) {
      console.warn('Skipping incomplete document:', r);
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
      isFinalized: r.isFinalized || false,
      finalizedBy: r.finalizedBy || null,
      finalizedAt: r.finalizedAt || null,
      
      tee: (r.tee ?? r.teeSlNo ?? '') || '',
      fee: (r.fee ?? r.feeSlNo ?? '') || '',
      pee: (r.pee ?? r.peeSlNo ?? '') || '',
    };
    
    console.log(`Document metadata for ${k}:`, docMeta); // Debug log
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
  
  console.log('Final document metadata map:', state.existingDocMeta); // Debug log
  console.log('Document types:', state.existingDocumentTypes); // Debug log
}

  function computeDocumentsFlat() {
    const rows = [];
    state.existingDocumentTypes.forEach(dt => {
      dt.categories.forEach(cat => {
        cat.names.forEach(n => {
          const k = toKey(dt.type, cat.category, n);
          const m = state.existingDocMeta.get(k) || {};
          rows.push({
            type: dt.type,
            category: cat.category,
            name: n,
            status: m.status || '',
            notes: m.notes || '',
            attachment: m.attachment || null,
            url: m.url || null,
            uploadDate: m.uploadDate,
            uploadedBy: m.uploadedBy,
            approvalStatus: m.approvalStatus || APPROVAL_STATUS.PENDING,
            section: m.section || '',
            assignedTo: m.assignedTo || '',
            dueDate: m.dueDate || '',
            priority: m.priority || '',
            isFinalized: m.isFinalized || false,
            finalizedBy: m.finalizedBy || null,
            finalizedAt: m.finalizedAt || null,
            tee: m.tee || '',
            fee: m.fee || '',
            pee: m.pee || '',
          });
        });
      });
    });
    return rows;
  }
  function isDocumentApproved(type, category, name) {
    const meta = state.existingDocMeta.get(toKey(type, category, name)) || {};
    return meta.status === STATUS.APPROVED || meta.approvalStatus === APPROVAL_STATUS.APPROVED;
  }
  function updateProgress() {
    const rows = computeDocumentsFlat();
    const total = rows.length;
    let submitted = 0;
    let approved = 0;
    let rejected = 0;
    let pendingReview = 0;
    rows.forEach(r => {
      const meta = state.existingDocMeta.get(toKey(r.type, r.category, r.name)) || {};
      const s = (meta.status || '').trim().toLowerCase();
      if (meta.attachment) submitted += 1;
      if (s === STATUS.APPROVED.toLowerCase()) approved += 1;
      else if (s === STATUS.REJECTED.toLowerCase() || s === 'reject') rejected += 1;
      else if (s === STATUS.REVIEW.toLowerCase()) pendingReview += 1;
    });
    const pct = total ? Math.round((approved / total) * 100) : 0;
    if (el.docsNeeded) el.docsNeeded.textContent = total;
    if (el.docsSubmitted) el.docsSubmitted.textContent = submitted;
    if (el.docsPending) el.docsPending.textContent = pendingReview;
    if (el.docsRejected) el.docsRejected.textContent = rejected;
    if (el.docsApproved) el.docsApproved.textContent = approved;
    if (el.progressBar) el.progressBar.style.width = `${pct}%`;
    if (el.progressText) el.progressText.textContent = `${pct}%`;
    if (el.documentsCount) el.documentsCount.textContent = `${total} documents`;
    checkBidApprovalEligibility();
  }
  function checkBidApprovalEligibility() {
    if (!el.approveBidSection) return;
    const totalDocs = computeDocumentsFlat().length;
    const approvedDocs = computeDocumentsFlat().filter(doc => {
      const meta = state.existingDocMeta.get(toKey(doc.type, doc.category, doc.name)) || {};
      return (meta.status || '').trim().toLowerCase() === STATUS.APPROVED.toLowerCase();
    }).length;
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
    el.docPreviewPath.textContent = `${t} â€º ${c} â€º ${d}`;
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
    el.docTypeList.innerHTML = html || '<div class="text-muted small">No document types built yetâ€¦</div>';
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
      console.log('Saving documents with TEE/FEE/PEE:', documentsWithAttachments);
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
      console.warn('persistStructure failed:', reason, e);
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
    // ensure we donâ€™t duplicate handles on re-renders
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


  function renderDocumentsTable() {
    const rows = state.filteredRows.length > 0 ? state.filteredRows : computeDocumentsFlat();
    updateFilterOptions();
    initializePriorityDocTypes();
    const tbody = el.documentsTableBody;
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="19" class="text-center text-muted">No documents yet</td></tr>`;
      updateProgress();
      return;
    }
    rows.sort((a, b) => {
      const pa = state.documentTypePriorities.get(a.type) ?? Number.MAX_SAFE_INTEGER;
      const pb = state.documentTypePriorities.get(b.type) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      const ta = a.type.localeCompare(b.type);
      if (ta) return ta;
      const ca = a.category.localeCompare(b.category);
      if (ca) return ca;
      return a.name.localeCompare(b.name);
    });
    tbody.innerHTML = rows.map(row => renderRowHTML(row)).join('');
    bindRowEvents(tbody);
    installColumnResizers();  
    updateProgress();
  }



  function renderRowHTML(r) {
    const key = toKey(r.type, r.category, r.name);
    const meta = state.existingDocMeta.get(key) || {};


    // const disabled = state.bid?.status === 'Approved' ? 'disabled' : '';
    // const isFinalized = meta.isFinalized || false;
    // const uploadDisabled = (isFinalized || state.bid?.status === 'Approved') ? 'disabled' : '';
    // const isApproved = meta.status === STATUS.APPROVED;

    const disabled = state.bid?.status === 'Approved' ? 'disabled' : '';
    const isFinalized = meta.isFinalized || false;
    const isApproved = meta.status === STATUS.APPROVED;
    const uploadDisabled = (isFinalized || state.bid?.status === 'Approved' || isApproved) ? 'disabled' : '';
    const rowLocked = isApproved || state.bid?.status === 'Approved';



    
    const statusVal = meta.status || '';
    const notesVal = meta.notes || '';
    const uploadedByName = getUserFullName(meta.uploadedBy);
    const tee = meta.tee || '';
    const fee = meta.fee || '';
    const pee = meta.pee || '';
    const attachmentLabel = meta.attachment ? `<div class="attachment-info">
        <div class="attachment-name line-clamp-2" title="${escapeHtml(meta.attachment)}">${escapeHtml(meta.attachment)}</div>
        <div class="upload-status upload-success">Uploaded</div>
      </div>` : `<div class="upload-status upload-pending">No file</div>`;
    const viewBtn = meta.url ? `<a href="${escapeHtml(meta.url)}" target="_blank" class="btn btn-outline btn-xs">View</a>` : `<span class="text-muted">â€”</span>`;
    const downloadBtn = meta.url ? `<a href="${escapeHtml(meta.url)}" download class="btn btn-outline btn-xs">Download</a>` : `<span class="text-muted">â€”</span>`;
    const statusOptions = [STATUS.REVIEW, STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED]
      .map(s => `<option value="${s}" ${s === statusVal ? 'selected' : ''}>${s}</option>`).join('');
    const approveDisabled = state.canModerate ? '' : 'disabled';
    // const removeDisabled = isDocumentApproved(r.type, r.category, r.name) ? 'disabled' : '';
    const removeDisabled = (isDocumentApproved(r.type, r.category, r.name) || rowLocked) ? 'disabled' : '';
    // const evaluationDisabled = !isFinalized ? 'disabled' : '';
    // Disable evaluation/editing unless explicitly finalized
    const evaluationDisabled = ((isFinalized && !isApproved) && !rowLocked) ? '' : 'disabled';

    const finalizedClass = isFinalized ? 'finalized-document' : '';
    const finalizeBtn = isFinalized 
      ? `<div class="finalized-indicator"><i class="fa fa-check"></i> Finalized</div>
         <button type="button" class="finalize-btn director-admin-only unfinalize-document-btn" data-state="finalized" style="display:${state.canEditFinalized ? 'inline-flex' : 'none'};">
           <i class="fa fa-unlock"></i> Unfinalize
         </button>`
      : `<button type="button" class="finalize-btn finalize-document-btn" data-state="not-finalized">
           <i class="fa fa-lock"></i> Finalize
         </button>`;
    const editableSection = (isFinalized || rowLocked) ? escapeHtml(meta.section || '')
      : `<div class="edit-field-container">
          <span class="edit-field-display section-display">${escapeHtml(meta.section || '')}</span>
          <input type="text" class="edit-field-input section-input form-control form-control-sm" style="display:none;" value="${escapeHtml(meta.section || '')}" />
          <button type="button" class="edit-field-btn section-edit-btn manager-only" style="display:${(!isFinalized && !rowLocked && state.canModerate) ? 'inline-flex' : 'none'};">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

    const editableAssigned = (isFinalized || rowLocked) ? escapeHtml(meta.assignedTo || '')
      : `<div class="edit-field-container">
          <span class="edit-field-display assigned-display">${escapeHtml(meta.assignedTo || '')}</span>
          <input type="text" class="edit-field-input assigned-input form-control form-control-sm" style="display:none;" value="${escapeHtml(meta.assignedTo || '')}" />
          <button type="button" class="edit-field-btn assigned-edit-btn manager-only" style="display:${(!isFinalized && !rowLocked && state.canModerate) ? 'inline-flex' : 'none'};">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

    const editableDueDate = (isFinalized || rowLocked) ? formatDate(meta.dueDate)
      : `<div class="edit-field-container">
          <span class="edit-field-display due-date-display">${formatDate(meta.dueDate) || ''}</span>
          <input type="date" class="edit-field-input due-date-input form-control form-control-sm" style="display:none;" value="${meta.dueDate || ''}" />
          <button type="button" class="edit-field-btn due-date-edit-btn manager-only" style="display:${(!isFinalized && !rowLocked && state.canModerate) ? 'inline-flex' : 'none'};">
            <i class="fa fa-edit"></i>
          </button>
        </div>`;

         const editableTee = `<div class="edit-field-container">
           <span class="edit-field-display tee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(tee || '')}</span>
           <input type="text" class="edit-field-input tee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(tee || '')}" placeholder="e.g., 1, 1.a" />
            <button type="button" class="edit-field-btn tee-edit-btn" style="display:${isFinalized ? 'inline-flex' : 'none'};" title="${isFinalized ? 'Edit' : 'Finalize to edit'}">
             <i class="fa fa-edit"></i>
           </button>
         </div>`;
          const editableFee = `<div class="edit-field-container">
                <span class="edit-field-display fee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(fee || '')}</span>
                <input type="text" class="edit-field-input fee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(fee || '')}" placeholder="e.g., 1, 1.a" />
                <button type="button" class="edit-field-btn fee-edit-btn" style="display:${isFinalized ? 'inline-flex' : 'none'};" title="${isFinalized ? 'Edit' : 'Finalize to edit'}">
                  <i class="fa fa-edit"></i>
                </button>
              </div>`;
          const editablePee = `<div class="edit-field-container">
                <span class="edit-field-display pee-display" title="Example: 1, 2, 1.a, 2.b">${escapeHtml(pee || '')}</span>
                <input type="text" class="edit-field-input pee-input form-control form-control-sm" style="display:none;" value="${escapeHtml(pee || '')}" placeholder="e.g., 1, 1.a" />
                <button type="button" class="edit-field-btn pee-edit-btn" style="display:${isFinalized ? 'inline-flex' : 'none'};" title="${isFinalized ? 'Edit' : 'Finalize to edit'}">
                  <i class="fa fa-edit"></i>
                </button>
              </div>`;
    return `
      <tr data-key="${escapeHtml(key)}" class="${finalizedClass}">
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
            <button
              type="button"
              class="btn btn-outline btn-xs doc-upload-btn"
              ${uploadDisabled}
              ${uploadDisabled ? 'aria-disabled="true" title="Locked after Finalize"' : ''}
            >Upload</button>
            ${attachmentLabel}
          </div>
        </td>

        <td class="text-center">${viewBtn}</td>
        <td class="text-center">${downloadBtn}</td>
        <td class="text-center">${escapeHtml(uploadedByName || 'â€”')}</td>
        <td class="text-center">${finalizeBtn}</td>
        <td>${editableTee}</td>
        <td>${editableFee}</td>
        <td>${editablePee}</td>
        <td>
          <span class="status-display">${escapeHtml(statusVal || 'Not Started')}</span>
        </td>
        <td class="doc-approval-cell">
          ${(() => {
            const isApproved = meta.status === STATUS.APPROVED;
            const isSubmitted = meta.status === STATUS.REVIEW || meta.status === STATUS.PENDING;
            
            if (isApproved) {
              return `<span class="badge badge-success"><i class="fa fa-check"></i> Approved</span>`;
            } else if (isSubmitted && state.canModerate) {
              return `<div class="approval-buttons">
                <button type="button" class="btn btn-success btn-sm doc-approve-btn">Approve</button>
                <button type="button" class="btn btn-danger btn-sm doc-reject-btn">Reject</button>
              </div>`;
            } else if (isSubmitted && !state.canModerate) {
              return `<span class="text-muted small">Submitted • Waiting for Approval</span>`;
            } else if (isFinalized && !isSubmitted) {
              return `<button type="button" class="btn btn-primary btn-sm btn-doc-submit">Submit</button>`;
            } else {
              return `<button type="button" class="btn btn-primary btn-sm btn-doc-submit" disabled title="Finalize to enable">Submit</button>`;
            }
          })()}
        </td>
        <td> 
         <textarea class="form-control form-control-sm doc-notes-input" rows="1" ${evaluationDisabled}>${escapeHtml(notesVal)}</textarea>
        </td>
        <td class="doc-actions-cell">
          <div class="doc-action-row">
            <button type="button" class="btn btn-success btn-xs doc-save-row" ${evaluationDisabled} aria-label="Save" title="Save"><i class="fa fa-save"></i></button>
            <button type="button" class="btn btn-danger btn-xs doc-remove-row ${removeDisabled ? 'disabled' : ''}" ${(removeDisabled || disabled) ? 'disabled' : ''} aria-label="Remove" title="Remove"><i class="fa fa-trash"></i></button>
        </td>
      </tr>
    `;
  }
  function bindRowEvents(tbody) {
    tbody.querySelectorAll('tr').forEach(tr => {
      const key = tr.getAttribute('data-key');
      if (!key) return;
      const [type, category, name] = key.split('|||').map(s => s.replaceAll('&amp;', '&'));
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

      // New: Submit â†’ sets status and reveals actions appropriately
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

        // NEW: Before finalize â†’ allow editing Section/Assigned/Due Date
        //      After finalize â†’ allow editing TEE/FEE/PEE
        const requiresFinalization = ['tee','fee','pee'].includes(field);
        const canEditNow = requiresFinalization ? isFinalized : !isFinalized;
        if (!canEditNow) return;
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
            
            // Check for duplicates in TEE/FEE/PEE columns
            if (['tee', 'fee', 'pee'].includes(field) && newValue) {
              const allRows = computeDocumentsFlat();
              const currentKey = toKey(type, category, name);
              const duplicates = allRows.filter(row => {
                const rowKey = toKey(row.type, row.category, row.name);
                if (rowKey === currentKey) return false; // Skip current row
                const rowMeta = state.existingDocMeta.get(rowKey) || {};
                return rowMeta[field] === newValue;
              });
              
              if (duplicates.length > 0) {
                showNotification(`Duplicate value "${newValue}" found in ${field.toUpperCase()} column`, 'danger');
                return;
              }
            }
            
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
            console.error('Save edit error:', error);
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
      const payload = {
        bidId: state.bidId,
        type, category, name,
        finalize
      };
      const response = await fetch(API_FINALIZE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result?.success && !result?.ok) throw new Error(result?.message || 'Failed to finalize document');
      meta.isFinalized = finalize;
      meta.finalizedBy = finalize ? (window.sessionManager?.getSession?.() || {}).userId : null;
      meta.finalizedAt = finalize ? new Date().toISOString() : null;
      state.existingDocMeta.set(key, meta);
      renderDocumentsTable();
      showNotification(finalize ? 'Document finalized successfully' : 'Document unfinalized successfully', 'success');
    } catch (error) {
      console.error('Finalize document error:', error);
      showNotification('Failed to finalize document', 'danger');
    }
  }

  async function handleSubmitForApproval(type, category, name, tr) {
    try {
      const key = toKey(type, category, name);
      const meta = state.existingDocMeta.get(key) || {};

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
      console.error('Submit for approval failed:', e);
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
          status: STATUS.REVIEW,
          uploadDate: new Date().toISOString(),
          uploadedBy: (window.sessionManager?.getSession?.() || {}).userId,
        });
        await persistStructure('upload');
        renderDocumentsTable();
        showNotification('File uploaded', 'success');
      } catch (e) {
        console.error(e);
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
      
      // Update priorities object for backward compatibility
      meta.priorities = {
        tee: { slNo: meta.tee, category: '' },
        fee: { slNo: meta.fee, category: '' },
        pee: { slNo: meta.pee, category: '' },
      };
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
      console.error(e);
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
      state.existingDocumentTypes.forEach(dt => {
        if (dt.type !== type) return;
        dt.categories.forEach(cat => {
          if (cat.category !== category) return;
          cat.names = cat.names.filter(n => n !== name);
        });
        dt.categories = dt.categories.filter(c => c.names.length > 0);
      });
      state.existingDocumentTypes = state.existingDocumentTypes.filter(dt => dt.categories.length > 0);
      state.existingDocMeta.delete(toKey(type, category, name));
      await persistStructure('remove');
      renderDocumentsTable();
      showNotification('Document removed', 'success');
    } catch (e) {
      console.error(e);
      showNotification('Failed to remove document', 'danger');
    }
  }
  // async function handleApproveReject(type, category, name, approve) {
  //   try {
  //     if (!state.canModerate) return;
      
  //     if (approve) {
  //       // Show approval confirmation modal first
  //       const modalEl = document.getElementById('approvalInfoModal');
  //       if (modalEl && window.bootstrap?.Modal) {
  //         const modal = new bootstrap.Modal(modalEl);
  //         modal.show();
          
  //         // Wait for modal to be closed, then proceed with approval
  //         modalEl.addEventListener('hidden.bs.modal', async () => {
  //           await processApproval(type, category, name);
  //         }, { once: true });
  //       } else {
  //         // Fallback if modal not available
  //         await processApproval(type, category, name);
  //       }
  //     } else {
  //       // Handle rejection with reason prompt
  //       await processRejection(type, category, name);
  //     }
  //   } catch (e) {
  //     console.error(e);
  //     showNotification('Failed to update approval', 'danger');
  //   }
  // }
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
    console.error(e);
    showNotification('Failed to update approval', 'danger');
  }
}
  
  async function processApproval(type, category, name) {
    try {
      const payload = {
        bidId: state.bidId,
        type, category, name,
        action: 'approve',
      };
      const r = await fetch(API_APPROVE_DOCUMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || 'Approval failed');
      
      const key = toKey(type, category, name);
      const meta = state.existingDocMeta.get(key) || {};
      meta.status = STATUS.APPROVED;
      meta.approvalStatus = APPROVAL_STATUS.APPROVED;
      state.existingDocMeta.set(key, meta);
      
      renderDocumentsTable();
      showNotification('Document approved and locked', 'success');
    } catch (e) {
      console.error(e);
      showNotification('Failed to approve document', 'danger');
    }
  }
  
  async function processRejection(type, category, name) {
  try {
    const reason = prompt('Please provide a reason for rejection:');
    if (reason === null) return; // User cancelled
    
    const payload = {
      bidId: state.bidId,
      type, category, name,
      action: 'reject',
    };
    const r = await fetch(API_APPROVE_DOCUMENT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!d?.success && !d?.ok) throw new Error(d?.message || 'Rejection failed');
    
    const key = toKey(type, category, name);
    const meta = state.existingDocMeta.get(key) || {};
    
    // Reset document to initial state
    meta.status = '';
    meta.approvalStatus = APPROVAL_STATUS.PENDING;
    meta.attachment = null;
    meta.url = null;
    
    // Append rejection reason to existing notes
    const existingNotes = meta.notes || '';
    const rejectionNote = reason ? `Rejection reason: ${reason}` : '';
    meta.notes = existingNotes ? `${existingNotes}\n${rejectionNote}` : rejectionNote;
    
    meta.isFinalized = false;
    meta.finalizedBy = null;
    meta.finalizedAt = null;
    
    state.existingDocMeta.set(key, meta);
    renderDocumentsTable();
    showNotification('Document rejected and reset to initial state', 'warning');
  } catch (e) {
    console.error(e);
    showNotification('Failed to reject document', 'danger');
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
      const headers = ['Type','Category','Document','Priority','Section','AssignedTo','DueDate','Status','Notes','Attachment','UploadedBy','UploadDate','URL','IsFinalized','FinalizedBy','FinalizedAt','TEE SlNo','TEE Category','FEE SlNo','FEE Category','PEE SlNo','PEE Category'];
      const csv = [
        headers.join(','),
        ...rows.map(r => {
          const m = state.existingDocMeta.get(toKey(r.type, r.category, r.name)) || {};
          const cols = [
            r.type, r.category, r.name, r.priority || '', m.section || '', m.assignedTo || '', m.dueDate || '',
            m.status || '', (m.notes || '').replace(/\n/g, ' ').replace(/,/g, ';'),
            m.attachment || '', getUserFullName(m.uploadedBy || ''), m.uploadDate || '', m.url || '',
            m.isFinalized || false, getUserFullName(m.finalizedBy || ''), m.finalizedAt || '',
            m.priorities?.tee?.slNo || '', m.priorities?.tee?.category || '',
            m.priorities?.fee?.slNo || '', m.priorities?.fee?.category || '',
            m.priorities?.pee?.slNo || '', m.priorities?.pee?.category || '',
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
      console.error(e);
      showNotification('Export failed', 'danger');
    }
  }
  async function approveWholeBid() {
    try {
      if (!state.canModerate) return;
      if (!confirm('Approve this bid? All documents are approved and the bid will be locked.')) return;
      const r = await fetch(API_APPROVE_BID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: state.bidId }),
      });
      const d = await r.json();
      if (!d?.success && !d?.ok) throw new Error(d?.message || 'Approve failed');
      state.bid.status = 'Approved';
      lockBidAfterApproval();
      renderDocumentsTable();
      showNotification('Bid approved and locked', 'success');
    } catch (e) {
      console.error(e);
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
      ? pairs.map(([type, val]) => `<li>${escapeHtml(type)} â€” <strong>${val}</strong></li>`).join('')
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
      const bid = await fetchBid(id);
      state.bid = bid;
      setEnhancedHeader(bid);
      loadDocsFromBid(bid);
      await Promise.all([loadUsers(), loadAttachmentsDirectly()]);
      checkUserPermissions();
      el.loading.style.display = 'none';
      el.content.style.display = 'block';
      renderDocumentsTable();
      setupFilters();
      checkBidApprovalEligibility();
      lockBidAfterApproval();
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
        if (toggle) toggle.textContent = 'â–¼';
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
      el.exportDocsBtn?.addEventListener('click', exportDocuments);
      el.forceSaveBtn?.addEventListener('click', async () => {
        await persistStructure('force-save');
        showNotification('Saved', 'success');
      });
      el.testUploadLogicBtn?.addEventListener('click', () => {
        showNotification('Test: upload logic OK (client side)', 'info');
      });
      el.finalApproveBidBtn?.addEventListener('click', approveWholeBid);
    } catch (e) {
      console.error(e);
      el.loading.style.display = 'none';
      el.error.style.display = 'block';
      el.errorMessage.textContent = 'Failed to load bid';
    }
  })();
});