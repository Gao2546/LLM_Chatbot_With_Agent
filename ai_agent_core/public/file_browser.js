// File Browser Dialog with Search Functionality
let currentDirectory = '';
let selectedItemPath = '';

/**
 * Opens the file browser modal.
 * Creates the modal if it doesn't exist, then loads the root directory.
 */
function openFileBrowser() {
  const modal = document.getElementById('fileBrowserModal');
  if (!modal) {
    createFileBrowserModal();
  }

  // Start with the current working directory (root)
  loadDirectory('');
  document.getElementById('fileBrowserModal').style.display = 'flex';
}

/**
 * Dynamically creates the HTML and CSS for the file browser modal
 * and appends it to the document body.
 */
function createFileBrowserModal() {
  const modal = document.createElement('div');
  modal.id = 'fileBrowserModal';
  modal.className = 'file-browser-modal';
  modal.innerHTML = `
    <div class="file-browser-content">
      <div class="file-browser-header">
        <h3>Select Item</h3>
        <button class="close-button" onclick="closeFileBrowser()">&times;</button>
      </div>
      <div class="file-browser-path">
        <input type="text" id="currentPath" readonly>
      </div>
      <div class="file-browser-nav">
        <button id="parentDirBtn" onclick="navigateToParentDirectory()">..</button>
        <button id="homeDirBtn" onclick="navigateToHomeDirectory()">Home</button>
        <input type="text" id="searchBox" oninput="filterItems()" placeholder="Search current directory..." class="file-browser-search">
      </div>
      <div class="file-browser-list" id="fileList">
        </div>
      <div class="file-browser-footer">
        <button id="selectBtn" onclick="confirmSelection()" disabled>Select</button>
        <button onclick="closeFileBrowser()">Cancel</button>
      </div>
    </div>
  `;

  // Add styles for the modal
  const style = document.createElement('style');
  style.textContent = `
    .file-browser-modal {
      display: none; position: fixed; z-index: 1000;
      left: 0; top: 0; width: 100%; height: 100%;
      background-color: rgba(0,0,0,0.5);
      align-items: center; justify-content: center;
    }
    .file-browser-content {
      background-color: #2a2a2a; margin: auto; padding: 0;
      border: 1px solid #3a3a3a; width: 80%; max-width: 800px;
      height: 70%; max-height: 600px; border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      display: flex; flex-direction: column;
      backdrop-filter: blur(5px);
    }
    .file-browser-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 20px; background-color: #0a8276; color: white;
      border-radius: 8px 8px 0 0;
    }
    .file-browser-header h3 { margin: 0; font-weight: 600; }
    .close-button {
      background: none; border: none; font-size: 24px;
      cursor: pointer; color: white; transition: color 0.2s ease;
    }
    .close-button:hover { color: #e0e0e0; }
    .file-browser-path {
      padding: 10px 20px; background-color: #1e1e1e;
      border-bottom: 1px solid #3a3a3a;
    }
    .file-browser-path input {
      width: 100%; padding: 8px; border: 1px solid #4a4a4a;
      border-radius: 8px; background-color: #3c3c3c; color: #e0e0e0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .file-browser-path input:focus { outline: none; border-color: #0a8276; }
    .file-browser-nav { padding: 10px 20px; display: flex; align-items: center; gap: 10px; }
    .file-browser-nav button {
      padding: 8px 15px; background-color: #3c3c3c;
      border: 1px solid #4a4a4a; border-radius: 8px; cursor: pointer;
      color: #e0e0e0; transition: background-color 0.2s ease, transform 0.1s ease;
      flex-shrink: 0; /* Prevents buttons from shrinking */
    }
    .file-browser-nav button:hover { background-color: #4a4a4a; transform: scale(1.02); }
    .file-browser-nav button:active { transform: scale(0.98); }
    .file-browser-search {
        flex-grow: 1; /* Allows search box to fill available space */
        padding: 8px;
        border-radius: 8px;
        border: 1px solid #4a4a4a;
        background-color: #3c3c3c;
        color: #e0e0e0;
        font-family: inherit;
        font-size: 0.9em;
    }
    .file-browser-search:focus {
        outline: none;
        border-color: #0a8276;
    }
    .file-browser-list {
      flex-grow: 1; overflow-y: auto; padding: 10px 20px;
      background-color: #1e1e1e; scrollbar-width: thin;
      scrollbar-color: #555 #2a2a2a;
    }
    .file-browser-list::-webkit-scrollbar { width: 8px; }
    .file-browser-list::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 10px; }
    .file-browser-list::-webkit-scrollbar-thumb {
      background-color: #555; border-radius: 10px; border: 2px solid #2a2a2a;
    }
    .file-browser-list::-webkit-scrollbar-thumb:hover { background-color: #777; }
    .file-item {
      display: flex; align-items: center; padding: 10px;
      cursor: pointer; border-radius: 8px; margin-bottom: 5px;
      transition: background-color 0.2s ease, transform 0.1s ease;
    }
    .file-item:hover { background-color: #3a3a3a; transform: scale(1.01); }
    .file-item.selected { background-color: #0a8276; color: white; }
    .file-icon { margin-right: 10px; width: 20px; text-align: center; }
    .file-name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-size { margin-left: 10px; color: #b0b0b0; font-size: 0.9em; }
    .file-item.selected .file-size { color: rgba(255, 255, 255, 0.8); }
    .file-browser-footer {
      padding: 15px 20px; display: flex; justify-content: flex-end;
      gap: 10px; border-top: 1px solid #3a3a3a;
    }
    .file-browser-footer button {
      padding: 10px 20px; border: none; border-radius: 8px;
      cursor: pointer; font-weight: 600;
      transition: background-color 0.2s ease, transform 0.1s ease;
    }
    #selectBtn { background-color: #0a8276; color: white; }
    #selectBtn:hover { background-color: #005fa3; transform: scale(1.02); }
    #selectBtn:active { transform: scale(0.98); }
    #selectBtn:disabled { background-color: #555; cursor: not-allowed; transform: none; }
    .file-browser-footer button:not(#selectBtn) {
      background-color: #3c3c3c; color: #e0e0e0; border: 1px solid #4a4a4a;
    }
    .file-browser-footer button:not(#selectBtn):hover { background-color: #4a4a4a; transform: scale(1.02); }
    .file-browser-footer button:not(#selectBtn):active { transform: scale(0.98); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);
}

/**
 * Hides the file browser modal and resets the selected path.
 */
function closeFileBrowser() {
  document.getElementById('fileBrowserModal').style.display = 'none';
  selectedItemPath = '';
}

/**
 * Fetches and displays the contents of a specified directory.
 * @param {string} directory - The path of the directory to load.
 */
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
      document.getElementById('currentPath').value = currentDirectory;

      // Reset search box when navigating to a new directory
      const searchBox = document.getElementById('searchBox');
      if (searchBox) {
        searchBox.value = '';
      }

      const parentDirBtn = document.getElementById('parentDirBtn');
      parentDirBtn.disabled = (currentDirectory === dirData.parent_directory);

      const fileList = document.getElementById('fileList');
      fileList.innerHTML = ''; // Clear previous list

      dirData.items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      dirData.items.forEach(item => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
          <div class="file-icon">${item.isDirectory ? '📁' : '📄'}</div>
          <div class="file-name">${item.name}</div>
          <div class="file-size">${item.isDirectory ? '' : formatFileSize(item.size)}</div>
        `;

        fileItem.addEventListener('click', () => {
          selectItem(item.path, fileItem);
        });

        if (item.isDirectory) {
          fileItem.addEventListener('dblclick', () => loadDirectory(item.path));
          fileItem.title = `Double-click to open '${item.name}'`;
        } else {
          fileItem.title = `Select file '${item.name}'`;
        }

        fileList.appendChild(fileItem);
      });
    } else {
      console.error('Failed to load directory:', response.statusText);
      alert('Error: Could not load directory contents.');
    }
  } catch (error) {
    console.error('Error loading directory:', error);
    alert('An error occurred while trying to connect to the server.');
  }
}

