// Bid Tracker Storage Handler
// Path: /bid-tracker/tracker-storage.js

class TrackerStorage {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map();
    }

    // Generic API call handler
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call error:', error);
            throw error;
        }
    }

    // Cache management
    isValidCache(key) {
        if (!this.cache.has(key)) return false;
        
        const timestamp = this.cacheTimestamps.get(key);
        const now = Date.now();
        return (now - timestamp) < TrackerConfig.CACHE.DURATION;
    }

    setCache(key, data) {
        this.cache.set(key, data);
        this.cacheTimestamps.set(key, Date.now());
        
        // Clean old cache entries
        if (this.cache.size > TrackerConfig.CACHE.MAX_ENTRIES) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this.cacheTimestamps.delete(oldestKey);
        }
    }

    getCache(key) {
        return this.isValidCache(key) ? this.cache.get(key) : null;
    }

    // Bid Operations
    async getAllBids(userId) {
        const cacheKey = `bids_${userId}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.BIDS}/${userId}`);
        this.setCache(cacheKey, response);
        return response;
    }

    async getBidById(bidId) {
        const cacheKey = `bid_${bidId}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.BIDS}/detail/${bidId}`);
        this.setCache(cacheKey, response);
        return response;
    }

    async createBid(bidData) {
        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.BIDS}/create`, {
            method: 'POST',
            body: JSON.stringify(bidData)
        });
        
        // Clear relevant caches
        this.clearCacheByPattern('bids_');
        return response;
    }

    async updateBid(bidId, bidData) {
        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.BIDS}/update/${bidId}`, {
            method: 'PUT',
            body: JSON.stringify(bidData)
        });
        
        // Clear relevant caches
        this.clearCacheByPattern('bid_');
        this.clearCacheByPattern('bids_');
        return response;
    }

    // Document Operations
    async getDocumentsByBid(bidId) {
        const cacheKey = `documents_${bidId}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.DOCUMENTS}/bid/${bidId}`);
        this.setCache(cacheKey, response);
        return response;
    }

    async updateDocumentStatus(documentId, status, userId) {
        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.DOCUMENTS}/status/${documentId}`, {
            method: 'PUT',
            body: JSON.stringify({ status, userId, timestamp: new Date().toISOString() })
        });
        
        // Clear document caches
        this.clearCacheByPattern('documents_');
        return response;
    }

    async uploadDocument(formData) {
        const response = await fetch(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.DOCUMENTS}/upload`, {
            method: 'POST',
            body: formData // Don't set Content-Type for FormData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        // Clear document caches
        this.clearCacheByPattern('documents_');
        return await response.json();
    }

    // User Operations
    async getUserAccess(userId) {
        const cacheKey = `user_access_${userId}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.USERS}/access/${userId}`);
        this.setCache(cacheKey, response);
        return response;
    }

    async getTeamMembers() {
        const cacheKey = 'team_members';
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.USERS}/team`);
        this.setCache(cacheKey, response);
        return response;
    }

    // Notification Operations
    async getNotifications(userId) {
        const response = await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.NOTIFICATIONS}/${userId}`);
        return response;
    }

    async markNotificationRead(notificationId) {
        return await this.apiCall(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.NOTIFICATIONS}/read/${notificationId}`, {
            method: 'PUT'
        });
    }

    // Template Operations
    async processTemplate(file) {
        const formData = new FormData();
        formData.append('template', file);

        const response = await fetch(`${TrackerConfig.API.BASE_URL}${TrackerConfig.API.TEMPLATES}/process`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Template processing failed: ${response.status}`);
        }

        return await response.json();
    }

    // Utility Methods
    clearCacheByPattern(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            }
        }
    }

    clearAllCache() {
        this.cache.clear();
        this.cacheTimestamps.clear();
    }
}

// Global instance
const trackerStorage = new TrackerStorage();