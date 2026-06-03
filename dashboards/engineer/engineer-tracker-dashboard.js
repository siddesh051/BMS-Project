class EngineerDashboard {
constructor() {
this.currentUser = null;
this.assignedBids = [];
this.workQueue = [];
this.notificationsData = [];
this.currentBidsView = 'cards';
this.currentWorkFilter = 'all';
this.currentBidsFilter = 'active';
this.selectedUploadBid = null;
this.selectedDocument = null;
this.init();
}
async init() {
console.log('Initializing Engineer Dashboard...');
if (!sessionManager.isAuthenticated()) {
sessionManager.redirectToLogin();
return;
}
const session = sessionManager.getSession();
if (session.userType !== 'Engineer') {
console.error('Access denied: User is not an Engineer');
TrackerUtils.showToast('Access denied: Engineer privileges required', 'error');
sessionManager.logout();
return;
}
if (!sessionManager.hasTrackerAccess()) {
console.error('Access denied: No tracker access');
TrackerUtils.showToast('Access denied: Tracker access required', 'error');
sessionManager.redirectToDashboard();
return;
}
this.currentUser = session;
this.updateUserInfo();
this.setupEventListeners();
try {
await this.loadDashboardData();
this.updateStats();
this.renderDashboard();
} catch (error) {
console.error('Dashboard initialization error:', error);
TrackerUtils.showToast('Failed to load dashboard data', 'error');
}
}
updateUserInfo() {
const userNameElement = document.getElementById('userName');
const userRoleElement = document.getElementById('userRole');
if (userNameElement && this.currentUser) {
userNameElement.textContent = this.currentUser.fullName || this.currentUser.username;
}
if (userRoleElement && this.currentUser) {
userRoleElement.textContent = this.currentUser.userType;
}
}
setupEventListeners() {
const bidSearch = document.getElementById('bidSearch');
if (bidSearch) {
bidSearch.addEventListener('input', TrackerUtils.debounce((e) => {
this.handleBidSearch(e.target.value);
}, TrackerConfig.UI.SEARCH_DEBOUNCE));
}
const workFilter = document.getElementById('workFilter');
if (workFilter) {
workFilter.addEventListener('change', (e) => {
this.currentWorkFilter = e.target.value;
this.renderWorkQueue();
});
}
const bidsFilter = document.getElementById('bidsFilter');
if (bidsFilter) {
bidsFilter.addEventListener('change', (e) => {
this.currentBidsFilter = e.target.value;
this.renderBids();
});
}
const uploadForm = document.getElementById('uploadForm');
if (uploadForm) {
uploadForm.addEventListener('submit', (e) => this.handleDocumentUpload(e));
}
const documentFile = document.getElementById('documentFile');
if (documentFile) {
documentFile.addEventListener('change', (e) => this.handleFileSelect(e.target));
}
const bidSelect = document.getElementById('bidSelect');
if (bidSelect) {
bidSelect.addEventListener('change', () => this.loadBidDocuments());
}
document.addEventListener('click', (e) => {
if (e.target.classList.contains('modal')) {
this.closeAllModals();
}
});
document.addEventListener('keydown', (e) => {
if (e.key === 'Escape') {
this.closeAllModals();
}
});
}
async loadDashboardData() {
TrackerUtils.showLoading(document.body, 'Loading dashboard data...');
try {
const [bidsData, notificationsData] = await Promise.all([
trackerStorage.getAllBids(this.currentUser.userId),
trackerStorage.getNotifications(this.currentUser.userId)
]);
this.assignedBids = this.filterAssignedBids(bidsData.bids || []);
this.notificationsData = notificationsData.notifications || [];
this.workQueue = this.generateWorkQueue();
console.log('Engineer dashboard data loaded successfully');
} catch (error) {
console.error('Error loading dashboard data:', error);
throw error;
} finally {
TrackerUtils.hideLoading(document.querySelector('.loading-spinner'));
}
}
filterAssignedBids(allBids) {
return allBids.filter(bid => {
if (!bid.teamMembers || bid.teamMembers.length === 0) return false;
return bid.teamMembers.some(member => member.userId === this.currentUser.userId);
});
}
generateWorkQueue() {
const workItems = [];
this.assignedBids.forEach(bid => {
if (bid.bidTypeDocuments) {
bid.bidTypeDocuments.forEach(bidType => {
if (bidType.categories) {
bidType.categories.forEach(category => {
if (category.fields) {
category.fields.forEach(field => {
if (field.assignedTo === this.currentUser.userId) {
workItems.push({
id: field.id,
bidId: bid.id,
bidName: bid.name,
categoryName: category.name,
fieldName: field.name,
status: field.status || 'not_started',
deadline: bid.deadline,
priority: this.getFieldPriority(field, bidType),
lastModified: field.lastModified || bid.lastModified,
comments: field.comments || [],
documents: field.documents || []
});
}
});
}
});
}
});
}
});
return workItems.sort((a, b) => {
const priorityOrder = { high: 3, medium: 2, low: 1 };
const statusOrder = { not_started: 4, in_progress: 3, submitted: 2, approved: 1, rejected: 5 };
if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
return priorityOrder[b.priority] - priorityOrder[a.priority];
}
return statusOrder[b.status] - statusOrder[a.status];
});
}
getFieldPriority(field, bidType) {
if (field.priority) return field.priority;
if (bidType.priority >= 3) return 'high';
if (bidType.priority >= 2) return 'medium';
return 'low';
}
updateStats() {
const assignedBidsCount = this.assignedBids.length;
const activeBidsCount = this.assignedBids.filter(bid => 
['draft', 'in_progress', 'review'].includes(bid.status)
).length;
const pendingDocuments = this.workQueue.filter(item => 
['not_started', 'in_progress'].includes(item.status)
).length;
const submittedDocuments = this.workQueue.filter(item => 
['submitted', 'under_review'].includes(item.status)
).length;
const approvedDocuments = this.workQueue.filter(item => 
item.status === 'approved'
).length;
const overdueDocuments = this.workQueue.filter(item => {
if (!item.deadline) return false;
const deadline = new Date(item.deadline);
return deadline < new Date() && !['approved', 'submitted'].includes(item.status);
}).length;
const awaitingApprovalCount = this.workQueue.filter(item => 
item.status === 'submitted'
).length;
const totalDocuments = this.workQueue.length;
const completionRate = totalDocuments > 0 ? 
Math.round((approvedDocuments / totalDocuments) * 100) : 0;
this.updateStatElement('assignedBidsCount', assignedBidsCount);
this.updateStatElement('activeBidsCount', activeBidsCount);
this.updateStatElement('pendingDocumentsCount', pendingDocuments);
this.updateStatElement('submittedDocumentsCount', submittedDocuments);
this.updateStatElement('approvedDocumentsCount', approvedDocuments);
this.updateStatElement('overdueDocumentsCount', overdueDocuments);
this.updateStatElement('awaitingApprovalCount', awaitingApprovalCount);
this.updateStatElement('completionRate', `${completionRate}%`);
this.updateStatElement('notificationCount', this.notificationsData.length);
this.updateStatElement('pendingWorkBadge', pendingDocuments);
}
updateStatElement(elementId, value) {
const element = document.getElementById(elementId);
if (element) {
element.textContent = value;
}
}
renderDashboard() {
this.renderNotifications();
this.renderWorkQueue();
this.renderUrgentItems();
this.renderBids();
this.populateUploadSelectors();
}
renderNotifications() {
const notificationsList = document.getElementById('notificationsList');
if (!notificationsList) return;
if (this.notificationsData.length === 0) {
notificationsList.innerHTML = `
<div class="no-notifications">
<i class="fas fa-bell-slash"></i>
<p>No new notifications</p>
</div>
`;
return;
}
const notificationsHtml = this.notificationsData.slice(0, 10).map(notification => `
<div class="notification-item ${notification.read ? 'read' : 'unread'} priority-${notification.priority}">
<div class="notification-icon">
<i class="fas fa-${TrackerUtils.getNotificationIcon(notification.type)}"></i>
</div>
<div class="notification-content">
<h4>${notification.title}</h4>
<p>${notification.message}</p>
<span class="notification-time">${TrackerUtils.formatDate(notification.createdDate, TrackerConfig.DATETIME.FORMAT)}</span>
</div>
<div class="notification-actions">
${!notification.read ? `
<button onclick="engineerDashboard.markNotificationRead('${notification.id}')" title="Mark as read">
<i class="fas fa-check"></i>
</button>
` : ''}
<button onclick="engineerDashboard.dismissNotification('${notification.id}')" title="Dismiss">
<i class="fas fa-times"></i>
</button>
</div>
</div>
`).join('');
notificationsList.innerHTML = notificationsHtml;
}
renderWorkQueue() {
const workQueue = document.getElementById('workQueue');
if (!workQueue) return;
const filteredWork = this.getFilteredWork();
if (filteredWork.length === 0) {
workQueue.innerHTML = `
<div class="no-work">
<i class="fas fa-check-circle"></i>
<p>No work items found</p>
</div>
`;
return;
}
const workHtml = filteredWork.slice(0, 20).map(item => `
<div class="work-item ${item.status}" data-work-id="${item.id}">
<div class="work-icon">
<i class="fas fa-${this.getWorkIcon(item.status)}"></i>
</div>
<div class="work-content">
<div class="work-header">
<h4>${item.fieldName}</h4>
<span class="work-priority ${item.priority}">${item.priority}</span>
</div>
<div class="work-meta">
<span class="work-bid">${item.bidName}</span>
<span class="work-category">${item.categoryName}</span>
</div>
<div class="work-status">
<span class="status-badge ${item.status}">
${TrackerUtils.getStatusIcon(item.status)} ${item.status.replace('_', ' ')}
</span>
<span class="work-deadline">${TrackerUtils.getTimeUntilDeadline(item.deadline).message}</span>
</div>
</div>
<div class="work-actions">
<button onclick="engineerDashboard.viewWorkDetails('${item.id}')" class="btn secondary small">
<i class="fas fa-eye"></i>
</button>
${['not_started', 'in_progress'].includes(item.status) ? `
<button onclick="engineerDashboard.startWork('${item.id}')" class="btn primary small">
<i class="fas fa-play"></i>
</button>
` : ''}
${item.status === 'in_progress' ? `
<button onclick="engineerDashboard.uploadForItem('${item.id}')" class="btn success small">
<i class="fas fa-upload"></i>
</button>
` : ''}
</div>
</div>
`).join('');
workQueue.innerHTML = workHtml;
}
renderUrgentItems() {
const urgentList = document.getElementById('urgentList');
if (!urgentList) return;
const urgentItems = this.getUrgentItems();
if (urgentItems.length === 0) {
urgentList.innerHTML = `
<div class="no-urgent">
<i class="fas fa-smile"></i>
<p>No urgent items</p>
</div>
`;
return;
}
const urgentHtml = urgentItems.map(item => `
<div class="urgent-item ${item.type}">
<div class="urgent-icon">
<i class="fas fa-${item.icon}"></i>
</div>
<div class="urgent-content">
<h4>${item.title}</h4>
<p>${item.description}</p>
<div class="urgent-meta">
<span class="urgent-type">${item.type.replace('_', ' ')}</span>
<span class="urgent-time">${item.timeInfo}</span>
</div>
</div>
<div class="urgent-actions">
<button onclick="engineerDashboard.handleUrgentItem('${item.id}')" class="btn primary small">
<i class="fas fa-arrow-right"></i>
</button>
</div>
</div>
`).join('');
urgentList.innerHTML = urgentHtml;
}
renderBids() {
if (this.currentBidsView === 'cards') {
this.renderBidsCards();
} else {
this.renderBidsTable();
}
}
renderBidsCards() {
const bidsCardsView = document.getElementById('bidsCardsView');
if (!bidsCardsView) return;
const filteredBids = this.getFilteredBids();
if (filteredBids.length === 0) {
bidsCardsView.innerHTML = `
<div class="no-bids">
<i class="fas fa-clipboard-list"></i>
<p>No assigned bids found</p>
</div>
`;
return;
}
const bidsHtml = filteredBids.map(bid => `
<div class="bid-card ${bid.status}" data-bid-id="${bid.id}">
<div class="bid-header">
<h3>${bid.name}</h3>
<div class="bid-status">
<span class="status-badge ${bid.status}">${TrackerUtils.getStatusIcon(bid.status)} ${bid.status.replace('_', ' ')}</span>
</div>
</div>
<div class="bid-content">
<div class="bid-info">
<div class="info-item">
<i class="fas fa-building"></i>
<span>${bid.clientName || 'No client specified'}</span>
</div>
<div class="info-item">
<i class="fas fa-calendar"></i>
<span>${TrackerUtils.formatDate(bid.deadline)}</span>
</div>
<div class="info-item">
<i class="fas fa-clock"></i>
<span>${TrackerUtils.getTimeUntilDeadline(bid.deadline).message}</span>
</div>
</div>
<div class="my-progress">
<div class="progress-header">
<span>My Progress: ${this.getMyProgress(bid.id)}%</span>
<span>${this.getMyCompletedDocs(bid.id)}/${this.getMyTotalDocs(bid.id)} docs</span>
</div>
<div class="progress-bar">
<div class="progress-fill" style="width: ${this.getMyProgress(bid.id)}%"></div>
</div>
<div class="progress-details">
<span class="pending-count">${this.getMyPendingDocs(bid.id)} pending</span>
<span class="approved-count">${this.getMyApprovedDocs(bid.id)} approved</span>
</div>
</div>
</div>
<div class="bid-actions">
<button onclick="engineerDashboard.viewBidDetails('${bid.id}')" class="btn secondary small">
<i class="fas fa-eye"></i> View
</button>
<button onclick="engineerDashboard.workOnBid('${bid.id}')" class="btn primary small">
<i class="fas fa-tasks"></i> Work
</button>
<button onclick="engineerDashboard.uploadForBid('${bid.id}')" class="btn success small">
<i class="fas fa-upload"></i> Upload
</button>
</div>
</div>
`).join('');
bidsCardsView.innerHTML = bidsHtml;
}
renderBidsTable() {
const bidsTableView = document.getElementById('bidsTableView');
const bidsTableBody = document.getElementById('bidsTableBody');
if (!bidsTableView || !bidsTableBody) return;
bidsTableView.style.display = 'block';
document.getElementById('bidsCardsView').style.display = 'none';
const filteredBids = this.getFilteredBids();
if (filteredBids.length === 0) {
bidsTableBody.innerHTML = `
<tr>
<td colspan="7" class="no-data-cell">
<i class="fas fa-search"></i>
<p>No assigned bids found</p>
</td>
</tr>
`;
return;
}
const bidsHtml = filteredBids.map(bid => `
<tr data-bid-id="${bid.id}">
<td>
<div class="bid-name-cell">
<strong>${bid.name}</strong>
${bid.description ? `<small>${bid.description}</small>` : ''}
</div>
</td>
<td>${bid.clientName || 'Not specified'}</td>
<td>
<div class="progress-cell">
<div class="progress-bar small">
<div class="progress-fill" style="width: ${this.getMyProgress(bid.id)}%"></div>
</div>
<span>${this.getMyProgress(bid.id)}%</span>
</div>
</td>
<td>
<span class="pending-docs-count">${this.getMyPendingDocs(bid.id)}</span>
</td>
<td>
<div class="deadline-cell ${TrackerUtils.isDeadlineApproaching(bid.deadline) ? 'approaching' : ''}">
${TrackerUtils.formatDate(bid.deadline)}
<small>${TrackerUtils.getTimeUntilDeadline(bid.deadline).message}</small>
</div>
</td>
<td>
<span class="status-badge ${bid.status}">
${TrackerUtils.getStatusIcon(bid.status)} ${bid.status.replace('_', ' ')}
</span>
</td>
<td>
<div class="action-buttons">
<button onclick="engineerDashboard.viewBidDetails('${bid.id}')" class="btn-icon secondary" title="View Details">
<i class="fas fa-eye"></i>
</button>
<button onclick="engineerDashboard.workOnBid('${bid.id}')" class="btn-icon primary" title="Work on Bid">
<i class="fas fa-tasks"></i>
</button>
<button onclick="engineerDashboard.uploadForBid('${bid.id}')" class="btn-icon success" title="Upload Documents">
<i class="fas fa-upload"></i>
</button>
</div>
</td>
</tr>
`).join('');
bidsTableBody.innerHTML = bidsHtml;
}
getFilteredWork() {
let filtered = [...this.workQueue];
if (this.currentWorkFilter !== 'all') {
if (this.currentWorkFilter === 'pending') {
filtered = filtered.filter(item => ['not_started', 'in_progress'].includes(item.status));
} else if (this.currentWorkFilter === 'overdue') {
filtered = filtered.filter(item => {
if (!item.deadline) return false;
const deadline = new Date(item.deadline);
return deadline < new Date() && !['approved', 'submitted'].includes(item.status);
});
} else {
filtered = filtered.filter(item => item.status === this.currentWorkFilter);
}
}
return filtered;
}
getFilteredBids() {
let filtered = [...this.assignedBids];
if (this.currentBidsFilter !== 'all') {
if (this.currentBidsFilter === 'active') {
filtered = filtered.filter(bid => ['draft', 'in_progress', 'review'].includes(bid.status));
} else if (this.currentBidsFilter === 'pending') {
filtered = filtered.filter(bid => this.getMyPendingDocs(bid.id) > 0);
} else if (this.currentBidsFilter === 'completed') {
filtered = filtered.filter(bid => this.getMyProgress(bid.id) === 100);
} else {
filtered = filtered.filter(bid => bid.status === this.currentBidsFilter);
}
}
return filtered;
}
getUrgentItems() {
const items = [];
this.workQueue.forEach(work => {
if (TrackerUtils.isDeadlineApproaching(work.deadline)) {
items.push({
id: work.id,
type: 'deadline',
icon: 'clock',
title: `Deadline Approaching: ${work.fieldName}`,
description: `${work.bidName} - ${work.categoryName}`,
timeInfo: TrackerUtils.getTimeUntilDeadline(work.deadline).message
});
}
if (work.status === 'rejected') {
items.push({
id: work.id,
type: 'feedback',
icon: 'comment-slash',
title: `Document Rejected: ${work.fieldName}`,
description: `Requires revision - ${work.bidName}`,
timeInfo: 'Action required'
});
}
});
this.notificationsData.filter(n => !n.read && n.priority === 'high').forEach(notification => {
items.push({
id: notification.id,
type: 'notification',
icon: 'bell',
title: notification.title,
description: notification.message,
timeInfo: TrackerUtils.formatDate(notification.createdDate)
});
});
return items.sort((a, b) => {
const typeOrder = { deadline: 3, feedback: 2, notification: 1 };
return typeOrder[b.type] - typeOrder[a.type];
});
}
getMyProgress(bidId) {
const myWork = this.workQueue.filter(item => item.bidId === bidId);
if (myWork.length === 0) return 0;
const completed = myWork.filter(item => item.status === 'approved').length;
return Math.round((completed / myWork.length) * 100);
}
getMyTotalDocs(bidId) {
return this.workQueue.filter(item => item.bidId === bidId).length;
}
getMyCompletedDocs(bidId) {
return this.workQueue.filter(item => item.bidId === bidId && item.status === 'approved').length;
}
getMyPendingDocs(bidId) {
return this.workQueue.filter(item => 
item.bidId === bidId && ['not_started', 'in_progress'].includes(item.status)
).length;
}
getMyApprovedDocs(bidId) {
return this.workQueue.filter(item => item.bidId === bidId && item.status === 'approved').length;
}
getWorkIcon(status) {
const icons = {
'not_started': 'circle',
'in_progress': 'spinner',
'submitted': 'paper-plane',
'under_review': 'eye',
'approved': 'check-circle',
'rejected': 'times-circle'
};
return icons[status] || 'circle';
}
handleBidSearch(query) {
if (!query) {
this.renderBids();
return;
}
const filteredBids = this.assignedBids.filter(bid =>
bid.name.toLowerCase().includes(query.toLowerCase()) ||
(bid.clientName && bid.clientName.toLowerCase().includes(query.toLowerCase()))
);
this.assignedBids = filteredBids;
this.renderBids();
}
async populateUploadSelectors() {
const bidSelect = document.getElementById('bidSelect');
if (bidSelect) {
bidSelect.innerHTML = '<option value="">Choose bid...</option>';
this.assignedBids.forEach(bid => {
const option = document.createElement('option');
option.value = bid.id;
option.textContent = bid.name;
bidSelect.appendChild(option);
});
}
}
async loadBidDocuments() {
const bidSelect = document.getElementById('bidSelect');
const documentSelect = document.getElementById('documentSelect');
if (!bidSelect || !documentSelect) return;
documentSelect.innerHTML = '<option value="">Choose document...</option>';
const bidId = bidSelect.value;
if (!bidId) return;
const myWork = this.workQueue.filter(item => 
item.bidId === bidId && ['not_started', 'in_progress'].includes(item.status)
);
myWork.forEach(work => {
const option = document.createElement('option');
option.value = work.id;
option.textContent = `${work.categoryName} - ${work.fieldName}`;
documentSelect.appendChild(option);
});
this.selectedUploadBid = bidId;
}
handleFileSelect(input) {
const uploadText = document.getElementById('uploadText');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
if (input.files && input.files[0]) {
const file = input.files[0];
if (TrackerUtils.isValidFileType(file.name)) {
uploadText.textContent = file.name;
uploadSubmitBtn.disabled = false;
} else {
TrackerUtils.showToast('Please select a valid file type (PDF, DOC, DOCX, XLS, XLSX)', 'error');
input.value = '';
uploadText.textContent = 'Click to select file or drag and drop';
uploadSubmitBtn.disabled = true;
}
} else {
uploadText.textContent = 'Click to select file or drag and drop';
uploadSubmitBtn.disabled = true;
}
}
async handleDocumentUpload(event) {
event.preventDefault();
const bidSelect = document.getElementById('bidSelect');
const documentSelect = document.getElementById('documentSelect');
const documentFile = document.getElementById('documentFile');
const uploadComments = document.getElementById('uploadComments');
if (!bidSelect.value || !documentSelect.value || !documentFile.files[0]) {
TrackerUtils.showToast('Please fill all required fields', 'error');
return;
}
try {
TrackerUtils.showLoading(document.body, 'Uploading document...');
const formData = new FormData();
formData.append('document', documentFile.files[0]);
formData.append('workItemId', documentSelect.value);
formData.append('bidId', bidSelect.value);
formData.append('comments', uploadComments.value);
formData.append('uploadedBy', this.currentUser.userId);
const response = await trackerStorage.uploadDocument(formData);
if (response.success) {
TrackerUtils.showToast('Document uploaded successfully!', 'success');
this.closeUploadModal();
await this.loadDashboardData();
this.updateStats();
this.renderDashboard();
} else {
throw new Error(response.message || 'Failed to upload document');
}
} catch (error) {
console.error('Document upload error:', error);
TrackerUtils.showToast('Failed to upload document: ' + error.message, 'error');
} finally {
TrackerUtils.hideLoading(document.querySelector('.loading-spinner'));
}
}
switchBidsView(view) {
this.currentBidsView = view;
const viewToggles = document.querySelectorAll('.view-toggle');
viewToggles.forEach(toggle => {
toggle.classList.toggle('active', toggle.dataset.view === view);
});
if (view === 'cards') {
document.getElementById('bidsCardsView').style.display = 'grid';
document.getElementById('bidsTableView').style.display = 'none';
this.renderBidsCards();
} else {
document.getElementById('bidsCardsView').style.display = 'none';
document.getElementById('bidsTableView').style.display = 'block';
this.renderBidsTable();
}
}
toggleNotifications() {
const dropdown = document.getElementById('notificationsDropdown');
if (dropdown) {
dropdown.classList.toggle('show');
}
}
async markNotificationRead(notificationId) {
try {
await trackerStorage.markNotificationRead(notificationId);
const notification = this.notificationsData.find(n => n.id === notificationId);
if (notification) {
notification.read = true;
}
this.renderNotifications();
this.updateStats();
} catch (error) {
console.error('Error marking notification as read:', error);
}
}
async markAllNotificationsRead() {
try {
await Promise.all(
this.notificationsData.filter(n => !n.read).map(n => 
trackerStorage.markNotificationRead(n.id)
)
);
this.notificationsData.forEach(n => n.read = true);
this.renderNotifications();
this.updateStats();
TrackerUtils.showToast('All notifications marked as read', 'success');
} catch (error) {
console.error('Error marking all notifications as read:', error);
}
}
dismissNotification(notificationId) {
this.notificationsData = this.notificationsData.filter(n => n.id !== notificationId);
this.renderNotifications();
this.updateStats();
}
refreshWorkQueue() {
this.loadDashboardData().then(() => {
this.updateStats();
this.renderDashboard();
TrackerUtils.showToast('Work queue refreshed', 'success');
});
}
showMyBids() {
this.currentBidsFilter = 'all';
document.getElementById('bidsFilter').value = 'all';
this.renderBids();
document.querySelector('.content-panel.wide').scrollIntoView({ behavior: 'smooth' });
}
showPendingWork() {
this.currentWorkFilter = 'pending';
document.getElementById('workFilter').value = 'pending';
this.renderWorkQueue();
document.querySelector('.content-panel:first-child').scrollIntoView({ behavior: 'smooth' });
}
showUploadCenter() {
this.showUploadModal();
}
showMyProgress() {
this.showProgressModal();
}
showFeedback() {
this.showFeedbackModal();
}
showHelp() {
TrackerUtils.showToast('Help & Support coming soon!', 'info');
}
viewWorkDetails(workId) {
const work = this.workQueue.find(w => w.id === workId);
if (work) {
this.showWorkDetailsModal(work);
}
}
startWork(workId) {
const work = this.workQueue.find(w => w.id === workId);
if (work && work.status === 'not_started') {
this.updateWorkStatus(workId, 'in_progress');
}
}
uploadForItem(workId) {
const work = this.workQueue.find(w => w.id === workId);
if (work) {
this.selectedDocument = work;
this.showUploadModal();
const bidSelect = document.getElementById('bidSelect');
const documentSelect = document.getElementById('documentSelect');
if (bidSelect) bidSelect.value = work.bidId;
if (documentSelect) {
this.loadBidDocuments();
setTimeout(() => {
documentSelect.value = work.id;
}, 100);
}
}
}
handleUrgentItem(itemId) {
const urgentItem = this.getUrgentItems().find(item => item.id === itemId);
if (urgentItem) {
if (urgentItem.type === 'notification') {
this.markNotificationRead(itemId);
} else {
this.viewWorkDetails(itemId);
}
}
}
viewBidDetails(bidId) {
window.location.href = `/bid-tracker/bid-detail.html?bidId=${bidId}`;
}
workOnBid(bidId) {
window.location.href = `/bid-tracker/bid-detail.html?bidId=${bidId}`;
}
uploadForBid(bidId) {
this.selectedUploadBid = bidId;
this.showUploadModal();
const bidSelect = document.getElementById('bidSelect');
if (bidSelect) {
bidSelect.value = bidId;
this.loadBidDocuments();
}
}
async updateWorkStatus(workId, newStatus) {
try {
const response = await trackerStorage.updateDocumentStatus(workId, newStatus, this.currentUser.userId);
if (response.success) {
const work = this.workQueue.find(w => w.id === workId);
if (work) {
work.status = newStatus;
}
this.renderWorkQueue();
this.updateStats();
TrackerUtils.showToast(`Work status updated to ${newStatus.replace('_', ' ')}`, 'success');
}
} catch (error) {
console.error('Error updating work status:', error);
TrackerUtils.showToast('Failed to update work status', 'error');
}
}
showUploadModal() {
const modal = document.getElementById('uploadModal');
if (modal) {
modal.style.display = 'flex';
}
}
closeUploadModal() {
const modal = document.getElementById('uploadModal');
if (modal) {
modal.style.display = 'none';
}
const form = document.getElementById('uploadForm');
if (form) {
form.reset();
}
const uploadText = document.getElementById('uploadText');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
if (uploadText) uploadText.textContent = 'Click to select file or drag and drop';
if (uploadSubmitBtn) uploadSubmitBtn.disabled = true;
}
showWorkDetailsModal(work) {
const modal = document.getElementById('workDetailsModal');
const content = document.getElementById('workDetailsContent');
if (!modal || !content) return;
const detailsHtml = `
<div class="work-details-content">
<div class="work-info-section">
<h4>Document Information</h4>
<div class="info-grid">
<div class="info-item">
<label>Field Name:</label>
<span>${work.fieldName}</span>
</div>
<div class="info-item">
<label>Category:</label>
<span>${work.categoryName}</span>
</div>
<div class="info-item">
<label>Bid:</label>
<span>${work.bidName}</span>
</div>
<div class="info-item">
<label>Priority:</label>
<span class="priority-badge ${work.priority}">${work.priority}</span>
</div>
<div class="info-item">
<label>Status:</label>
<span class="status-badge ${work.status}">${TrackerUtils.getStatusIcon(work.status)} ${work.status.replace('_', ' ')}</span>
</div>
<div class="info-item">
<label>Deadline:</label>
<span class="deadline-info ${TrackerUtils.isDeadlineApproaching(work.deadline) ? 'urgent' : ''}">${TrackerUtils.formatDate(work.deadline)}</span>
</div>
</div>
</div>
${work.comments && work.comments.length > 0 ? `
<div class="comments-section">
<h4>Comments & Feedback</h4>
<div class="comments-list">
${work.comments.map(comment => `
<div class="comment-item">
<div class="comment-header">
<span class="comment-author">${comment.author}</span>
<span class="comment-date">${TrackerUtils.formatDate(comment.date)}</span>
</div>
<div class="comment-text">${comment.text}</div>
</div>
`).join('')}
</div>
</div>
` : ''}
<div class="documents-section">
<h4>Submitted Documents</h4>
${work.documents && work.documents.length > 0 ? `
<div class="documents-list">
${work.documents.map(doc => `
<div class="document-item">
<div class="document-info">
<i class="fas fa-file-alt"></i>
<span>${doc.fileName}</span>
<span class="document-version">${doc.version}</span>
</div>
<div class="document-status">
<span class="status-badge ${doc.status}">${doc.status}</span>
</div>
</div>
`).join('')}
</div>
` : '<p class="no-documents">No documents submitted yet</p>'}
</div>
</div>
`;
content.innerHTML = detailsHtml;
modal.style.display = 'flex';
}
closeWorkDetailsModal() {
const modal = document.getElementById('workDetailsModal');
if (modal) {
modal.style.display = 'none';
}
}
showFeedbackModal() {
const modal = document.getElementById('feedbackModal');
const content = document.getElementById('feedbackContent');
if (!modal || !content) return;
const feedbackItems = this.workQueue.filter(work => 
work.comments && work.comments.length > 0
);
if (feedbackItems.length === 0) {
content.innerHTML = `
<div class="no-feedback">
<i class="fas fa-comment-slash"></i>
<p>No feedback available</p>
</div>
`;
} else {
const feedbackHtml = `
<div class="feedback-list">
${feedbackItems.map(work => `
<div class="feedback-item">
<div class="feedback-header">
<h4>${work.fieldName}</h4>
<span class="feedback-bid">${work.bidName}</span>
</div>
<div class="feedback-comments">
${work.comments.map(comment => `
<div class="comment">
<div class="comment-meta">
<span class="comment-author">${comment.author}</span>
<span class="comment-date">${TrackerUtils.formatDate(comment.date)}</span>
</div>
<div class="comment-text">${comment.text}</div>
</div>
`).join('')}
</div>
</div>
`).join('')}
</div>
`;
content.innerHTML = feedbackHtml;
}
modal.style.display = 'flex';
}
closeFeedbackModal() {
const modal = document.getElementById('feedbackModal');
if (modal) {
modal.style.display = 'none';
}
}
showProgressModal() {
const modal = document.getElementById('progressModal');
const content = document.getElementById('progressOverview');
if (!modal || !content) return;
const totalWork = this.workQueue.length;
const completedWork = this.workQueue.filter(w => w.status === 'approved').length;
const pendingWork = this.workQueue.filter(w => ['not_started', 'in_progress'].includes(w.status)).length;
const submittedWork = this.workQueue.filter(w => w.status === 'submitted').length;
const progressHtml = `
<div class="progress-overview-content">
<div class="overall-progress">
<h4>Overall Progress</h4>
<div class="progress-circle">
<div class="progress-text">${Math.round((completedWork / totalWork) * 100)}%</div>
</div>
<div class="progress-stats">
<div class="progress-stat">
<span class="stat-number">${completedWork}</span>
<span class="stat-label">Completed</span>
</div>
<div class="progress-stat">
<span class="stat-number">${pendingWork}</span>
<span class="stat-label">Pending</span>
</div>
<div class="progress-stat">
<span class="stat-number">${submittedWork}</span>
<span class="stat-label">Submitted</span>
</div>
</div>
</div>
<div class="bid-progress-list">
<h4>Progress by Bid</h4>
${this.assignedBids.map(bid => `
<div class="bid-progress-item">
<div class="bid-progress-header">
<span class="bid-name">${bid.name}</span>
<span class="bid-percentage">${this.getMyProgress(bid.id)}%</span>
</div>
<div class="progress-bar">
<div class="progress-fill" style="width: ${this.getMyProgress(bid.id)}%"></div>
</div>
<div class="bid-progress-details">
<span>${this.getMyCompletedDocs(bid.id)}/${this.getMyTotalDocs(bid.id)} completed</span>
<span>${this.getMyPendingDocs(bid.id)} pending</span>
</div>
</div>
`).join('')}
</div>
</div>
`;
content.innerHTML = progressHtml;
modal.style.display = 'flex';
}
closeProgressModal() {
const modal = document.getElementById('progressModal');
if (modal) {
modal.style.display = 'none';
}
}
closeAllModals() {
const modals = document.querySelectorAll('.modal');
modals.forEach(modal => modal.style.display = 'none');
}
}
document.addEventListener('DOMContentLoaded', () => {
console.log('Initializing Engineer Dashboard...');
window.engineerDashboard = new EngineerDashboard();
});
document.addEventListener('visibilitychange', () => {
if (!document.hidden && sessionManager.isAuthenticated()) {
sessionManager.updateActivity();
}
});