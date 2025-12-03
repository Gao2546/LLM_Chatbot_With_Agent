// directoryBrowser.js
// Logic for the "Change Directory" Modal

let currentChangeDir = '';
let selectedDirectoryPath = '';

/**
 * Opens the Directory Browser Modal
 */
function openDirectoryBrowser() {
    let modal = document.getElementById('directoryBrowserModal');
    if (!modal) {
        createDirectoryBrowserModal();
        modal = document.getElementById('directoryBrowserModal');
    }
    
    // Load root or current working dir logic
    loadDirectoryForChange(''); 
    
    // Animation: Remove closing class, add active class
    modal.classList.remove('closing');
    modal.classList.add('active');
}

/**
 * Creates the HTML structure using the shared 'browser-overlay' styles
 */
function createDirectoryBrowserModal() {
    const modal = document.createElement('div');
    modal.id = 'directoryBrowserModal';
    modal.className = 'browser-overlay'; // Shared CSS class

    modal.innerHTML = `
        <div class="browser-modal">
            <div class="browser-header">
                <h3>Change Working Directory</h3>
                <button class="browser-close-btn" onclick="closeDirectoryBrowser()">&times;</button>
            </div>
            
            <div class="browser-nav">
                <button class="browser-btn-nav" id="parentDirBtn" onclick="navigateToParentDirectoryForChange()" title="Up one level">
                    <i class="fas fa-level-up-alt"></i>
                </button>
                <button class="browser-btn-nav" id="homeDirBtn" onclick="navigateToHomeDirectoryForChange()" title="Home">
                    <i class="fas fa-home"></i>
                </button>
                <input type="text" id="searchBox1" oninput="filterItemsForChange()" placeholder="Filter folders...">
            </div>

            <div class="browser-path-display">
                <input type="text" id="currentDirPath" readonly>
            </div>

            <div class="browser-list" id="dirFileList">
                <!-- Items injected here -->
            </div>

            <div class="browser-footer">
                <button class="browser-btn-secondary" onclick="closeDirectoryBrowser()">Cancel</button>
                <button class="browser-btn-primary" id="changeBtn" onclick="confirmDirectoryChange()" disabled>Set Directory</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * Closes the modal with a fade-out animation
 */
function closeDirectoryBrowser() {
    const modal = document.getElementById('directoryBrowserModal');
    if (modal) {
        modal.classList.add('closing');
        modal.classList.remove('active');
        // Wait for CSS animation (0.2s)
        setTimeout(() => {
            modal.classList.remove('closing');
            selectedDirectoryPath = '';
        }, 200); 
    }
}

/**
 * Fetches directory content
 */
async function loadDirectoryForChange(directory) {
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

            currentChangeDir = dirData.current_directory;
            const pathInput = document.getElementById('currentDirPath');
            if(pathInput) pathInput.value = currentChangeDir;

            // Reset search
            const searchBox = document.getElementById('searchBox1');
            if (searchBox) searchBox.value = '';

            // Handle Nav Buttons
            const parentBtn = document.getElementById('parentDirBtn');
            /* Check if parent is same as current (root) */
            // Note: simple check, might need OS specific tweaking
            if(parentBtn) parentBtn.disabled = (currentChangeDir === dirData.parent_directory);

            const fileList = document.getElementById('dirFileList');
            fileList.innerHTML = ''; 

            // Filter to show ONLY directories
            const directories = dirData.items.filter(item => item.isDirectory);
            directories.sort((a, b) => a.name.localeCompare(b.name));

            directories.forEach(item => {
                const fileItem = document.createElement('div');
                fileItem.className = 'browser-item'; // Shared CSS class

                // Directory Icon (Yellowish)
                const icon = '<i class="fas fa-folder browser-item-icon" style="color: #dbaa2d;"></i>';

                fileItem.innerHTML = `
                    ${icon}
                    <div class="browser-item-name">${item.name}</div>
                `;

                // Click to select
                fileItem.addEventListener('click', () => {
                    selectDirectoryForChange(item.path, fileItem);
                });

                // Double click to enter
                fileItem.addEventListener('dblclick', () => loadDirectoryForChange(item.path));

                fileList.appendChild(fileItem);
            });
            
            // Disable change button until a selection is made
            const changeBtn = document.getElementById('changeBtn');
            if(changeBtn) changeBtn.disabled = true;

        } else {
            console.error('Failed to load directory:', response.statusText);
        }
    } catch (error) {
        console.error('Error loading directory:', error);
    }
}

function selectDirectoryForChange(dirPath, element) {
    // Remove selected class from all items
    document.querySelectorAll('#dirFileList .browser-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    element.classList.add('selected');
    selectedDirectoryPath = dirPath;
    
    const changeBtn = document.getElementById('changeBtn');
    if(changeBtn) changeBtn.disabled = false;
}

function navigateToParentDirectoryForChange() {
    let path = currentChangeDir.replace(/\\/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) { loadDirectoryForChange(''); return; }
    if (lastSlashIndex === 0) { loadDirectoryForChange('/'); return; }

    const parentDir = path.substring(0, lastSlashIndex);
    loadDirectoryForChange(parentDir + (parentDir.endsWith(':') ? '/' : ''));
}

function navigateToHomeDirectoryForChange() {
    loadDirectoryForChange('');
}

function filterItemsForChange() {
    const searchInput = document.getElementById('searchBox1');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const items = document.querySelectorAll('#dirFileList .browser-item');

    items.forEach(item => {
        const name = item.querySelector('.browser-item-name').textContent.toLowerCase();
        item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
    });
}

async function confirmDirectoryChange() {
    if (selectedDirectoryPath) {
        try {
            const response = await fetch('http://localhost:3333/files/change_dir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    new_path: selectedDirectoryPath,
                }),
                mode: "cors",
                credentials: "include"
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const userInput = document.getElementById('userInput');
                if (userInput) {
                    const cursorPos = userInput.selectionStart;
                    const textBefore = userInput.value.substring(0, cursorPos);
                    const textAfter = userInput.value.substring(cursorPos);
                    userInput.value = userInput.value.substring(0, cursorPos - 1)
                }
                // Assuming displayMarkdownMessage is global in script.js
                if(typeof displayMarkdownMessage === 'function') {
                    displayMarkdownMessage(`**System:** Changed working directory to \`${selectedDirectoryPath}\``, 'agent-message');
                } else {
                    alert(`Directory changed to: ${selectedDirectoryPath}`);
                }
            } else {
                if(typeof displayMarkdownMessage === 'function') {
                    displayMarkdownMessage(`Error changing directory: ${data.error}`, 'agent-message error-message');
                }
            }
        } catch (error) {
            console.error('Error changing directory:', error);
        }
        closeDirectoryBrowser();
    }
}

// Export functions to global scope
window.openDirectoryBrowser = openDirectoryBrowser;
window.closeDirectoryBrowser = closeDirectoryBrowser;
window.navigateToParentDirectoryForChange = navigateToParentDirectoryForChange;
window.navigateToHomeDirectoryForChange = navigateToHomeDirectoryForChange;
window.confirmDirectoryChange = confirmDirectoryChange;
window.filterItemsForChange = filterItemsForChange;
window.selectDirectoryForChange = selectDirectoryForChange;