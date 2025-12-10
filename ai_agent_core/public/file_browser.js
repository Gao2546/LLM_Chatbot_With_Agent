// File Browser & Directory Browser Logic
let currentDirectory = '';
let selectedItemPath = '';

/** ------------------------------------------------------------------
 *  FILE BROWSER FUNCTIONS
 *  ------------------------------------------------------------------ */

function openFileBrowser() {
    let modal = document.getElementById('fileBrowserModal');
    if (!modal) {
        createFileBrowserModal();
        modal = document.getElementById('fileBrowserModal');
    }
    loadDirectory(''); // Load root
    
    // Reset state
    modal.classList.remove('closing');
    modal.classList.add('active'); // Triggers FadeIn
}

function createFileBrowserModal() {
    const modal = document.createElement('div');
    modal.id = 'fileBrowserModal';
    modal.className = 'browser-overlay'; // Unified class
    
    // Note: No inline styles created here. All handled by CSS classes.
    modal.innerHTML = `
        <div class="browser-modal">
            <div class="browser-header">
                <h3>Select File</h3>
                <button class="browser-close-btn" onclick="closeFileBrowser()">&times;</button>
            </div>
            
            <div class="browser-nav">
                <button class="browser-btn-nav" id="parentDirBtn" onclick="navigateToParentDirectory()"><i class="fas fa-level-up-alt"></i></button>
                <button class="browser-btn-nav" id="homeDirBtn" onclick="navigateToHomeDirectory()"><i class="fas fa-home"></i></button>
                <input type="text" id="searchBox" oninput="filterItems()" placeholder="Search files...">
            </div>

            <div class="browser-path-display">
                 <input type="text" id="currentPath" readonly>
            </div>

            <div class="browser-list" id="fileList">
                <!-- Items injected here -->
            </div>

            <div class="browser-footer">
                <button class="browser-btn-secondary" onclick="closeFileBrowser()">Cancel</button>
                <button class="browser-btn-primary" id="selectBtn" onclick="confirmSelection()" disabled>Select</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeFileBrowser() {
    const modal = document.getElementById('fileBrowserModal');
    if (modal) {
        // Add closing class to trigger fade out animation
        modal.classList.add('closing');
        modal.classList.remove('active');
        
        // Wait for animation (0.2s) before setting display none
        setTimeout(() => {
            modal.classList.remove('closing');
        }, 200); // Match CSS animation duration
    }
    selectedItemPath = '';
}

/** ------------------------------------------------------------------
 *  DIRECTORY BROWSER FUNCTIONS
 *  ------------------------------------------------------------------ */

function createDirectoryBrowserModal() {
    const modal = document.createElement('div');
    modal.id = 'directoryBrowserModal';
    modal.className = 'browser-overlay'; // Reusing unified class

    modal.innerHTML = `
        <div class="browser-modal">
            <div class="browser-header">
                <h3>Change Directory</h3>
                <button class="browser-close-btn" onclick="closeDirectoryBrowser()">&times;</button>
            </div>
            
            <div class="browser-nav">
                <button class="browser-btn-nav" id="parentDirBtn" onclick="navigateToParentDirectoryForChange()"><i class="fas fa-level-up-alt"></i></button>
                <button class="browser-btn-nav" id="homeDirBtn" onclick="navigateToHomeDirectoryForChange()"><i class="fas fa-home"></i></button>
                <input type="text" id="searchBox1" oninput="filterItemsForChange()" placeholder="Search folders...">
            </div>

            <div class="browser-path-display">
                <input type="text" id="currentDirPath" readonly>
            </div>

            <div class="browser-list" id="dirFileList">
                <!-- Items injected here -->
            </div>

            <div class="browser-footer">
                <button class="browser-btn-secondary" onclick="closeDirectoryBrowser()">Cancel</button>
                <button class="browser-btn-primary" id="changeBtn" onclick="confirmDirectoryChange()" disabled>Change Here</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openDirectoryBrowser() {
    // Assuming you have a function calling this
    let modal = document.getElementById('directoryBrowserModal');
    if (!modal) {
        createDirectoryBrowserModal();
        modal = document.getElementById('directoryBrowserModal');
    }
    // Load initial directory logic here...
    
    modal.classList.remove('closing');
    modal.classList.add('active');
}

function closeDirectoryBrowser() {
    const modal = document.getElementById('directoryBrowserModal');
    if (modal) {
        modal.classList.add('closing');
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.remove('closing');
        }, 200);
    }
}


