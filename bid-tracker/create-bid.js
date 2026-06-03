document.addEventListener('DOMContentLoaded', () => {
  // ── Role guard: only Manager / Director can create bids ──
  const _session = window.sessionManager?.getSession?.() || {};
  const _role = (_session.userType || _session.role || '').toLowerCase();
  if (_role && !['manager','director','admin'].includes(_role)) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f0f4fb;font-family:sans-serif">
        <div style="background:#fff;border-radius:14px;padding:3rem 2.5rem;text-align:center;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.12)">
          <div style="font-size:2.5rem;margin-bottom:1rem">🔒</div>
          <h2 style="color:#0f1e36;margin-bottom:0.5rem">Access Restricted</h2>
          <p style="color:#64748b;margin-bottom:1.5rem">Only Managers and Directors can create new bids.</p>
          <button onclick="window.close()" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:0.6rem 1.5rem;font-weight:700;cursor:pointer;font-size:0.95rem">Close</button>
        </div>
      </div>`;
    return;
  }

  let templateData = null;
  let excelDocuments = []; // Store all documents from Excel with full data

  const API_SAVE = '/api/bid-tracker/create-bid';
  const API_USERS = '/api/bid-tracker/users';
  const API_TEMPLATE = '/api/bid-tracker/template';
  const API_TEMPLATE_UPLOAD = '/api/bid-tracker/template-upload';

  const state = {
    selectedDocumentTypes: [],
    bidInfo: {},
    uploadedTemplateMeta: null
  };

  const el = {
    bidName: document.getElementById('bidName'),
    deadline: document.getElementById('deadline'),
    clientName: document.getElementById('clientName'),
    ownerName: document.getElementById('ownerName'),
    description: document.getElementById('description'),

    createBidPreview: document.getElementById('createBidPreview'),
    cancelBtn: document.getElementById('cancelBtn'),
    saveAll: document.getElementById('saveAll'),
    successNotice: document.getElementById('successNotice'),
    saveStatus: document.getElementById('saveStatus'),

    pvBidName: document.getElementById('pvBidName'),
    pvClient: document.getElementById('pvClient'),
    pvDeadline: document.getElementById('pvDeadline'),
    pvStatus: document.getElementById('pvStatus'),
    pvOwner: document.getElementById('pvOwner'),
    pvDesc: document.getElementById('pvDesc'),
    pvTeam: document.getElementById('pvTeam'),
    pvDocs: document.getElementById('pvDocs'),

    selectedDocsTableBody: document.getElementById('selectedDocumentsPreview'),
    templateFile: document.getElementById('templateFile'),
    uploadTemplateBtn: document.getElementById('uploadTemplateBtn'),
    clearTemplateBtn: document.getElementById('clearTemplateBtn'),
    templateStatus: document.getElementById('templateStatus'),
    templateImportedMeta: document.getElementById('templateImportedMeta'),
    downloadTemplateBtn: document.getElementById('downloadTemplateBtn')
  };

  // Add this function after the state object
  // Add this function after the state object - only replaces truly problematic filesystem characters
  function sanitizeForFilesystem(text) {
    return (text || '').toString()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Only replace truly invalid filesystem chars
      .trim();
  }
  // Add this function after the sanitizeForFilesystem function
  function showSanitizationNotification(message, type = 'warning') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.style.marginTop = '10px';
    notification.innerHTML = message;
    
    // Insert after template status
    if (el.templateStatus && el.templateStatus.parentNode) {
      el.templateStatus.parentNode.insertBefore(notification, el.templateStatus.nextSibling);
      
      // Remove after 8 seconds
      setTimeout(() => {
        if (notification && notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 8000);
    }
  }
  function escapeHtml(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function formatDate(dateValue) {
    if (!dateValue) return '';
    
    // Handle Excel date (serial number) or Date object
    let date;
    if (typeof dateValue === 'number') {
      // Excel serial date to JS Date
      date = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      return dateValue.toString();
    }
    
    // Format as DD/MM/YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function renderDocumentsTable() {
    if (!el.selectedDocsTableBody) return;
    
    if (excelDocuments.length === 0) {
      el.selectedDocsTableBody.innerHTML = '<tr><td colspan="8" class="muted">Upload a template to see documents</td></tr>';
      return;
    }

    const rows = excelDocuments.map((doc, index) => {
      return `<tr>
        <td>${escapeHtml(doc.type || '')}</td>
        <td>${escapeHtml(doc.category || '')}</td>
        <td>${escapeHtml(doc.name || '')}</td>
        <td>${escapeHtml(doc.priority || '')}</td>
        <td>${escapeHtml(doc.section || '')}</td>
        <td>${escapeHtml(doc.assignedTo || '')}</td>
        <td>${escapeHtml(doc.dueDate || '')}</td>
        <td>
          <button type="button" data-remove-doc="${index}" class="btn-danger btn-small">Remove</button>
        </td>
      </tr>`;
    });

    el.selectedDocsTableBody.innerHTML = rows.join('');

    // Bind remove buttons
    document.querySelectorAll('[data-remove-doc]').forEach(btn => {
      btn.onclick = () => {
        const index = parseInt(btn.getAttribute('data-remove-doc'));
        removeDocument(index);
      };
    });

    // Show/hide create bid button
    if (el.createBidPreview) {
      el.createBidPreview.style.display = excelDocuments.length > 0 ? 'inline-block' : 'none';
    }
  }

  function removeDocument(index) {
    if (confirm('Remove this document from the bid?')) {
      excelDocuments.splice(index, 1);
      renderDocumentsTable();
      updateLivePreview();
      buildDocumentTypesFromExcel();
    }
  }

  function buildDocumentTypesFromExcel() {
    // Group documents by type and category for the live preview
    const typeMap = new Map();
    
    excelDocuments.forEach(doc => {
      const type = doc.type || 'Unknown';
      const category = doc.category || 'Unknown';
      const name = doc.name || 'Unknown';
      
      if (!typeMap.has(type)) {
        typeMap.set(type, { type, categories: new Map() });
      }
      
      const typeObj = typeMap.get(type);
      if (!typeObj.categories.has(category)) {
        typeObj.categories.set(category, { category, names: [] });
      }
      
      typeObj.categories.get(category).names.push(name);
    });

    // Convert to the expected format
    state.selectedDocumentTypes = Array.from(typeMap.values()).map(typeObj => ({
      type: typeObj.type,
      categories: Array.from(typeObj.categories.values())
    }));
  }

  function updateLivePreview() {
    const bn = el.bidName?.value?.trim() || '-';
    const cl = el.clientName?.value?.trim() || '-';
    const dl = el.deadline?.value || '-';
    const ow = el.ownerName?.value?.trim() || '-';
    const ds = el.description?.value?.trim() || '-';

    if (el.pvBidName) el.pvBidName.textContent = bn;
    if (el.pvClient) el.pvClient.textContent = cl;
    if (el.pvDeadline) el.pvDeadline.textContent = dl;
    if (el.pvStatus) el.pvStatus.textContent = 'Planning';
    if (el.pvOwner) el.pvOwner.textContent = ow;
    if (el.pvDesc) el.pvDesc.textContent = ds;

    if (el.pvTeam) {
      el.pvTeam.innerHTML = '';
      const li = document.createElement('li');
      li.textContent = 'No team members section';
      li.className = 'muted';
      el.pvTeam.appendChild(li);
    }

    if (el.pvDocs) {
      let html = '';
      if (state.selectedDocumentTypes.length === 0) {
        html = '<em>Upload template to see document structure...</em>';
      } else {
        state.selectedDocumentTypes.forEach(dt => {
          html += `<div style="margin-bottom:8px">📋 <strong>${escapeHtml(dt.type)}</strong></div>`;
          dt.categories.forEach(cat => {
            html += `<div style="margin-left:20px;margin-bottom:4px">📂 ${escapeHtml(cat.category)} (${cat.names.length} docs)</div>`;
            cat.names.slice(0, 3).forEach(n => {
              html += `<div style="margin-left:40px;font-size:11px;color:#666">📄 ${escapeHtml(n)}</div>`;
            });
            if (cat.names.length > 3) {
              html += `<div style="margin-left:40px;font-size:10px;color:#999;">...and ${cat.names.length - 3} more</div>`;
            }
          });
        });
      }
      el.pvDocs.innerHTML = html;
    }
  }

  function gatherBidInfo() {
    state.bidInfo = {
      bidName: el.bidName?.value?.trim() || '',
      deadline: el.deadline?.value || '',
      clientName: el.clientName?.value?.trim() || '',
      bidStatus: 'Planning',
      ownerName: el.ownerName?.value?.trim() || '',
      description: el.description?.value?.trim() || '',
      teamMembers: []
    };
  }

  function generatePreviewTree() {
    const b = state.bidInfo;
    let html = `
      <div class="preview-header"><h2 style="margin:0">Final Bid Structure Preview</h2></div>
      <div class="preview-body">
        <div class="info-message">Bid: ${escapeHtml(b.bidName || '')} • Deadline: ${escapeHtml(b.deadline || '')} • Status: ${escapeHtml(b.bidStatus || '')}</div>
        <div style="margin:16px 0;"><strong>Total Documents:</strong> ${excelDocuments.length}</div>
    `;
    
    state.selectedDocumentTypes.forEach(dt => {
      html += `<div style="margin:10px 0"><strong>📋 ${escapeHtml(dt.type)}</strong></div>`;
      dt.categories.forEach(cat => {
        html += `<div style="margin-left:16px">📂 ${escapeHtml(cat.category)} (${cat.names.length} documents)</div>`;
        cat.names.forEach(n => {
          html += `<div style="margin-left:32px;font-size:13px;color:#444">📄 ${escapeHtml(n)}</div>`;
        });
      });
    });
    
    html += `</div>`;
    return html;
  }

  function showPreviewModal() {
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    const content = document.createElement('div');
    content.className = 'preview-content';
    content.innerHTML = `
      ${generatePreviewTree()}
      <div class="preview-actions">
        <button type="button" id="cancelPreview" class="btn-secondary">Cancel</button>
        <button type="button" id="confirmCreate" class="btn-primary">Create Bid</button>
      </div>
    `;
    modal.appendChild(content);
    document.body.appendChild(modal);
    document.getElementById('cancelPreview').onclick = () => document.body.removeChild(modal);
    document.getElementById('confirmCreate').onclick = async () => {
      document.body.removeChild(modal);
      await submitBidForm();
    };
    modal.onclick = e => { if (e.target === modal) document.body.removeChild(modal); };
  }

  async function uploadAndImportTemplate() {
    if (!el.templateFile || !el.templateFile.files || el.templateFile.files.length === 0) {
      setTemplateStatus('Please choose a file.', true);
      return;
    }
    
    const file = el.templateFile.files[0];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx','xls'].includes(ext)) {
      setTemplateStatus('Unsupported file type. Please upload .xlsx or .xls', true);
      return;
    }
    
    setTemplateStatus('Uploading...', false);
    const fd = new FormData();
    fd.append('file', file);
    
    try {
      const r = await fetch(API_TEMPLATE_UPLOAD, { method: 'POST', body: fd });
      const d = await r.json();
      
      if (!d || (!d.success && !d.ok)) {
        setTemplateStatus(d?.message || 'Upload failed.', true);
        return;
      }
      
      const rows = Array.isArray(d.rows) ? d.rows : [];
      
      if (!rows || rows.length === 0) {
        setTemplateStatus('No valid rows found in the Excel file.', true);
        return;
      }

      console.log('API Response rows sample:', rows[0]); // Debug log
      console.log('All keys in first row:', Object.keys(rows[0])); // Debug log

      // Process Excel data - try ALL possible field variations
      // excelDocuments = rows.map((row, index) => {
      //   console.log(`Row ${index + 1} raw data:`, row); // Debug each row

      //   // Get all possible values for debugging
      //   const allKeys = Object.keys(row);
      //   console.log(`Row ${index + 1} available keys:`, allKeys);

      //   const doc = {
      //     type: row['Document Type'] || row.DocumentType || row.type || row.Type || '',
      //     category: row['Document Category'] || row.DocumentCategory || row.category || row.Category || '',
      //     name: row['Document Name'] || row.DocumentName || row.name || row.Name || row.Document || '',
      //     priority: row['Document Type Priority'] || row.DocumentTypePriority || row.priority || row.Priority || '',
      //     section: row['Section/ClauseNo'] || row.SectionClauseNo || row['Section/Clause'] || row.section || row.Section || row.Clause || row.ClauseNo || '',
      //     assignedTo: row['Assigned To'] || row.AssignedTo || row.assignedTo || row.assigned || row.Assigned || '',
      //     dueDate: row['Due Date(DD/MM/YYYY)'] || row['Due Date'] || row.DueDate || row.dueDate || row['DueDate(DD/MM/YYYY)'] || ''
      //   };

      //   // Log what we extracted vs what was available
      //   console.log(`Row ${index + 1} extracted:`, doc);
      //   console.log(`Row ${index + 1} priority sources:`, {
      //     'Document Type Priority': row['Document Type Priority'],
      //     'DocumentTypePriority': row.DocumentTypePriority,
      //     'priority': row.priority,
      //     'Priority': row.Priority
      //   });

      //   return doc;
      // }).filter(doc => doc.type && doc.category && doc.name);

      // NEW: Track sanitization changes
      let sanitizedCount = 0;
      const sanitizedRows = [];

      // Process Excel data with sanitization
      excelDocuments = rows.map((row, index) => {
        console.log(`Row ${index + 1} raw data:`, row); // Debug each row

        // Get original values
        const originalDoc = {
          type: row['Document Type'] || row.DocumentType || row.type || row.Type || '',
          category: row['Document Category'] || row.DocumentCategory || row.category || row.Category || '',
          name: row['Document Name'] || row.DocumentName || row.name || row.Name || row.Document || '',
          priority: row['Document Type Priority'] || row.DocumentTypePriority || row.priority || row.Priority || '',
          section: row['Section/ClauseNo'] || row.SectionClauseNo || row['Section/Clause'] || row.section || row.Section || row.Clause || row.ClauseNo || '',
          assignedTo: row['Assigned To'] || row.AssignedTo || row.assignedTo || row.assigned || row.Assigned || '',
          dueDate: row['Due Date(DD/MM/YYYY)'] || row['Due Date'] || row.DueDate || row.dueDate || row['DueDate(DD/MM/YYYY)'] || ''
        };

        // Apply sanitization to critical fields only
        const sanitizedDoc = {
          type: sanitizeForFilesystem(originalDoc.type),
          category: sanitizeForFilesystem(originalDoc.category),
          name: sanitizeForFilesystem(originalDoc.name),
          // Keep other fields unchanged
          priority: originalDoc.priority,
          section: originalDoc.section,
          assignedTo: originalDoc.assignedTo,
          dueDate: originalDoc.dueDate
        };

        // Check if sanitization changed anything
        const hasChanges = (
          originalDoc.type !== sanitizedDoc.type ||
          originalDoc.category !== sanitizedDoc.category ||
          originalDoc.name !== sanitizedDoc.name
        );

        if (hasChanges) {
          sanitizedCount++;
          sanitizedRows.push({
            rowIndex: index + 1,
            original: { type: originalDoc.type, category: originalDoc.category, name: originalDoc.name },
            sanitized: { type: sanitizedDoc.type, category: sanitizedDoc.category, name: sanitizedDoc.name }
          });
          
          console.log(`Row ${index + 1} SANITIZED:`, {
            original: { type: originalDoc.type, category: originalDoc.category, name: originalDoc.name },
            sanitized: { type: sanitizedDoc.type, category: sanitizedDoc.category, name: sanitizedDoc.name }
          });
        }

        console.log(`Row ${index + 1} final:`, sanitizedDoc);
        return sanitizedDoc;
      }).filter(doc => doc.type && doc.category && doc.name);

      // Show sanitization notification if changes were made
      if (sanitizedCount > 0) {
        showSanitizationNotification(
          `<strong>⚠️ Characters Automatically Replaced:</strong><br>
          ${sanitizedCount} row(s) contained special characters that were replaced with underscores (_) for file system compatibility.<br>
          <small>Replaced characters: &lt; &gt; : " / \\ | ? *</small>`, 
          'warning'
        );
        
        console.log(`SANITIZATION COMPLETE: Modified ${sanitizedCount} rows`);
        console.log('Sanitized rows details:', sanitizedRows);
      }
      console.log('Final excelDocuments:', excelDocuments); // Debug log

      state.uploadedTemplateMeta = { 
        storedName: d.filename || d.storedName || '', 
        originalName: file.name || '', 
        sheet: d.sheet || 'BidTypeDocuments' 
      };
      
      buildDocumentTypesFromExcel();
      showImportedMeta();
      renderDocumentsTable();
      updateLivePreview();
      // Update success message to include sanitization info
      if (sanitizedCount > 0) {
        setTemplateStatus(`Template imported: ${excelDocuments.length} documents loaded. ${sanitizedCount} rows were cleaned for filesystem compatibility.`, false);
      } else {
        setTemplateStatus(`Template imported: ${excelDocuments.length} documents loaded.`, false);
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setTemplateStatus('Upload error. Please try again.', true);
    }
  }

  function setTemplateStatus(msg, isError) {
    if (!el.templateStatus) return;
    el.templateStatus.textContent = msg || '';
    el.templateStatus.style.color = isError ? '#e53e3e' : '#718096';
  }

  function showImportedMeta() {
    if (!el.templateImportedMeta) return;
    if (!state.uploadedTemplateMeta) { 
      el.templateImportedMeta.style.display = 'none'; 
      el.templateImportedMeta.textContent = ''; 
      return; 
    }
    const m = state.uploadedTemplateMeta;
    el.templateImportedMeta.style.display = 'block';
    el.templateImportedMeta.textContent = `Imported: ${m.originalName} -> ${m.storedName} (Sheet: ${m.sheet}) - ${excelDocuments.length} documents`;
  }

  function clearAllSelections() {
    excelDocuments = [];
    state.selectedDocumentTypes = [];
    renderDocumentsTable();
    updateLivePreview();
  }

  function downloadTemplate() {
    const link = document.createElement('a');
    link.href = '/api/bid-tracker/download-template';
    link.download = 'BidTemplate.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function submitBidForm() {
  const session = window.sessionManager?.getSession?.();
  if (!session) { alert('Session expired. Please log in again.'); return; }
  if (excelDocuments.length === 0) { alert('Please upload a template with documents.'); return; }
  if (!state.bidInfo.bidName || !state.bidInfo.deadline) { alert('Bid Name and Deadline are required.'); return; }
  
  // Prepare documents with all Excel template data properly structured
  const documents = excelDocuments.map((doc, index) => ({
    type: doc.type,
    category: doc.category,
    name: doc.name,
    documentType: doc.type,
    document: doc.name,
    // Template fields from Excel
    priority: doc.priority,
    section: doc.section,
    sectionClauseNo: doc.section,
    assignedTo: doc.assignedTo,
    dueDate: doc.dueDate,
    // Initialize other fields
    status: '',
    notes: '',
    attachment: null,
    filename: null,
    attachmentName: null,
    url: null,
    link: null,
    filePath: null,
    approvalStatus: 'Pending Review',
    uploadDate: null,
    uploadedBy: null,
    isFinalized: false,
    finalizedBy: null,
    finalizedAt: null,
    // TEE/FEE/PEE priorities
    teeSlNo: '',
    teeCategory: '',
    feeSlNo: '',
    feeCategory: '',
    peeSlNo: '',
    peeCategory: '',
    priorities: {
      tee: { slNo: '', category: '' },
      fee: { slNo: '', category: '' },
      pee: { slNo: '', category: '' }
    }
  }));
  
  const payload = {
    userId: session.username || session.fullName,
    createdBy: session.username || session.fullName, // ← Add explicit createdBy field
    createdByFullName: session.fullName || session.username, // ← Add full name
    bidName: state.bidInfo.bidName,
    deadline: state.bidInfo.deadline,
    clientName: state.bidInfo.clientName,
    bidStatus: state.bidInfo.bidStatus,
    ownerName: state.bidInfo.ownerName,
    description: state.bidInfo.description,
    teamMembers: state.bidInfo.teamMembers,
    docTypes: state.selectedDocumentTypes,
    documents: documents, // Use the properly structured documents
    selectedDocuments: documents, // Keep for backward compatibility
    excelDocuments: excelDocuments, // Keep original Excel data
    totalDocuments: excelDocuments.length,
    // Additional metadata
    templateData: {
      originalFileName: state.uploadedTemplateMeta?.originalName || '',
      storedName: state.uploadedTemplateMeta?.storedName || '',
      sheetName: state.uploadedTemplateMeta?.sheet || 'BidTypeDocuments'
    }
  };
  
  try {
    if (el.saveStatus) el.saveStatus.textContent = 'Saving...';
    console.log('Submitting payload:', payload); // Debug log
    
    const r = await fetch(API_SAVE, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(payload) 
    });
    const d = await r.json();
    
    console.log('Server response:', d); // Debug log
    
    if (d?.ok || d?.success) {
      try { await fetch('/api/bids/refresh', { method: 'POST' }); } catch {}
      if (el.successNotice) {
        el.successNotice.textContent = `Bid saved: ${state.bidInfo.bidName}`;
        el.successNotice.style.display = 'block';
      }
      const bidId = d?.bid?.id || d?.id || (state.bidInfo.bidName || '').toLowerCase().replace(/[^a-z0-9]+/g,'-');
      window.location.href = `/bid-tracker/bid-view.html?id=${encodeURIComponent(bidId)}`;
    } else {
      if (el.saveStatus) el.saveStatus.textContent = '';
      console.error('Server error response:', d);
      alert(d?.message || 'Failed to save bid.');
    }
  } catch (error) {
    console.error('Save error:', error);
    if (el.saveStatus) el.saveStatus.textContent = '';
    alert('Error saving bid');
  }
}

  // Event Listeners
  el.saveAll && el.saveAll.addEventListener('click', () => {
    gatherBidInfo();
    if (excelDocuments.length === 0) { alert('Please upload a template with documents.'); return; }
    if (!state.bidInfo.bidName || !state.bidInfo.deadline) { alert('Bid Name and Deadline are required.'); return; }
    showPreviewModal();
  });

  el.createBidPreview && el.createBidPreview.addEventListener('click', () => {
    gatherBidInfo();
    if (excelDocuments.length === 0) { alert('Please upload a template with documents.'); return; }
    showPreviewModal();
  });

  el.cancelBtn && el.cancelBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel?')) window.location.href = '/home/home.html';
  });

  el.bidName && el.bidName.addEventListener('input', updateLivePreview);
  el.deadline && el.deadline.addEventListener('change', updateLivePreview);
  el.clientName && el.clientName.addEventListener('input', updateLivePreview);
  el.ownerName && el.ownerName.addEventListener('input', updateLivePreview);
  el.description && el.description.addEventListener('input', updateLivePreview);

  el.uploadTemplateBtn && el.uploadTemplateBtn.addEventListener('click', uploadAndImportTemplate);
  el.clearTemplateBtn && el.clearTemplateBtn.addEventListener('click', () => { 
    clearAllSelections(); 
    state.uploadedTemplateMeta = null; 
    showImportedMeta(); 
    setTemplateStatus('', false);
    if (el.templateFile) el.templateFile.value = '';
  });
   el.downloadTemplateBtn && el.downloadTemplateBtn.addEventListener('click', downloadTemplate);

  // Initialize
  updateLivePreview();
  renderDocumentsTable();
});