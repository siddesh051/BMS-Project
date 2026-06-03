// Bid Tracker Configuration
// Path: /bid-tracker/tracker-config.js

const TrackerConfig = {
    // API Endpoints
    API: {
        BASE_URL: '/api/bid-tracker',
        BIDS: '/bids',
        DOCUMENTS: '/documents',
        NOTIFICATIONS: '/notifications',
        USERS: '/users',
        TEMPLATES: '/templates'
    },

    // File Upload Settings
    UPLOAD: {
        MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
        CHUNK_SIZE: 1024 * 1024, // 1MB chunks
        TIMEOUT: 30000, // 30 seconds
        RETRY_ATTEMPTS: 3
    },

    // UI Settings
    UI: {
        ITEMS_PER_PAGE: 20,
        NOTIFICATION_TIMEOUT: 5000,
        AUTO_SAVE_INTERVAL: 30000, // 30 seconds
        SEARCH_DEBOUNCE: 300
    },

    // Cache Settings
    CACHE: {
        DURATION: 5 * 60 * 1000, // 5 minutes
        MAX_ENTRIES: 100
    },

    // Date/Time Settings
    DATETIME: {
        FORMAT: 'YYYY-MM-DD HH:mm:ss',
        DATE_FORMAT: 'YYYY-MM-DD',
        TIME_FORMAT: 'HH:mm'
    }
};