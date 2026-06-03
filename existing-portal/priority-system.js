console.log('Priority system script starting...');
class PrioritySystemExtension {
    constructor() {
        this.priorityData = {
            folderNames: {},
            priorities: {},
            sheetPriorities: {}
        };
        this.currentPriorityTab = 'H';
        this.workbookData = null;
        this.isInitialized = false;
        console.log('Priority System Extension created');
    }
    init(workbook) {
        if (this.isInitialized) {
            console.log('Priority system already initialized');
            return;
        }
        console.log('Initializing Priority System Extension...');
        this.workbookData = workbook;
        try {
            this.addPrioritySection();
            this.processPrioritySystem();
            this.setupPriorityListeners();
            this.isInitialized = true;
            console.log('Priority System Extension initialized successfully');
        } catch (error) {
            console.error('Priority System initialization error:', error);
        }
    }
    addPrioritySection() {
        if (document.getElementById('priorityMainTab')) {
            console.log('Priority section already exists');
            return;
        }
        console.log('Adding priority section to portal...');
        const priorityMainTab = document.createElement('button');
        priorityMainTab.id = 'priorityMainTab';
        priorityMainTab.className = 'filter-btn priority-main-tab';
        priorityMainTab.innerHTML = '<i class="fas fa-sort-numeric-down"></i> Priority System';
        priorityMainTab.addEventListener('click', () => this.togglePrioritySection());
        const filterContainer = document.getElementById('filterButtons');
        if (filterContainer) {
            filterContainer.appendChild(priorityMainTab);
            console.log('Priority button added to filter container');
        } else {
            console.error('Filter container not found');
            return;
        }
        const prioritySection = document.createElement('div');
        prioritySection.id = 'prioritySystemSection';
        prioritySection.className = 'priority-system-section';
        prioritySection.style.display = 'none';
        prioritySection.innerHTML = `
            <div class="priority-section-header">
                <h2><i class="fas fa-sort-numeric-down"></i> Priority-Based File Organization</h2>
                <p>Files organized by H, I, J column priorities with conflict resolution</p>
                <div class="priority-section-header-actions">
                    <button class="upload-btn" onclick="window.prioritySystem.showUploadModal('all')" title="Upload all files to folders">
                        <i class="fas fa-upload"></i> Upload All Files
                    </button>
                </div>
            </div>
            <div class="priority-tabs" id="priorityTabs"></div>
            <div id="priorityContent"></div>
        `;
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.appendChild(prioritySection);
            console.log('Priority section added to main content');
        } else {
            console.error('Main content container not found');
        }
    }
    togglePrioritySection() {
        console.log('Toggling priority section...');
        const prioritySection = document.getElementById('prioritySystemSection');
        const priorityTab = document.getElementById('priorityMainTab');
        if (!prioritySection || !priorityTab) {
            console.error('Priority section or tab not found');
            return;
        }
        const isVisible = prioritySection.style.display !== 'none';
        if (isVisible) {
            prioritySection.style.display = 'none';
            priorityTab.classList.remove('active');
            console.log('Priority section hidden');
        } else {
            prioritySection.style.display = 'block';
            priorityTab.classList.add('active');
            console.log('Priority section shown');
            if (!document.querySelector('.priority-tab')) {
                console.log('Creating priority interface...');
                this.createPriorityInterface();
            }
        }
    }
    processPrioritySystem() {
        if (!this.workbookData) {
            console.error('No workbook data available for priority system');
            return;
        }
        console.log('Processing priority system data...');
        console.log('Available sheets:', Object.keys(this.workbookData.Sheets));
        const firstSheetName = Object.keys(this.workbookData.Sheets).find(name => name.toLowerCase() !== 'priority');
        if (firstSheetName) {
            const firstSheet = this.workbookData.Sheets[firstSheetName];
            this.extractFolderNames(firstSheet);
        } else {
            console.warn('No non-priority sheet found');
        }
        this.processPrioritySheet();
        this.processPriorityData();
        console.log('Priority system data processed successfully');
    }
    extractFolderNames(sheet) {
        const folderCells = ['H3', 'I3', 'J3'];
        const columns = ['H', 'I', 'J'];
        console.log('Extracting folder names from cells:', folderCells);
        folderCells.forEach((cell, index) => {
            const cellData = sheet[cell];
            if (cellData && cellData.v) {
                const folderName = this.cleanFolderName(cellData.v.toString());
                this.priorityData.folderNames[columns[index]] = folderName;
                console.log(`${cell} = "${folderName}"`);
            } else {
                this.priorityData.folderNames[columns[index]] = `Column ${columns[index]} Files`;
                console.log(`${cell} is empty, using default name`);
            }
        });
        console.log('Folder names extracted:', this.priorityData.folderNames);
    }
    processPrioritySheet() {
        if (!this.workbookData.Sheets['Priority']) {
            console.log('No Priority sheet found - using default sheet priorities');
            return;
        }
        console.log('Processing Priority sheet...');
        const prioritySheet = this.workbookData.Sheets['Priority'];
        const rows = XLSX.utils.sheet_to_json(prioritySheet, { header: 1, defval: "" });
        
        // Skip header row if it contains "SheetName" and "Priority"
        let startRow = 0;
        if (rows.length > 0 && rows[0].length >= 2) {
            const firstRowA = rows[0][0] ? rows[0][0].toString().trim().toLowerCase() : "";
            const firstRowB = rows[0][1] ? rows[0][1].toString().trim().toLowerCase() : "";
            if (firstRowA.includes('sheet') || firstRowB.includes('priority')) {
                startRow = 1;
                console.log('Header row detected, skipping row 1');
            }
        }        
        rows.forEach((row, index) => {
            if (index < startRow) return; // Skip header row
            
            if (row.length >= 2 && row[0] && row[1]) {
                const sheetName = row[0].toString().trim();
                const priority = parseFloat(row[1]);
                if (!isNaN(priority) && this.workbookData.Sheets[sheetName]) {
                    this.priorityData.sheetPriorities[sheetName] = priority;
                    console.log(`Sheet "${sheetName}" priority: ${priority}`);
                }
            }
        });
        console.log('Sheet priorities loaded:', this.priorityData.sheetPriorities);
    }

    // Replace the existing processPriorityData method sorting section with this:

    processPriorityData() {
        const columns = ['H', 'I', 'J'];
        const colIndexes = { H: 7, I: 8, J: 9 };
        const filePathIndex = 10;
        console.log('Processing priority data with NEW sorting logic...');
        
        columns.forEach(column => {
            this.priorityData.priorities[column] = [];
        });

        Object.entries(this.workbookData.Sheets).forEach(([sheetName, sheet]) => {
            if (sheetName.toLowerCase() === 'priority') return;
            console.log(`Processing sheet: ${sheetName}`);
            
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            const sheetPriority = this.priorityData.sheetPriorities[sheetName] || 999;
            let rowCount = 0;
            
            for (let rowIndex = 3; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                
                columns.forEach(column => {
                    const colIndex = colIndexes[column];
                    const priorityValue = row[colIndex];
                    const colK = row[10] ? row[10].toString().trim() : "";
                    
                    if (priorityValue && colK) {
                        const priorityNum = this.convertPriorityToNumber(priorityValue);
                        if (priorityNum !== null) {
                            this.priorityData.priorities[column].push({
                                priority: priorityNum,
                                originalPriority: priorityValue.toString(),                                
                                filePath: colK,
                                fileName: this.extractFileName(colK),
                                sheet: sheetName,
                                sheetPriority: sheetPriority,
                                excelRow: rowIndex + 1
                            });
                            rowCount++;
                        }
                    }
                });
            }
            console.log(`Sheet ${sheetName}: ${rowCount} valid entries`);
        });

        // NEW SORTING AND DEDUPLICATION LOGIC
        columns.forEach(column => {
            const originalCount = this.priorityData.priorities[column].length;
            
            // Step 1: Sort by individual priority number FIRST
            this.priorityData.priorities[column].sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;  // Primary: individual priority
                }
                return a.sheetPriority - b.sheetPriority;  // Secondary: sheet priority for same priorities
            });
            
            // Step 2: Remove duplicate filenames (keep first occurrence)
            const seen = new Set();
            this.priorityData.priorities[column] = this.priorityData.priorities[column].filter(item => {
                if (seen.has(item.fileName)) {
                    console.log(`Removing duplicate filename: ${item.fileName} from ${item.sheet}`);
                    return false;
                }
                seen.add(item.fileName);
                return true;
            });
            
            const finalCount = this.priorityData.priorities[column].length;
            console.log(`Column ${column}: ${originalCount} entries, ${finalCount} after deduplication`);
        });
        
        console.log('Priority data processing complete with NEW logic');
    }
    debugCompareWithQGPortal() {
        console.log('=== COMPARING WITH QG PORTAL ===');
        
        // Simulate QG Portal parsing on the same data
        Object.entries(this.workbookData.Sheets).forEach(([sheetName, sheet]) => {
            if (sheetName.toLowerCase() === 'priority') return;            
            console.log(`QG Portal simulation for sheet: ${sheetName}`);
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });            
            let currentSubHeader = null;            
            rows.forEach((row, index) => {
                const colA = row[0] ? row[0].toString().trim() : "";
                const colB = row[1] ? row[1].toString().trim() : "";                
                if (!colA && colB) {
                    currentSubHeader = colB;
                    console.log(`  QG Portal Sub-header: "${currentSubHeader}"`);
                } else if (colA && colB && currentSubHeader) {
                    const colK = row[10] ? row[10].toString().trim() : "";
                    console.log(`  QG Portal Row ${index + 1}: "${colB}" -> "${colK}"`);
                }
            });
        });
        console.log('=== END COMPARISON ===');
    }
    convertPriorityToNumber(priorityValue) {
        try {
            const priorityStr = priorityValue.toString().trim().toLowerCase();
            if (priorityStr.includes('.') && priorityStr.length > 0) {
                const parts = priorityStr.split('.');
                if (parts.length === 2) {
                    const baseNum = parseFloat(parts[0]);
                    const suffix = parts[1];
                    if (!isNaN(baseNum) && suffix.match(/^[a-z]$/)) {
                        const letterValue = suffix.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
                        const decimalValue = letterValue / 10.0;
                        return baseNum + decimalValue;
                    }
                }
            }
            const num = parseFloat(priorityStr);
            return isNaN(num) ? null : num;
        } catch (error) {
            return null;
        }
    }
    sortAndDeduplicatePriorities(priorities) {
    // Step 1: Sort by sheet priority, then individual priority
    priorities.sort((a, b) => {
        if (a.sheetPriority !== b.sheetPriority) {
            return a.sheetPriority - b.sheetPriority;
        }
        return a.priority - b.priority;
    });
    const seen = new Set();
    return priorities.filter(item => {
        if (seen.has(item.fileName)) {
            return false; // Remove duplicate filename
        }
        seen.add(item.fileName);
        return true; // Keep first occurrence
    });
}
    extractFileName(filePath) {

        return filePath.split(/[/\\]/).pop() || filePath;

    }
    cleanFolderName(folderName) {
        if (!folderName) return "";
        let cleanName = folderName.toString();
        cleanName = cleanName.replace(/\s+/g, ' ');
        cleanName = cleanName.replace(/[<>:"|?*\\/]/g, '_');
        return cleanName.trim();
    }
    createPriorityInterface() {
        const priorityTabs = document.getElementById('priorityTabs');
        const priorityContent = document.getElementById('priorityContent');
        if (!priorityTabs || !priorityContent) {
            console.error('Priority tabs or content container not found');
            return;
        }
        console.log('Creating priority interface...');
        priorityTabs.innerHTML = '';
        priorityContent.innerHTML = '';
        const columns = ['H', 'I', 'J'];
        columns.forEach((column, index) => {
            const fileCount = this.priorityData.priorities[column].length;
            console.log(`Creating tab for column ${column} with ${fileCount} files`);
            const tab = document.createElement('button');
            tab.className = `priority-tab ${index === 0 ? 'active' : ''}`;
            tab.dataset.column = column;
            tab.innerHTML = `
                <i class="fas fa-folder"></i>
                ${this.priorityData.folderNames[column]}
                <span class="document-count">${fileCount}</span>
            `;
            tab.addEventListener('click', () => this.switchPriorityTab(column));
            priorityTabs.appendChild(tab);
            const content = document.createElement('div');
            content.className = `priority-content ${index === 0 ? 'active' : ''}`;
            content.id = `priority-${column}`;
            content.innerHTML = `
                <div class="priority-header">
                    <h3>${this.priorityData.folderNames[column]}</h3>
                    <div class="priority-stats">
                        <span><i class="fas fa-file"></i> ${fileCount} files</span>
                        <span><i class="fas fa-sort-numeric-down"></i> Column ${column} priorities</span>
                        ${fileCount > 0 ? `
                            <span class="download-all-container">
                                <button class="download-all-btn" onclick="window.prioritySystem.downloadAllFiles('${column}')" title="Download all files in priority order">
                                    <i class="fas fa-download"></i> Download All (${fileCount})
                                </button>
                            </span>
                            <span class="upload-container">
                                <button class="upload-btn secondary" onclick="window.prioritySystem.showUploadModal('${column}')" title="Upload files to specified folder">
                                    <i class="fas fa-upload"></i> Upload Files (${fileCount})
                                </button>
                            </span>
                        ` : ''}
                    </div>
                </div>
                <div class="priority-list" id="priority-list-${column}">
                    ${this.generatePriorityList(column)}
                </div>
            `;
            priorityContent.appendChild(content);
        });
        console.log('Priority interface created successfully');
    }
    generatePriorityList(column) {
        const priorities = this.priorityData.priorities[column];
        if (priorities.length === 0) {
            return '<div class="no-results">No priority files found for this column.</div>';
        }
        // Build HTML with safe IDs (no inline onclick)
        const html = priorities.map((item, index) => {
            const safeIdView = `view-btn-${column}-${index}`;
            const safeIdDownload = `download-btn-${column}-${index}`;
            return `
                <div class="priority-item">
                    <div class="priority-number">${item.originalPriority}</div>
                    <div class="priority-file-info">
                        <div class="priority-file-name">${item.fileName}</div>
                        <div class="priority-file-path" title="${item.filePath}">
                            <i class="fas fa-file"></i>
                            <small>${item.filePath.length > 60 ? '...' + item.filePath.slice(-60) : item.filePath}</small>
                        </div>
                    </div>
                    <div class="priority-sheet-info">${item.sheet}</div>
                    <div class="priority-actions">
                        <button id="${safeIdView}" class="action-btn view-btn">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button id="${safeIdDownload}" class="action-btn download-btn">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        // Attach event listeners AFTER DOM insertion
        setTimeout(() => {
            priorities.forEach((item, index) => {
                const viewBtn = document.getElementById(`view-btn-${column}-${index}`);
                const downloadBtn = document.getElementById(`download-btn-${column}-${index}`);

                if (viewBtn) {
                    viewBtn.addEventListener("click", () => this.viewFile(item.filePath, item.fileName));
                }
                if (downloadBtn) {
                    downloadBtn.addEventListener("click", () => this.downloadFile(item.filePath, item.fileName));
                }
            });
        }, 0);
        return html;
    }
    switchPriorityTab(column) {
        console.log(`Switching to priority tab: ${column}`);
        document.querySelectorAll('.priority-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.column === column);
        });
        document.querySelectorAll('.priority-content').forEach(content => {
            content.classList.toggle('active', content.id === `priority-${column}`);
        });
        this.currentPriorityTab = column;
    }
    showUploadModal(columnOrAll) {
        console.log(`Showing upload modal for: ${columnOrAll}`);
        let files = [];
        let modalTitle = '';
        let modalDescription = '';
        if (columnOrAll === 'all') {
            const columns = ['H', 'I', 'J'];
            columns.forEach(column => {
                const columnFiles = this.priorityData.priorities[column].map(item => ({
                    ...item,
                    column: column,
                    folderName: this.priorityData.folderNames[column]
                }));
                files = files.concat(columnFiles);
            });
            modalTitle = 'Upload All Priority Files';
            modalDescription = 'Select a network location to organize all files into separate folders by priority category';
        } else {
            files = this.priorityData.priorities[columnOrAll].map(item => ({
                ...item,
                column: columnOrAll,
                folderName: this.priorityData.folderNames[columnOrAll]
            }));
            modalTitle = `Upload ${this.priorityData.folderNames[columnOrAll]} Files`;
            modalDescription = `Select a network location to transfer all files from ${this.priorityData.folderNames[columnOrAll]} in priority order`;
        }
        if (files.length === 0) {
            this.showUploadStatus('No files found to upload', 'warning');
            return;
        }
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'upload-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="upload-modal">
                <button class="close-modal" onclick="this.closest('.upload-modal-overlay').remove()">×</button>
                <div class="upload-modal-header">
                    <h3>${modalTitle}</h3>
                    <p>${modalDescription}</p>
                </div>
                <div class="upload-form-group">
                    <label for="uploadLocation">📁 Network Destination Path:</label>
                    <input type="text" id="uploadLocation" class="upload-location-input" 
                           placeholder="Enter network path (e.g., \\\\server\\share\\folder or Z:\\folder)" 
                           value="">
                    <button class="upload-browse-btn" onclick="window.prioritySystem.browseForFolder()">
                        <i class="fas fa-folder-open"></i> Browse
                    </button>
                </div>
                <div class="upload-form-group">
                    <label>📄 Files to Upload (${files.length} total):</label>
                    <div class="upload-file-list">
                        ${this.generateUploadFileList(files, columnOrAll)}
                    </div>
                </div>
                <div class="upload-modal-actions">
                    <button class="upload-modal-btn secondary" onclick="this.closest('.upload-modal-overlay').remove()">
                        Cancel
                    </button>
                    <button class="upload-modal-btn primary" onclick="window.prioritySystem.startUpload('${columnOrAll}', this.closest('.upload-modal'))">
                        <i class="fas fa-upload"></i> Start Network Transfer
                    </button>
                </div>
            </div>
        `;
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
        document.body.appendChild(modalOverlay);
        setTimeout(() => {
            const locationInput = document.getElementById('uploadLocation');
            if (locationInput) {
                locationInput.focus();
            }
        }, 100);
    }
    generateUploadFileList(files, columnOrAll) {
        if (columnOrAll === 'all') {
            const groupedFiles = {};
            files.forEach(file => {
                if (!groupedFiles[file.column]) {
                    groupedFiles[file.column] = [];
                }
                groupedFiles[file.column].push(file);
            });
            let html = '';
            Object.entries(groupedFiles).forEach(([column, columnFiles]) => {
                html += `
                    <div style="font-weight: 600; color: #667eea; margin: 0.5rem 0; padding: 0.3rem; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
                        📁 ${this.priorityData.folderNames[column]} (${columnFiles.length} files)
                    </div>
                `;
                columnFiles.slice(0, 3).forEach(file => {
                    html += `
                        <div class="upload-file-item">
                            <i class="fas fa-file"></i>
                            <span>${file.originalPriority}. ${file.fileName}</span>
                        </div>
                    `;
                });
                if (columnFiles.length > 3) {
                    html += `
                        <div class="upload-file-item" style="opacity: 0.7; font-style: italic;">
                            <i class="fas fa-ellipsis-h"></i>
                            <span>... and ${columnFiles.length - 3} more files</span>
                        </div>
                    `;
                }
            });
            return html;
        } else {
            let html = '';
            files.slice(0, 5).forEach(file => {
                html += `
                    <div class="upload-file-item">
                        <i class="fas fa-file"></i>
                        <span>${file.originalPriority}. ${file.fileName}</span>
                    </div>
                `;
            });
            if (files.length > 5) {
                html += `
                    <div class="upload-file-item" style="opacity: 0.7; font-style: italic;">
                        <i class="fas fa-ellipsis-h"></i>
                        <span>... and ${files.length - 5} more files</span>
                    </div>
                `;
            }
            return html;
        }
    }
    browseForFolder() {
        const currentPath = document.getElementById('uploadLocation').value;
        const newPath = prompt('Enter the full network path to your destination folder:', currentPath || '\\\\server\\share\\folder');
        if (newPath && newPath.trim()) {
            document.getElementById('uploadLocation').value = newPath.trim();
        }
    }
    async startUpload(columnOrAll, modalElement) {
        const locationInput = document.getElementById('uploadLocation');
        const uploadLocation = locationInput ? locationInput.value.trim() : '';
        if (!uploadLocation) {
            this.showUploadStatus('Please specify a destination network path', 'error');
            return;
        }
        if (!this.isValidNetworkPath(uploadLocation)) {
            this.showUploadStatus('Please enter a valid network path (e.g., \\\\server\\share\\folder or Z:\\folder)', 'error');
            return;
        }
        console.log(`Starting network upload for ${columnOrAll} to: ${uploadLocation}`);
        modalElement.closest('.upload-modal-overlay').remove();
        let files = [];
        if (columnOrAll === 'all') {
            const columns = ['H', 'I', 'J'];
            columns.forEach(column => {
                const columnFiles = this.priorityData.priorities[column].map(item => ({
                    ...item,
                    column: column,
                    folderName: this.priorityData.folderNames[column],
                    destinationPath: this.buildNetworkPath(uploadLocation, this.priorityData.folderNames[column])
                }));
                files = files.concat(columnFiles);
            });
        } else {
            files = this.priorityData.priorities[columnOrAll].map(item => ({
                ...item,
                column: columnOrAll,
                folderName: this.priorityData.folderNames[columnOrAll],
                destinationPath: this.buildNetworkPath(uploadLocation, this.priorityData.folderNames[columnOrAll])
            }));
        }
        if (files.length === 0) {
            this.showUploadStatus('No files found to upload', 'warning');
            return;
        }
        this.showUploadStatus(`Starting network transfer of ${files.length} files to ${uploadLocation}...`, 'info');
        const progressTracker = this.createUploadProgressTracker(columnOrAll, files.length);
        let successCount = 0;
        let errorCount = 0;
        const totalFiles = files.length;
        const failedFiles = [];
        try {
            const filesByFolder = {};
            files.forEach(file => {
                if (!filesByFolder[file.destinationPath]) {
                    filesByFolder[file.destinationPath] = [];
                }
                filesByFolder[file.destinationPath].push(file);
            });
            let currentFileIndex = 0;
            for (const [folderPath, folderFiles] of Object.entries(filesByFolder)) {
                console.log(`Processing network folder: ${folderPath} with ${folderFiles.length} files`);
                // folderFiles.sort((a, b) => a.priority - b.priority);
                folderFiles.sort((a, b) => {
                            if (a.sheetPriority !== b.sheetPriority) {
                                return a.sheetPriority - b.sheetPriority;
                            }
                            return a.priority - b.priority;
                        });




                try {
                    await this.createNetworkFolder(folderPath);
                } catch (error) {
                    console.warn(`Could not create folder ${folderPath}:`, error);
                }
                for (let i = 0; i < folderFiles.length; i++) {
                    const file = folderFiles[i];
                    currentFileIndex++;
                    try {
                        this.updateUploadProgress(progressTracker, currentFileIndex, totalFiles, file.fileName, folderPath);
                        const baseTime = new Date().getTime();
                        const fileTimestamp = baseTime + (currentFileIndex * 1000);
                        console.log(`Network transfer ${currentFileIndex}/${totalFiles}: ${file.fileName} to ${folderPath}`);
                        await this.uploadFileToLocation(file.filePath, file.fileName, folderPath, fileTimestamp);
                        successCount++;
                        await this.delay(500);
                    } catch (error) {
                        console.error(`Error uploading file ${file.fileName}:`, error);
                        errorCount++;
                        failedFiles.push({ file: file.fileName, error: error.message });
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error('Network upload process error:', error);
            errorCount = totalFiles - successCount;
        }
        this.removeUploadProgressTracker(progressTracker);
        if (errorCount === 0) {
            this.showUploadStatus(`✅ Successfully transferred all ${successCount} files to network location: ${uploadLocation}`, 'success');
        } else if (successCount > 0) {
            const failedList = failedFiles.slice(0, 3).map(f => f.file).join(', ');
            const moreFailures = failedFiles.length > 3 ? ` and ${failedFiles.length - 3} more` : '';
            this.showUploadStatus(`⚠️ Transferred ${successCount} files, ${errorCount} failed${failedFiles.length > 0 ? ` (${failedList}${moreFailures})` : ''} to ${uploadLocation}`, 'warning');
        } else {
            this.showUploadStatus(`❌ Network transfer failed for all files to ${uploadLocation}. Check network path and permissions.`, 'error');
        }
        console.log(`Network upload completed: ${successCount} success, ${errorCount} errors`);
    }
    async uploadFileToLocation(filePath, fileName, destinationPath, timestamp) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`Uploading: ${fileName}`);
                console.log(`Source: ${filePath}`);
                console.log(`Destination: ${destinationPath}`);
                const response = await fetch('/api/upload-to-network', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                    sourcePath: filePath,
                    fileName: fileName,
                    destinationPath: destinationPath,
                    timestamp: timestamp,
                    priority: true,
                    bidId: this.getCurrentBidId()  // << ensure server nests under this bid
                    })

                });
                if (!response.ok) {
                    const errorData = await response.json();
                    let errorMessage = errorData.message || `Server error: ${response.status}`;
                    if (errorMessage.includes('Access denied') || errorMessage.includes('not allowed')) {
                        errorMessage = `Access denied: File path not in allowed locations. Check server configuration.`;
                    } else if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
                        errorMessage = `Source file not found or inaccessible: ${filePath}`;
                    } else if (errorMessage.includes('Permission denied') || errorMessage.includes('EACCES')) {
                        errorMessage = `Permission denied: Check file and folder permissions`;
                    }
                    throw new Error(errorMessage);
                }
                const result = await response.json();
                console.log(`Upload successful: ${fileName} -> ${result.finalPath}`);
                resolve(result);
            } catch (error) {
                console.error(`Upload failed for ${fileName}:`, error);
                reject(error);
            }
        });
    }
    isValidNetworkPath(path) {
        const uncPattern = /^\\\\[^\\]+\\[^\\]+/;
        const smbPattern = /^smb:\/\/[^\/]+\/[^\/]+/;
        const localNetworkPattern = /^[A-Z]:\\/;
        return uncPattern.test(path) || smbPattern.test(path) || localNetworkPattern.test(path);
    }
    buildNetworkPath(basePath, folderName) {
        // Don't clean again - folderName was already cleaned when extracted from H3/I3/J3
        if (basePath.startsWith('\\\\')) {
            return `${basePath.replace(/\\+$/, '')}\\${folderName}`;
            
        } else if (basePath.startsWith('smb://')) {
            return `${basePath.replace(/\/+$/, '')}/${folderName}`;
        } else {
            return `${basePath.replace(/[\\\/]+$/, '')}\\${folderName}`;
        }
        
    }
    createUploadProgressTracker(columnOrAll, totalFiles) {
        const tracker = document.createElement('div');
        tracker.className = 'upload-progress-tracker';
        const title = columnOrAll === 'all' ? 'All Priority Files' : this.priorityData.folderNames[columnOrAll];
        tracker.innerHTML = `
            <div class="upload-progress-header">
                <i class="fas fa-upload"></i>
                <span>Uploading ${title}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="close-upload-progress">×</button>
            </div>
            <div class="upload-progress-bar">
                <div class="upload-progress-fill" style="width: 0%"></div>
            </div>
            <div class="upload-progress-info">
                <span class="upload-progress-text">Preparing upload...</span>
                <span class="upload-progress-count">0 / ${totalFiles}</span>
            </div>
        `;
        document.body.appendChild(tracker);
        return tracker;
    }
    updateUploadProgress(tracker, current, total, fileName, destinationPath) {
        const progressFill = tracker.querySelector('.upload-progress-fill');
        const progressText = tracker.querySelector('.upload-progress-text');
        const progressCount = tracker.querySelector('.upload-progress-count');
        const percentage = (current / total) * 100;
        progressFill.style.width = `${percentage}%`;
        const folderName = destinationPath.split('\\').pop();
        progressText.textContent = `Uploading to ${folderName}: ${fileName}`;
        progressCount.textContent = `${current} / ${total}`;
    }
    removeUploadProgressTracker(tracker) {
        setTimeout(() => {
            if (tracker && tracker.parentElement) {
                tracker.remove();
            }
        }, 3000);
    }
    showUploadStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `upload-status ${type}`;
        statusDiv.innerHTML = `
            <div class="upload-status-message">${message}</div>
            <button onclick="this.parentElement.remove()" class="close-upload-status">×</button>
        `;
        document.body.appendChild(statusDiv);
        const autoRemoveDelay = type === 'success' ? 6000 : type === 'warning' ? 8000 : 4000;
        setTimeout(() => {
            if (statusDiv.parentElement) {
                statusDiv.remove();
            }
        }, autoRemoveDelay);
    }
    viewFile(filePath, fileName) {
        console.log(`Viewing file: ${fileName}`);
        console.log(`Path: ${filePath}`);
        if (window.app && window.app.viewFile) {
            window.app.viewFile(filePath, fileName);
        } else {
            console.log('Using fallback view method');
            const viewUrl = `${window.location.origin}/view?path=${encodeURIComponent(filePath)}`;
            window.open(viewUrl, '_blank', 'noopener,noreferrer');
        }
    }
    downloadFile(filePath, fileName) {
        console.log(`Downloading file: ${fileName}`);
        console.log(`Path: ${filePath}`);
        if (window.app && window.app.downloadFile) {
            window.app.downloadFile(filePath, fileName);
        } else {
            console.log('Using fallback download method');
            const downloadUrl = `${window.location.origin}/download?path=${encodeURIComponent(filePath)}`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName || 'document';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    async downloadAllFiles(column) {
        const priorities = this.priorityData.priorities[column];
        if (!priorities || priorities.length === 0) {
            console.log(`No files to download for column ${column}`);
            this.showDownloadAllStatus('No files found to download', 'warning');
            return;
        }
        
        console.log(`Starting zip download for column ${column} with ${priorities.length} files`);
        this.showDownloadAllStatus(`Creating zip file with ${priorities.length} files from ${this.priorityData.folderNames[column]}...`, 'info');
        
        const progressTracker = this.createDownloadProgressTracker(column, priorities.length);
        
        try {
            this.updateDownloadProgress(progressTracker, 0, priorities.length, 'Preparing zip file...');
            
            const zipFileName = `${this.priorityData.folderNames[column]}_Priority_Files.zip`;
            
            const response = await fetch('/api/create-priority-zip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    files: priorities.map(item => ({
                        filePath: item.filePath,
                        fileName: item.fileName,
                        priority: item.originalPriority,
                        sheet: item.sheet
                    })),
                    zipFileName: zipFileName,
                    folderName: this.priorityData.folderNames[column]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            this.updateDownloadProgress(progressTracker, priorities.length, priorities.length, 'Downloading zip file...');
            
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = zipFileName;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            window.URL.revokeObjectURL(downloadUrl);
            
            this.removeDownloadProgressTracker(progressTracker);
            this.showDownloadAllStatus(`✅ Successfully downloaded ${priorities.length} files as ${zipFileName}`, 'success');
            
            console.log(`Zip download completed: ${zipFileName}`);
            
        } catch (error) {
            console.error('Error creating zip download:', error);
            this.removeDownloadProgressTracker(progressTracker);
            this.showDownloadAllStatus(`❌ Failed to create zip file: ${error.message}`, 'error');
        }
    }
    async downloadFileWithTimestamp(filePath, fileName, timestamp) {
        return new Promise((resolve, reject) => {
            try {
                const downloadUrl = `${window.location.origin}/download?path=${encodeURIComponent(filePath)}`;
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = fileName || 'document';
                link.style.display = 'none';
                link.dataset.timestamp = timestamp;
                link.addEventListener('click', () => {
                    console.log(`Download initiated: ${fileName}`);
                });
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => {
                    resolve();
                }, 500);
            } catch (error) {
                reject(error);
            }
        });
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getCurrentBidId() {
                    try {
                        const qs = new URLSearchParams(window.location.search);
                        return qs.get('id') || qs.get('bid') || (window.state?.bidId) || '';
                    } catch { return ''; }
}
    createDownloadProgressTracker(column, totalFiles) {
        const tracker = document.createElement('div');
        tracker.className = 'download-progress-tracker';
        tracker.innerHTML = `
            <div class="download-progress-header">
                <i class="fas fa-download"></i>
                <span>Downloading ${this.priorityData.folderNames[column]} Files</span>
                <button onclick="this.parentElement.parentElement.remove()" class="close-progress">×</button>
            </div>
            <div class="download-progress-bar">
                <div class="download-progress-fill" style="width: 0%"></div>
            </div>
            <div class="download-progress-info">
                <span class="download-progress-text">Preparing download...</span>
                <span class="download-progress-count">0 / ${totalFiles}</span>
            </div>
        `;
        document.body.appendChild(tracker);
        return tracker;
    }
    updateDownloadProgress(tracker, current, total, fileName) {
        const progressFill = tracker.querySelector('.download-progress-fill');
        const progressText = tracker.querySelector('.download-progress-text');
        const progressCount = tracker.querySelector('.download-progress-count');
        const percentage = (current / total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `Downloading: ${fileName}`;
        progressCount.textContent = `${current} / ${total}`;
    }
    removeDownloadProgressTracker(tracker) {
        setTimeout(() => {
            if (tracker && tracker.parentElement) {
                tracker.remove();
            }
        }, 3000);
    }
    showDownloadAllStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `download-all-status download-all-${type}`;
        statusDiv.innerHTML = `
            <div class="download-all-message">${message}</div>
            <button onclick="this.parentElement.remove()" class="close-download-status">×</button>
        `;
        document.body.appendChild(statusDiv);
        const autoRemoveDelay = type === 'success' ? 5000 : type === 'warning' ? 8000 : 4000;
        setTimeout(() => {
            if (statusDiv.parentElement) {
                statusDiv.remove();
            }
        }, autoRemoveDelay);
    }
    setupPriorityListeners() {
        console.log('Priority system event listeners setup complete');
    }
}
console.log('Creating priority system instance...');
window.prioritySystem = new PrioritySystemExtension();
console.log('Priority system instance created and available globally');