/**
 * Filters the displayed items in the file list based on the search input.
 */
function filterItems() {
  const searchInput = document.getElementById('searchBox');
  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase();
  const items = document.querySelectorAll('#fileList .file-item');

  items.forEach(item => {
    const itemNameElement = item.querySelector('.file-name');
    if (itemNameElement) {
      const itemName = itemNameElement.textContent.toLowerCase();
      // Show item if its name includes the search term
      item.style.display = itemName.includes(searchTerm) ? 'flex' : 'none';
    }
  });
}

/**
 * Navigates to the parent directory of the current one.
 */
function navigateToParentDirectory() {
    let path = currentDirectory.replace(/\\/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        loadDirectory('');
        return;
    }
    
    if (lastSlashIndex === 0) {
        loadDirectory('/');
        return;
    }

    const parentDir = path.substring(0, lastSlashIndex);
    
    if (/^[a-zA-Z]:$/.test(parentDir)) {
        loadDirectory(parentDir + '/');
    } else {
        loadDirectory(parentDir);
    }
}

/**
 * Navigates to the user's home or root directory.
 */
function navigateToHomeDirectory() {
  loadDirectory('');
}

/**
 * Handles the visual selection of a file or folder in the list.
 * @param {string} itemPath - The full path of the selected item.
 * @param {HTMLElement} element - The DOM element that was clicked.
 */
function selectItem(itemPath, element) {
  document.querySelectorAll('.file-item.selected').forEach(item => {
    item.classList.remove('selected');
  });
  element.classList.add('selected');
  selectedItemPath = itemPath;
  document.getElementById('selectBtn').disabled = false;
}

/**
 * Confirms the selection and inserts the item's path into the target input field.
 */
function confirmSelection() {
  if (selectedItemPath) {
    const userInput = document.getElementById('userInput');
    if (!userInput) {
        console.error("Target input with id 'userInput' not found.");
        closeFileBrowser();
        return;
    }
    
    const cursorPos = userInput.selectionStart;
    const textBeforeCursor = userInput.value.substring(0, cursorPos);
    const textAfterCursor = userInput.value.substring(cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const newText = `${textBeforeCursor.substring(0, lastAtPos)}"${selectedItemPath}" ${textAfterCursor.trimStart()}`;
      userInput.value = newText;
      const newCursorPos = lastAtPos + selectedItemPath.length + 3;
      userInput.setSelectionRange(newCursorPos, newCursorPos);
      userInput.focus();
    }

    closeFileBrowser();
  }
}

/**
 * Converts a file size in bytes to a human-readable string (KB, MB, GB).
 * @param {number} bytes - The file size in bytes.
 * @returns {string} The formatted file size.
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Make functions globally accessible on the window object
window.openFileBrowser = openFileBrowser;
window.closeFileBrowser = closeFileBrowser;
window.navigateToParentDirectory = navigateToParentDirectory;
window.navigateToHomeDirectory = navigateToHomeDirectory;
window.confirmSelection = confirmSelection;
window.filterItems = filterItems; // Expose the new search function