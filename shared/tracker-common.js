// Shared Tracker Utilities
// Path: /shared/tracker-common.js

class TrackerUtils {
    
    // Date and Time Utilities
    static formatDate(dateString, format = TrackerConfig.DATETIME.DATE_FORMAT) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    static getTimeUntilDeadline(deadline) {
        const now = new Date();
        const deadlineDate = new Date(deadline);
        const timeDiff = deadlineDate.getTime() - now.getTime();
        
        if (timeDiff <= 0) {
            return { expired: true, message: 'Expired' };
        }
        
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) {
            return { expired: false, message: `${days} day${days > 1 ? 's' : ''} remaining` };
        } else if (hours > 0) {
            return { expired: false, message: `${hours} hour${hours > 1 ? 's' : ''} remaining` };
        } else {
            return { expired: false, message: 'Less than 1 hour remaining' };
        }
    }

    static isDeadlineApproaching(deadline, warningDays = 3) {
        const now = new Date();
        const deadlineDate = new Date(deadline);
        const timeDiff = deadlineDate.getTime() - now.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        
        return daysDiff <= warningDays && daysDiff >= 0;
    }

    // File Utilities
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static getFileExtension(fileName) {
        return fileName.split('.').pop().toLowerCase();
    }

    static isValidFileType(fileName, allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'png']) {
        const extension = this.getFileExtension(fileName);
        return allowedTypes.includes(extension);
    }

    // Status Utilities
    static getStatusColor(status) {
        const statusColors = {
            'not_started': '#6c757d',
            'draft': '#6c757d',
            'in_progress': '#0d6efd',
            'submitted': '#fd7e14',
            'under_review': '#ffc107',
            'approved': '#198754',
            'rejected': '#dc3545',
            'revision_required': '#e63946',
            'active': '#198754',
            'completed': '#198754',
            'cancelled': '#6c757d',
            'on_hold': '#ffc107'
        };
        return statusColors[status] || '#6c757d';
    }

    static getStatusIcon(status) {
        const statusIcons = {
            'not_started': '⏳',
            'draft': '📝',
            'in_progress': '🔄',
            'submitted': '📤',
            'under_review': '👀',
            'approved': '✅',
            'rejected': '❌',
            'revision_required': '🔄',
            'active': '🟢',
            'completed': '✅',
            'cancelled': '🚫',
            'on_hold': '⏸️'
        };
        return statusIcons[status] || '❓';
    }

    static getPriorityColor(priority) {
        const priorityColors = {
            'low': '#198754',
            'medium': '#ffc107',
            'high': '#fd7e14',
            'urgent': '#dc3545'
        };
        return priorityColors[priority] || '#6c757d';
    }

    // User Utilities
    static hasPermission(userPermissions, requiredPermission) {
        if (!userPermissions) return false;
        return userPermissions.includes('all') || userPermissions.includes(requiredPermission);
    }

    static canUserAccess(userType, requiredTypes) {
        if (!Array.isArray(requiredTypes)) requiredTypes = [requiredTypes];
        return requiredTypes.includes(userType);
    }

    // Search and Filter Utilities
    static searchItems(items, searchTerm, searchFields) {
        if (!searchTerm) return items;
        
        const term = searchTerm.toLowerCase();
        return items.filter(item => {
            return searchFields.some(field => {
                const value = this.getNestedProperty(item, field);
                return value && value.toString().toLowerCase().includes(term);
            });
        });
    }

    static filterItems(items, filters) {
        return items.filter(item => {
            return Object.entries(filters).every(([key, value]) => {
                if (!value) return true;
                const itemValue = this.getNestedProperty(item, key);
                return itemValue === value;
            });
        });
    }

    static sortItems(items, sortField, sortDirection = 'asc') {
        return items.sort((a, b) => {
            const aValue = this.getNestedProperty(a, sortField);
            const bValue = this.getNestedProperty(b, sortField);
            
            if (aValue === bValue) return 0;
            
            const comparison = aValue > bValue ? 1 : -1;
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    // DOM Utilities
    static createElement(tag, className = '', content = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (content) element.innerHTML = content;
        return element;
    }

    static showToast(message, type = 'info', duration = TrackerConfig.UI.NOTIFICATION_TIMEOUT) {
        const toast = this.createElement('div', `toast toast-${type}`, message);
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    static showLoading(container, message = 'Loading...') {
        const loading = this.createElement('div', 'loading-spinner', `
            <div class="spinner"></div>
            <div class="loading-message">${message}</div>
        `);
        container.appendChild(loading);
        return loading;
    }

    static hideLoading(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.parentNode.removeChild(loadingElement);
        }
    }

    // Validation Utilities
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static validateRequired(value) {
        return value !== null && value !== undefined && value.toString().trim() !== '';
    }

    static validateDate(dateString) {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }

    // Helper Methods
    static getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    static setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    static debounce(func, wait) {
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

    static generateRandomId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    // Progress Calculation Utilities
    static calculateProgressPercentage(completed, total) {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100);
    }

    static getProgressBarClass(percentage) {
        if (percentage < 30) return 'progress-danger';
        if (percentage < 70) return 'progress-warning';
        return 'progress-success';
    }

    // URL and Navigation Utilities
    static buildUrl(base, params = {}) {
        const url = new URL(base, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                url.searchParams.append(key, value);
            }
        });
        return url.toString();
    }

    static navigateTo(path, params = {}) {
        const url = this.buildUrl(path, params);
        window.location.href = url;
    }

    static getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
}