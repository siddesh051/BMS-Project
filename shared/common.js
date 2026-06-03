// Common Utilities for QG Bid Portal
// Shared functions and utilities used across the application

class CommonUtils {
    constructor() {
        this.serverUrl = window.location.origin;
        this.dateFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
    }

    // Format date for display
    formatDate(dateString, includeTime = true) {
        if (!dateString) return 'N/A';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid Date';
            
            if (includeTime) {
                return date.toLocaleString('en-US', this.dateFormatOptions);
            } else {
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
        } catch (error) {
            console.error('Date formatting error:', error);
            return 'Invalid Date';
        }
    }

    // Format file size
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format currency
    formatCurrency(amount, currency = 'USD') {
        if (!amount || isNaN(amount)) return '$0.00';
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // Get time ago format
    getTimeAgo(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffInSeconds = Math.floor((now - date) / 1000);
            
            if (diffInSeconds < 60) return 'Just now';
            if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
            if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
            if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
            
            return this.formatDate(dateString, false);
        } catch (error) {
            return 'Unknown';
        }
    }

    // Validate email format
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Generate unique ID
    generateUniqueId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Sanitize filename
    sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    }

    // Get file extension
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // Check if file type is allowed
    isAllowedFileType(filename, allowedTypes = []) {
        if (allowedTypes.length === 0) {
            // Default allowed types for bid documents
            allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'jpg', 'jpeg', 'png'];
        }
        
        const extension = this.getFileExtension(filename);
        return allowedTypes.includes(extension);
    }

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // Show toast notification
    showToast(message, type = 'info', duration = 4000) {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast-notification');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <i class="${icons[type] || icons.info}"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(toast);

        // Auto-remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);

        return toast;
    }

    // Show loading overlay
    showLoadingOverlay(message = 'Loading...') {
        // Remove existing overlay
        this.hideLoadingOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    // Hide loading overlay
    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // Show confirmation dialog
    showConfirmDialog(title, message, onConfirm, onCancel = null) {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog-overlay';
        dialog.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-header">
                    <h3>${title}</h3>
                </div>
                <div class="confirm-content">
                    <p>${message}</p>
                </div>
                <div class="confirm-actions">
                    <button class="confirm-btn-cancel">Cancel</button>
                    <button class="confirm-btn-confirm">Confirm</button>
                </div>
            </div>
        `;

        const cancelBtn = dialog.querySelector('.confirm-btn-cancel');
        const confirmBtn = dialog.querySelector('.confirm-btn-confirm');

        cancelBtn.addEventListener('click', () => {
            dialog.remove();
            if (onCancel) onCancel();
        });

        confirmBtn.addEventListener('click', () => {
            dialog.remove();
            if (onConfirm) onConfirm();
        });

        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                if (onCancel) onCancel();
            }
        });

        document.body.appendChild(dialog);
        return dialog;
    }

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard!', 'success', 2000);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showToast('Failed to copy to clipboard', 'error');
            return false;
        }
    }

    // Download file
    downloadFile(url, filename) {
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || 'download';
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('Download started', 'success', 2000);
            return true;
        } catch (error) {
            console.error('Download error:', error);
            this.showToast('Download failed', 'error');
            return false;
        }
    }

    // Get status badge HTML
    getStatusBadge(status) {
        const statusConfig = {
            'Draft': { class: 'status-draft', icon: 'fas fa-edit', color: '#6c757d' },
            'InProgress': { class: 'status-progress', icon: 'fas fa-clock', color: '#17a2b8' },
            'Review': { class: 'status-review', icon: 'fas fa-eye', color: '#ffc107' },
            'Approved': { class: 'status-approved', icon: 'fas fa-check', color: '#28a745' },
            'Rejected': { class: 'status-rejected', icon: 'fas fa-times', color: '#dc3545' },
            'Submitted': { class: 'status-submitted', icon: 'fas fa-paper-plane', color: '#007bff' },
            'Won': { class: 'status-won', icon: 'fas fa-trophy', color: '#28a745' },
            'Lost': { class: 'status-lost', icon: 'fas fa-times-circle', color: '#dc3545' },
            'Active': { class: 'status-active', icon: 'fas fa-check-circle', color: '#28a745' },
            'Inactive': { class: 'status-inactive', icon: 'fas fa-ban', color: '#6c757d' }
        };

        const config = statusConfig[status] || statusConfig['Draft'];
        
        return `
            <span class="status-badge ${config.class}" style="background-color: ${config.color}">
                <i class="${config.icon}"></i>
                ${status}
            </span>
        `;
    }

    // Get priority badge HTML
    getPriorityBadge(priority) {
        const priorityConfig = {
            'High': { class: 'priority-high', color: '#dc3545' },
            'Medium': { class: 'priority-medium', color: '#ffc107' },
            'Low': { class: 'priority-low', color: '#28a745' }
        };

        const config = priorityConfig[priority] || priorityConfig['Medium'];
        
        return `
            <span class="priority-badge ${config.class}" style="background-color: ${config.color}">
                ${priority}
            </span>
        `;
    }

    // Calculate progress percentage
    calculateProgress(completed, total) {
        if (!total || total === 0) return 0;
        return Math.round((completed / total) * 100);
    }

    // Get progress bar HTML
    getProgressBar(percentage, showText = true) {
        const color = percentage < 30 ? '#dc3545' : percentage < 70 ? '#ffc107' : '#28a745';
        
        return `
            <div class="progress-container">
                <div class="progress-bar" style="background-color: #e9ecef;">
                    <div class="progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
                </div>
                ${showText ? `<span class="progress-text">${percentage}%</span>` : ''}
            </div>
        `;
    }

    // Local storage helpers
    setLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Local storage error:', error);
            return false;
        }
    }

    getLocalStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Local storage error:', error);
            return defaultValue;
        }
    }

    removeLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Local storage error:', error);
            return false;
        }
    }

    // API helper methods
    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(`${this.serverUrl}${endpoint}`, finalOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call error:', error);
            throw error;
        }
    }

    // Initialize common functionality
    init() {
        this.addCommonStyles();
        this.addKeyboardShortcuts();
        console.log('Common utilities initialized');
    }

    // Add common CSS styles
    addCommonStyles() {
        if (document.getElementById('commonStyles')) return;

        const style = document.createElement('style');
        style.id = 'commonStyles';
        style.textContent = `
            /* Toast Notifications */
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 9999;
                min-width: 300px;
                animation: slideInToast 0.3s ease;
            }

            .toast-success { border-left: 4px solid #28a745; }
            .toast-error { border-left: 4px solid #dc3545; }
            .toast-warning { border-left: 4px solid #ffc107; }
            .toast-info { border-left: 4px solid #17a2b8; }

            .toast-close {
                background: none;
                border: none;
                cursor: pointer;
                color: #6c757d;
                margin-left: auto;
            }

            /* Loading Overlay */
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .loading-content {
                background: white;
                padding: 30px;
                border-radius: 8px;
                text-align: center;
                color: #333;
                font-size: 1.1rem;
            }

            .loading-content i {
                font-size: 2rem;
                margin-bottom: 15px;
                color: #007bff;
            }

            /* Status and Priority Badges */
            .status-badge, .priority-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 0.8rem;
                font-weight: 500;
                color: white;
            }

            /* Progress Bar */
            .progress-container {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .progress-bar {
                flex: 1;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                border-radius: 4px;
                transition: width 0.3s ease;
            }

            .progress-text {
                font-size: 0.9rem;
                font-weight: 500;
                color: #6c757d;
                min-width: 35px;
            }

            /* Confirm Dialog */
            .confirm-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .confirm-dialog {
                background: white;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }

            .confirm-header {
                padding: 20px 20px 0;
            }

            .confirm-content {
                padding: 10px 20px 20px;
                color: #6c757d;
            }

            .confirm-actions {
                padding: 0 20px 20px;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }

            .confirm-btn-cancel, .confirm-btn-confirm {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            }

            .confirm-btn-cancel {
                background: #6c757d;
                color: white;
            }

            .confirm-btn-confirm {
                background: #007bff;
                color: white;
            }

            @keyframes slideInToast {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        
        document.head.appendChild(style);
    }

    // Add common keyboard shortcuts
    addKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+/ or Cmd+/ for help
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                this.showKeyboardShortcuts();
            }
        });
    }

    // Show keyboard shortcuts help
    showKeyboardShortcuts() {
        const shortcuts = [
            { key: 'Ctrl + /', description: 'Show keyboard shortcuts' },
            { key: 'Ctrl + F', description: 'Search documents' },
            { key: 'Escape', description: 'Close modals/dialogs' },
            { key: 'Ctrl + L', description: 'Logout' }
        ];

        const shortcutsHtml = shortcuts.map(s => 
            `<div class="shortcut-item">
                <kbd>${s.key}</kbd>
                <span>${s.description}</span>
            </div>`
        ).join('');

        this.showConfirmDialog(
            'Keyboard Shortcuts',
            `<div class="shortcuts-list">${shortcutsHtml}</div>`,
            () => {} // Empty confirm action
        );
    }
}

// Create global instance
const utils = new CommonUtils();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    utils.init();
});

// Make available globally
window.utils = utils;