/** ------------------------------------------------------------------
 *  SHARED / HELPER FUNCTIONS
 *  ------------------------------------------------------------------ */

async function loadDirectory(directory) {
    try {
        const response = await fetch('http://localhost:3333/files/browse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory: directory }),
            mode: "cors",
            credentials: "include"
        });

        if (response.ok) {
            const data = await response.json();
            const content = data.content[0];
            const dirData = JSON.parse(content.text);

            currentDirectory = dirData.current_directory;
            
            const pathInput = document.getElementById('currentPath');
            if(pathInput) pathInput.value = currentDirectory;

            // Reset search
            const searchBox = document.getElementById('searchBox');
            if (searchBox) searchBox.value = '';

            // Handle Buttons
            const parentBtn = document.getElementById('parentDirBtn');
            if(parentBtn) parentBtn.disabled = (currentDirectory === dirData.parent_directory);

            const fileList = document.getElementById('fileList');
            if(fileList) {
                fileList.innerHTML = '';
                
                // Sort folders first
                dirData.items.sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

                dirData.items.forEach(item => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'browser-item'; // New class
                    
                    const icon = item.isDirectory ? '<i class="fas fa-folder browser-item-icon" style="color: #dbaa2d;"></i>' : '<i class="fas fa-file-alt browser-item-icon" style="color: #a0a0a0;"></i>';
                    
                    fileItem.innerHTML = `
                        ${icon}
                        <div class="browser-item-name">${item.name}</div>
                        <div class="browser-item-size">${item.isDirectory ? '' : formatFileSize(item.size)}</div>
                    `;

                    fileItem.addEventListener('click', () => {
                        selectItem(item.path, fileItem);
                    });

                    if (item.isDirectory) {
                        fileItem.addEventListener('dblclick', () => loadDirectory(item.path));
                    }
                    fileList.appendChild(fileItem);
                });
            }

        } else {
            console.error('Failed to load directory');
        }
    } catch (error) {
        console.error('Error loading directory:', error);
    }
}

function selectItem(itemPath, element) {
    // Remove selected class from all items
    document.querySelectorAll('.browser-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add to clicked
    element.classList.add('selected');
    selectedItemPath = itemPath;
    
    const selectBtn = document.getElementById('selectBtn');
    if(selectBtn) selectBtn.disabled = false;
}

function confirmSelection() {
    if (selectedItemPath) {
        const userInput = document.getElementById('userInput');

        if (userInput) {
            // 1. Get the current cursor/selection position
            const cursorPos = userInput.selectionStart;

            // 2. Extract the text parts
            const textBefore = userInput.value.substring(0, cursorPos);
            const textAfter = userInput.value.substring(cursorPos); // Simpler way to get the rest of the string

            // 3. Define the text to be inserted, including surrounding quotes and spaces
            const textToInsert = ` "${selectedItemPath}" `;

            // 4. Construct the new value
            userInput.value = textBefore + textToInsert + textAfter;

            // 5. CRITICAL UPDATE: Set the new cursor position
            // The new position is the original position + the length of the inserted string
            const newCursorPos = cursorPos + textToInsert.length;
            
            // Set the cursor position (both start and end for non-selection)
            userInput.selectionStart = newCursorPos;
            userInput.selectionEnd = newCursorPos;

            // Give focus back to the input field, which helps with certain browsers/OSes
            userInput.focus();
        }
        closeFileBrowser();
    }
}

function filterItems() {
    const searchInput = document.getElementById('searchBox');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const items = document.querySelectorAll('#fileList .browser-item');

    items.forEach(item => {
        const name = item.querySelector('.browser-item-name').textContent.toLowerCase();
        item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function navigateToParentDirectory() {
    let path = currentDirectory.replace(/\\/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) { loadDirectory(''); return; }
    if (lastSlashIndex === 0) { loadDirectory('/'); return; }

    const parentDir = path.substring(0, lastSlashIndex);
    loadDirectory(parentDir + (parentDir.endsWith(':') ? '/' : ''));
}

function navigateToHomeDirectory() {
    loadDirectory('');
}

// Global Exports
window.openFileBrowser = openFileBrowser;
window.closeFileBrowser = closeFileBrowser;
window.createDirectoryBrowserModal = createDirectoryBrowserModal;
window.closeDirectoryBrowser = closeDirectoryBrowser;
window.navigateToParentDirectory = navigateToParentDirectory;
window.navigateToHomeDirectory = navigateToHomeDirectory;
window.confirmSelection = confirmSelection;
window.filterItems = filterItems;