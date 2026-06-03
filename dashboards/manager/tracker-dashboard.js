class TrackerDashboard {
    constructor() {
        this.currentUser = null;
        this.currentStep = 1;
        this.maxSteps = 3;
        this.bidsData = [];
        this.usersData = [];
        this.notificationsData = [];
        this.activityData = [];
        this.currentBidsView = 'cards';
        this.currentFilter = 'active';
        this.bidCreationData = BidDataStructure.createEmptyBid();
        this.init();
    }
    async init() {
        console.log('Initializing Tracker Dashboard...');
        if (!sessionManager.isAuthenticated()) {
            sessionManager.redirectToLogin();
            return;
        }
        const session = sessionManager.getSession();
        if (!sessionManager.hasAnyRole(['Admin', 'Manager', 'Director'])) {
            console.error('Access denied: User does not have admin privileges');
            TrackerUtils.showToast('Access denied: Admin privileges required', 'error');
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
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', TrackerUtils.debounce((e) => {
                this.handleGlobalSearch(e.target.value);
            }, TrackerConfig.UI.SEARCH_DEBOUNCE));
        }
        const templateFileInput = document.getElementById('templateFileInput');
        if (templateFileInput) {
            templateFileInput.addEventListener('change', (e) => this.handleTemplateUpload(e));
        }
        const templateUploadArea = document.getElementById('templateUploadArea');
        if (templateUploadArea) {
            templateUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                templateUploadArea.classList.add('drag-over');
            });
            templateUploadArea.addEventListener('dragleave', () => {
                templateUploadArea.classList.remove('drag-over');
            });
            templateUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                templateUploadArea.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.processTemplateFile(files[0]);
                }
            });
        }
        const activityFilter = document.getElementById('activityFilter');
        if (activityFilter) {
            activityFilter.addEventListener('change', (e) => {
                this.filterActivity(e.target.value);
            });
        }
        const priorityFilter = document.getElementById('priorityFilter');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', (e) => {
                this.filterPriorityItems(e.target.value);
            });
        }
        const bidsFilter = document.getElementById('bidsFilter');
        if (bidsFilter) {
            bidsFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.renderBids();
            });
        }
        const manualBidForm = document.getElementById('manualBidForm');
        if (manualBidForm) {
            manualBidForm.addEventListener('submit', (e) => this.handleManualBidSubmit(e));
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
            const [bidsData, usersData, notificationsData, activityData] = await Promise.all([
                trackerStorage.getAllBids(this.currentUser.userId),
                trackerStorage.getTeamMembers(),
                trackerStorage.getNotifications(this.currentUser.userId),
                this.loadActivityData()
            ]);
            this.bidsData = bidsData.bids || [];
            this.usersData = usersData.users || [];
            this.notificationsData = notificationsData.notifications || [];
            this.activityData = activityData || [];
            console.log('Dashboard data loaded successfully');
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            throw error;
        } finally {
            TrackerUtils.hideLoading(document.querySelector('.loading-spinner'));
        }
    }
    async loadActivityData() {
        try {
            const response = await trackerStorage.apiCall(`${TrackerConfig.API.BASE_URL}/activity`);
            return response.activities || [];
        } catch (error) {
            console.error('Error loading activity data:', error);
            return this.getDemoActivityData();
        }
    }
    updateStats() {
        const activeBids = this.bidsData.filter(bid => 
            ['draft', 'in_progress', 'review'].includes(bid.status)
        ).length;
        const documentsAwaitingReview = this.bidsData.reduce((sum, bid) => 
            sum + (bid.progress?.pendingDocuments || 0), 0
        );
        const upcomingDeadlines = this.bidsData.filter(bid => {
            if (!bid.deadline) return false;
            const deadline = new Date(bid.deadline);
            const now = new Date();
            const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
            return daysUntil <= 7 && daysUntil >= 0;
        }).length;
        const completedThisMonth = this.bidsData.filter(bid => {
            if (bid.status !== 'completed') return false;
            const completed = new Date(bid.lastModified);
            const now = new Date();
            return completed.getMonth() === now.getMonth() && completed.getFullYear() === now.getFullYear();
        }).length;
        const overdue = this.bidsData.filter(bid => {
            if (!bid.deadline) return false;
            const deadline = new Date(bid.deadline);
            return deadline < new Date() && !['completed', 'cancelled'].includes(bid.status);
        }).length;
        const completionRate = this.bidsData.length > 0 ? 
            Math.round((this.bidsData.filter(b => b.status === 'completed').length / this.bidsData.length) * 100) : 0;
        this.updateStatElement('totalActiveBids', activeBids);
        this.updateStatElement('documentsAwaitingReview', documentsAwaitingReview);
        this.updateStatElement('upcomingDeadlines', upcomingDeadlines);
        this.updateStatElement('completedThisMonth', completedThisMonth);
        this.updateStatElement('overdueCount', overdue);
        this.updateStatElement('completionRate', `${completionRate}%`);
        this.updateStatElement('notificationCount', this.notificationsData.length);
        this.updateStatElement('approvalQueueCount', documentsAwaitingReview);
    }
    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }
    renderDashboard() {
        this.renderNotifications();
        this.renderActivity();
        this.renderPriorityItems();
        this.renderBids();
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
                        <button onclick="trackerDashboard.markNotificationRead('${notification.id}')" title="Mark as read">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                    <button onclick="trackerDashboard.dismissNotification('${notification.id}')" title="Dismiss">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
        notificationsList.innerHTML = notificationsHtml;
    }
    renderActivity() {
        const activityTimeline = document.getElementById('activityTimeline');
        if (!activityTimeline) return;
        if (this.activityData.length === 0) {
            activityTimeline.innerHTML = `
                <div class="no-activity">
                    <i class="fas fa-history"></i>
                    <p>No recent activity</p>
                </div>
            `;
            return;
        }
        const activityHtml = this.activityData.slice(0, 20).map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <span class="activity-user">${activity.userName}</span>
                        <span class="activity-action">${activity.action}</span>
                        <span class="activity-target">${activity.target}</span>
                    </div>
                    <div class="activity-time">${TrackerUtils.formatDate(activity.timestamp, TrackerConfig.DATETIME.FORMAT)}</div>
                </div>
            </div>
        `).join('');
        activityTimeline.innerHTML = activityHtml;
    }
    renderPriorityItems() {
        const priorityList = document.getElementById('priorityList');
        if (!priorityList) return;
        const priorityItems = this.getPriorityItems();
        if (priorityItems.length === 0) {
            priorityList.innerHTML = `
                <div class="no-priority-items">
                    <i class="fas fa-check-circle"></i>
                    <p>No urgent items</p>
                </div>
            `;
            return;
        }
        const priorityHtml = priorityItems.map(item => `
            <div class="priority-item ${item.priority}">
                <div class="priority-icon">
                    <i class="fas fa-${item.icon}"></i>
                </div>
                <div class="priority-content">
                    <h4>${item.title}</h4>
                    <p>${item.description}</p>
                    <div class="priority-meta">
                        <span class="priority-type">${item.type}</span>
                        <span class="priority-deadline">${TrackerUtils.getTimeUntilDeadline(item.deadline).message}</span>
                    </div>
                </div>
                <div class="priority-actions">
                    <button onclick="trackerDashboard.handlePriorityItem('${item.id}')" class="btn primary small">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `).join('');
        priorityList.innerHTML = priorityHtml;
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
                    <p>No bids found matching your criteria</p>
                    <button class="btn primary" onclick="trackerDashboard.showCreateBid()">
                        <i class="fas fa-plus"></i> Create New Bid
                    </button>
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
                            <i class="fas fa-user"></i>
                            <span>${this.getAssignedEngineer(bid)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar"></i>
                            <span>${TrackerUtils.formatDate(bid.deadline)}</span>
                        </div>
                    </div>
                    <div class="bid-progress">
                        <div class="progress-header">
                            <span>Progress: ${bid.progress?.completionPercentage || 0}%</span>
                            <span>${bid.progress?.approvedDocuments || 0}/${bid.progress?.totalDocuments || 0} docs</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${bid.progress?.completionPercentage || 0}%"></div>
                        </div>
                    </div>
                </div>
                <div class="bid-actions">
                    <button onclick="trackerDashboard.viewBidDetails('${bid.id}')" class="btn secondary small">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button onclick="trackerDashboard.editBid('${bid.id}')" class="btn primary small">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="trackerDashboard.openBidTracker('${bid.id}')" class="btn success small">
                        <i class="fas fa-external-link-alt"></i> Open
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
                        <p>No bids found matching your criteria</p>
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
                <td>${this.getAssignedEngineer(bid)}</td>
                <td>
                    <span class="status-badge ${bid.status}">
                        ${TrackerUtils.getStatusIcon(bid.status)} ${bid.status.replace('_', ' ')}
                    </span>
                </td>
                <td>
                    <div class="progress-cell">
                        <div class="progress-bar small">
                            <div class="progress-fill" style="width: ${bid.progress?.completionPercentage || 0}%"></div>
                        </div>
                        <span>${bid.progress?.completionPercentage || 0}%</span>
                    </div>
                </td>
                <td>
                    <div class="deadline-cell ${TrackerUtils.isDeadlineApproaching(bid.deadline) ? 'approaching' : ''}">
                        ${TrackerUtils.formatDate(bid.deadline)}
                        <small>${TrackerUtils.getTimeUntilDeadline(bid.deadline).message}</small>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button onclick="trackerDashboard.viewBidDetails('${bid.id}')" class="btn-icon secondary" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="trackerDashboard.editBid('${bid.id}')" class="btn-icon primary" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="trackerDashboard.openBidTracker('${bid.id}')" class="btn-icon success" title="Open Tracker">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        bidsTableBody.innerHTML = bidsHtml;
    }
    getFilteredBids() {
        let filtered = [...this.bidsData];
        if (this.currentFilter !== 'all') {
            if (this.currentFilter === 'active') {
                filtered = filtered.filter(bid => ['draft', 'in_progress', 'review'].includes(bid.status));
            } else {
                filtered = filtered.filter(bid => bid.status === this.currentFilter);
            }
        }
        return filtered;
    }
    getAssignedEngineer(bid) {
        if (!bid.teamMembers || bid.teamMembers.length === 0) return 'Unassigned';
        const engineerMember = bid.teamMembers.find(member => {
            const user = this.usersData.find(u => u.userId === member.userId);
            return user && user.userType === 'Engineer';
        });
        if (!engineerMember) return 'Unassigned';
        const engineer = this.usersData.find(u => u.userId === engineerMember.userId);
        return engineer ? (engineer.fullName || engineer.username) : engineerMember.userId;
    }
    getPriorityItems() {
        const items = [];
        this.bidsData.forEach(bid => {
            if (TrackerUtils.isDeadlineApproaching(bid.deadline)) {
                items.push({
                    id: bid.id,
                    type: 'deadline',
                    priority: 'high',
                    icon: 'clock',
                    title: `Deadline Approaching: ${bid.name}`,
                    description: `Bid deadline is ${TrackerUtils.getTimeUntilDeadline(bid.deadline).message}`,
                    deadline: bid.deadline
                });
            }
            if (bid.progress && bid.progress.pendingDocuments > 0) {
                items.push({
                    id: bid.id,
                    type: 'review',
                    priority: 'medium',
                    icon: 'file-alt',
                    title: `Documents Awaiting Review: ${bid.name}`,
                    description: `${bid.progress.pendingDocuments} documents need your review`,
                    deadline: bid.deadline
                });
            }
        });
        return items.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
    getActivityIcon(type) {
        const icons = {
            'bid_created': 'plus',
            'bid_updated': 'edit',
            'document_uploaded': 'upload',
            'document_approved': 'check',
            'document_rejected': 'times',
            'user_assigned': 'user-plus',
            'deadline_updated': 'calendar'
        };
        return icons[type] || 'circle';
    }
    handleGlobalSearch(query) {
        if (!query) {
            this.renderBids();
            return;
        }
        const filteredBids = this.bidsData.filter(bid =>
            bid.name.toLowerCase().includes(query.toLowerCase()) ||
            (bid.clientName && bid.clientName.toLowerCase().includes(query.toLowerCase())) ||
            (bid.description && bid.description.toLowerCase().includes(query.toLowerCase()))
        );
        this.bidsData = filteredBids;
        this.renderBids();
    }
    async handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (file) {
            await this.processTemplateFile(file);
        }
    }
    async processTemplateFile(file) {
        if (!TrackerUtils.isValidFileType(file.name, ['xlsx', 'xls'])) {
            TrackerUtils.showToast('Please select a valid Excel file (.xlsx or .xls)', 'error');
            return;
        }
        try {
            this.showUploadProgress();
            const templateData = await trackerStorage.processTemplate(file);
            if (templateData.success) {
                this.bidCreationData = templateData.bidStructure;
                TrackerUtils.showToast('Template processed successfully!', 'success');
                this.closeTemplateUploadModal();
                this.showManualBidCreation(true);
            } else {
                throw new Error(templateData.message || 'Failed to process template');
            }
        } catch (error) {
            console.error('Template processing error:', error);
            TrackerUtils.showToast('Failed to process template: ' + error.message, 'error');
        } finally {
            this.hideUploadProgress();
        }
    }
    showUploadProgress() {
        const uploadArea = document.getElementById('templateUploadArea');
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadArea) uploadArea.style.display = 'none';
        if (uploadProgress) uploadProgress.style.display = 'block';
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            const progressBar = document.getElementById('uploadProgressBar');
            const progressText = document.getElementById('uploadProgressPercent');
            if (progressBar) progressBar.style.width = `${progress}%`;
            if (progressText) progressText.textContent = `${progress}%`;
            if (progress >= 90) {
                clearInterval(progressInterval);
            }
        }, 200);
        this.uploadProgressInterval = progressInterval;
    }
    hideUploadProgress() {
        if (this.uploadProgressInterval) {
            clearInterval(this.uploadProgressInterval);
        }
        const uploadArea = document.getElementById('templateUploadArea');
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadArea) uploadArea.style.display = 'block';
        if (uploadProgress) uploadProgress.style.display = 'none';
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressPercent');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }
    async handleManualBidSubmit(event) {
        event.preventDefault();
        try {
            const formData = this.collectBidFormData();
            const validationErrors = BidDataStructure.validateBid(formData);
            if (validationErrors.length > 0) {
                TrackerUtils.showToast('Please fix the following errors: ' + validationErrors.join(', '), 'error');
                return;
            }
            TrackerUtils.showLoading(document.body, 'Creating bid...');
            const response = await trackerStorage.createBid(formData);
            if (response.success) {
                TrackerUtils.showToast('Bid created successfully!', 'success');
                this.closeManualBidModal();
                await this.loadDashboardData();
                this.updateStats();
                this.renderDashboard();
            } else {
                throw new Error(response.message || 'Failed to create bid');
            }
        } catch (error) {
            console.error('Bid creation error:', error);
            TrackerUtils.showToast('Failed to create bid: ' + error.message, 'error');
        } finally {
            TrackerUtils.hideLoading(document.querySelector('.loading-spinner'));
        }
    }
    collectBidFormData() {
        const formData = { ...this.bidCreationData };
        formData.name = document.getElementById('bidName').value;
        formData.clientName = document.getElementById('clientName').value;
        formData.deadline = document.getElementById('bidDeadline').value;
        formData.description = document.getElementById('bidDescription').value;
        formData.createdBy = this.currentUser.userId;
        const teamMembersSelect = document.getElementById('teamMembers');
        if (teamMembersSelect) {
            formData.teamMembers = Array.from(teamMembersSelect.selectedOptions).map(option => ({
                userId: option.value,
                role: 'member',
                assignedDate: new Date().toISOString()
            }));
        }
        const approvalListSelect = document.getElementById('approvalList');
        if (approvalListSelect) {
            formData.approvalList = Array.from(approvalListSelect.selectedOptions).map(option => option.value);
        }
        return formData;
    }
    nextStep() {
        if (this.currentStep < this.maxSteps) {
            this.currentStep++;
            this.updateFormSteps();
        }
    }
    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateFormSteps();
        }
    }
    updateFormSteps() {
        const steps = document.querySelectorAll('.form-step');
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const submitBtn = document.getElementById('submitBidBtn');
        steps.forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentStep);
        });
        if (prevBtn) prevBtn.style.display = this.currentStep > 1 ? 'inline-block' : 'none';
        if (nextBtn) nextBtn.style.display = this.currentStep < this.maxSteps ? 'inline-block' : 'none';
        if (submitBtn) submitBtn.style.display = this.currentStep === this.maxSteps ? 'inline-block' : 'none';
        if (this.currentStep === 2) {
            this.populateTeamSelectors();
        } else if (this.currentStep === 3) {
            this.renderDocumentStructure();
        }
    }
    async populateTeamSelectors() {
        const teamMembersSelect = document.getElementById('teamMembers');
        const approvalListSelect = document.getElementById('approvalList');
        if (teamMembersSelect) {
            teamMembersSelect.innerHTML = '';
            this.usersData.filter(user => user.trackerAccess).forEach(user => {
                const option = document.createElement('option');
                option.value = user.userId;
                option.textContent = `${user.fullName || user.username} (${user.userType})`;
                teamMembersSelect.appendChild(option);
            });
        }
        if (approvalListSelect) {
            approvalListSelect.innerHTML = '';
            this.usersData.filter(user => ['Manager', 'Admin', 'Director'].includes(user.userType)).forEach(user => {
                const option = document.createElement('option');
                option.value = user.userId;
                option.textContent = `${user.fullName || user.username} (${user.userType})`;
                approvalListSelect.appendChild(option);
            });
        }
    }
    renderDocumentStructure() {
        const bidTypesList = document.getElementById('bidTypesList');
        if (!bidTypesList) return;
        if (!this.bidCreationData.bidTypeDocuments) {
            this.bidCreationData.bidTypeDocuments = [];
        }
        const bidTypesHtml = this.bidCreationData.bidTypeDocuments.map((bidType, index) => `
            <div class="bid-type-item" data-index="${index}">
                <div class="bid-type-header">
                    <h5>${bidType.name}</h5>
                    <div class="bid-type-controls">
                        <span class="priority-badge">Priority: ${bidType.priority}</span>
                        <button type="button" onclick="trackerDashboard.removeBidType(${index})" class="btn danger small">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="categories-list">
                    ${bidType.categories ? bidType.categories.map((category, catIndex) => `
                        <div class="category-item">
                            <span>${category.name}</span>
                            <span class="field-count">${category.fields ? category.fields.length : 0} fields</span>
                        </div>
                    `).join('') : ''}
                </div>
            </div>
        `).join('');
        bidTypesList.innerHTML = bidTypesHtml;
    }
    addBidTypeDocument() {
        const bidType = BidDataStructure.createBidTypeDocument('New Document Type', 1);
        this.bidCreationData.bidTypeDocuments.push(bidType);
        this.renderDocumentStructure();
    }
    removeBidType(index) {
        this.bidCreationData.bidTypeDocuments.splice(index, 1);
        this.renderDocumentStructure();
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
    filterActivity(type) {
        if (type === 'all') {
            this.renderActivity();
        } else {
            const filteredActivity = this.activityData.filter(activity => activity.type.includes(type));
            this.activityData = filteredActivity;
            this.renderActivity();
        }
    }
    filterPriorityItems(priority) {
        this.renderPriorityItems();
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
    refreshActivity() {
        this.loadActivityData().then(data => {
            this.activityData = data;
            this.renderActivity();
        });
    }
    handlePriorityItem(itemId) {
        const bid = this.bidsData.find(b => b.id === itemId);
        if (bid) {
            this.openBidTracker(bid.id);
        }
    }
    showCreateBid() {
        const modal = document.getElementById('createBidModal');
        if (modal) {
            this.bidCreationData = BidDataStructure.createEmptyBid();
            this.currentStep = 1;
            modal.style.display = 'flex';
        }
    }
    closeCreateBidModal() {
        const modal = document.getElementById('createBidModal');
        if (modal) modal.style.display = 'none';
    }
    showManualBidCreation(fromTemplate = false) {
        this.closeCreateBidModal();
        const modal = document.getElementById('manualBidModal');
        if (modal) {
            this.currentStep = 1;
            this.updateFormSteps();
            modal.style.display = 'flex';
            if (fromTemplate) {
                TrackerUtils.showToast('Template loaded! Review and customize your bid.', 'info');
            }
        }
    }
    closeManualBidModal() {
        const modal = document.getElementById('manualBidModal');
        if (modal) {
            modal.style.display = 'none';
            this.currentStep = 1;
        }
    }
    showTemplateBidCreation() {
        this.closeCreateBidModal();
        const modal = document.getElementById('templateUploadModal');
        if (modal) modal.style.display = 'flex';
    }
    closeTemplateUploadModal() {
        const modal = document.getElementById('templateUploadModal');
        if (modal) modal.style.display = 'none';
    }
    showBidList() {
        // window.location.href = '/bid-tracker/bid-list.html';
        TrackerUtils.showToast('Bid List functionality coming soon!', 'info');
    }
    showApprovalQueue() {
        // window.location.href = '/bid-tracker/approval-workflow.html';
        TrackerUtils.showToast('Approval Queue functionality coming soon!', 'info');
    }
    showTeamManagement() {
        TrackerUtils.showToast('Team Management coming soon!', 'info');
    }
    showReports() {
        TrackerUtils.showToast('Reports & Analytics coming soon!', 'info');
    }
    showSystemSettings() {
        TrackerUtils.showToast('System Settings coming soon!', 'info');
    }
    viewBidDetails(bidId) {
        window.location.href = `/bid-tracker/bid-detail.html?bidId=${bidId}`;
    }
    editBid(bidId) {
        TrackerUtils.showToast('Edit bid functionality coming soon!', 'info');
    }
    openBidTracker(bidId) {
        window.open(`/bid-tracker/bid-detail.html?bidId=${bidId}`, '_blank');
    }
    closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => modal.style.display = 'none');
    }
    getDemoActivityData() {
        return [
            {
                type: 'bid_created',
                userName: 'John Manager',
                action: 'created bid',
                target: 'Network Infrastructure Project',
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
            },
            {
                type: 'document_uploaded',
                userName: 'Jane Engineer',
                action: 'uploaded document',
                target: 'Technical Specifications v2.1',
                timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
            },
            {
                type: 'document_approved',
                userName: 'Mike Director',
                action: 'approved document',
                target: 'Financial Proposal',
                timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
            }
        ];
    }
}
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Admin Tracker Dashboard...');
    window.trackerDashboard = new TrackerDashboard();
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionManager.isAuthenticated()) {
        sessionManager.updateActivity();
    }
});