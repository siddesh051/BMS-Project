// Bid Data Structure and Validation
// Path: /bid-tracker/bid-data-structure.js

class BidDataStructure {
    
    // Create empty bid structure
    static createEmptyBid() {
        return {
            id: this.generateBidId(),
            name: '',
            clientName: '',
            description: '',
            deadline: null,
            createdBy: '',
            createdDate: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            status: 'draft',
            teamMembers: [],
            approvalList: [],
            bidTypeDocuments: [],
            notifications: [],
            progress: {
                totalDocuments: 0,
                submittedDocuments: 0,
                approvedDocuments: 0,
                pendingDocuments: 0,
                rejectedDocuments: 0
            }
        };
    }

    // Generate unique bid ID
    static generateBidId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `BID_${timestamp}_${random}`.toUpperCase();
    }

    // Create bid type document structure
    static createBidTypeDocument(name, priority = 1) {
        return {
            id: this.generateId(),
            name: name,
            priority: priority,
            categories: []
        };
    }

    // Create category structure
    static createCategory(name, bidTypeId) {
        return {
            id: this.generateId(),
            name: name,
            bidTypeId: bidTypeId,
            fields: [],
            createdDate: new Date().toISOString()
        };
    }

    // Create field structure
    static createField(name, categoryId, fieldType = 'document', required = false) {
        return {
            id: this.generateId(),
            name: name,
            categoryId: categoryId,
            fieldType: fieldType, // document, text, number, date, dropdown
            required: required,
            assignedTo: '',
            status: 'not_started',
            documents: [],
            notes: '',
            createdDate: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
    }

    // Create document structure
    static createDocument(fieldId, fileName, filePath, uploadedBy) {
        return {
            id: this.generateId(),
            fieldId: fieldId,
            fileName: fileName,
            filePath: filePath,
            uploadedBy: uploadedBy,
            uploadDate: new Date().toISOString(),
            status: 'submitted',
            version: 1,
            comments: [],
            approvals: []
        };
    }

    // Create notification structure
    static createNotification(type, title, message, targetUserId, bidId = null) {
        return {
            id: this.generateId(),
            type: type,
            title: title,
            message: message,
            targetUserId: targetUserId,
            bidId: bidId,
            read: false,
            priority: 'medium',
            createdDate: new Date().toISOString()
        };
    }

    // Create team member assignment
    static createTeamMemberAssignment(userId, role = 'member') {
        return {
            userId: userId,
            role: role,
            assignedDate: new Date().toISOString(),
            permissions: this.getDefaultPermissions(role)
        };
    }

    // Get default permissions based on role
    static getDefaultPermissions(role) {
        const permissions = {
            member: ['view', 'upload', 'comment'],
            lead: ['view', 'upload', 'comment', 'assign', 'review'],
            manager: ['view', 'upload', 'comment', 'assign', 'review', 'approve', 'edit'],
            admin: ['all']
        };
        return permissions[role] || permissions.member;
    }

    // Generate generic ID
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    // Validation Methods
    static validateBid(bidData) {
        const errors = [];
        
        if (!bidData.name || bidData.name.trim() === '') {
            errors.push('Bid name is required');
        }
        
        if (!bidData.deadline) {
            errors.push('Deadline is required');
        } else {
            const deadlineDate = new Date(bidData.deadline);
            if (deadlineDate <= new Date()) {
                errors.push('Deadline must be in the future');
            }
        }
        
        if (!bidData.teamMembers || bidData.teamMembers.length === 0) {
            errors.push('At least one team member is required');
        }
        
        if (!bidData.approvalList || bidData.approvalList.length === 0) {
            errors.push('At least one approver is required');
        }
        
        return errors;
    }

    static validateBidTypeDocument(bidTypeDoc) {
        const errors = [];
        
        if (!bidTypeDoc.name || bidTypeDoc.name.trim() === '') {
            errors.push('Bid type document name is required');
        }
        
        if (!bidTypeDoc.priority || bidTypeDoc.priority < 1) {
            errors.push('Priority must be a positive number');
        }
        
        return errors;
    }

    static validateCategory(category) {
        const errors = [];
        
        if (!category.name || category.name.trim() === '') {
            errors.push('Category name is required');
        }
        
        return errors;
    }

    static validateField(field) {
        const errors = [];
        
        if (!field.name || field.name.trim() === '') {
            errors.push('Field name is required');
        }
        
        const validFieldTypes = ['document', 'text', 'number', 'date', 'dropdown'];
        if (!validFieldTypes.includes(field.fieldType)) {
            errors.push('Invalid field type');
        }
        
        return errors;
    }

    // Progress Calculation
    static calculateBidProgress(bid) {
        let totalDocuments = 0;
        let submittedDocuments = 0;
        let approvedDocuments = 0;
        let pendingDocuments = 0;
        let rejectedDocuments = 0;

        bid.bidTypeDocuments.forEach(bidType => {
            bidType.categories.forEach(category => {
                category.fields.forEach(field => {
                    if (field.fieldType === 'document') {
                        totalDocuments++;
                        
                        switch (field.status) {
                            case 'submitted':
                            case 'under_review':
                                submittedDocuments++;
                                pendingDocuments++;
                                break;
                            case 'approved':
                                submittedDocuments++;
                                approvedDocuments++;
                                break;
                            case 'rejected':
                            case 'revision_required':
                                submittedDocuments++;
                                rejectedDocuments++;
                                break;
                        }
                    }
                });
            });
        });

        return {
            totalDocuments,
            submittedDocuments,
            approvedDocuments,
            pendingDocuments,
            rejectedDocuments,
            completionPercentage: totalDocuments > 0 ? Math.round((approvedDocuments / totalDocuments) * 100) : 0
        };
    }

    // Utility Methods
    static findFieldById(bid, fieldId) {
        for (const bidType of bid.bidTypeDocuments) {
            for (const category of bidType.categories) {
                const field = category.fields.find(f => f.id === fieldId);
                if (field) return field;
            }
        }
        return null;
    }

    static findCategoryById(bid, categoryId) {
        for (const bidType of bid.bidTypeDocuments) {
            const category = bidType.categories.find(c => c.id === categoryId);
            if (category) return category;
        }
        return null;
    }

    static findBidTypeById(bid, bidTypeId) {
        return bid.bidTypeDocuments.find(bt => bt.id === bidTypeId);
    }

    // Update progress in bid
    static updateBidProgress(bid) {
        bid.progress = this.calculateBidProgress(bid);
        bid.lastModified = new Date().toISOString();
        return bid;
    }
}