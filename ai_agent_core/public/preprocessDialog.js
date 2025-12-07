
// // preprocessDialog.js
// // Function to create and show the preprocess file dialog modal

// function showPreprocessDialog() {
//     // 1. Create Overlay
//     const overlay = document.createElement('div');
//     overlay.className = 'pp-overlay'; // Uses CSS class for styling

//     // 2. Create Dialog Container
//     const dialog = document.createElement('div');
//     dialog.className = 'pp-dialog';

//     // --- LEFT SIDEBAR ---
//     const leftSidebar = document.createElement('div');
//     leftSidebar.className = 'pp-sidebar';

//     // New Document Button
//     const newDocBtn = document.createElement('button');
//     newDocBtn.textContent = '+ New Document';
//     newDocBtn.className = 'pp-btn pp-btn-primary';
//     newDocBtn.onclick = () => {
//         // Clear inputs logic here
//         const inputs = document.querySelectorAll('.pp-input, .pp-textarea');
//         inputs.forEach(input => input.value = '');
        
//         // Remove active class from list items
//         document.querySelectorAll('.pp-doc-item').forEach(item => item.classList.remove('active'));
//     };
//     leftSidebar.appendChild(newDocBtn);

//     // List Heading
//     const listHeading = document.createElement('h3');
//     listHeading.textContent = 'Documents';
//     listHeading.className = 'pp-header';
//     listHeading.style.marginTop = '20px'; // Slight manual adjustment
//     leftSidebar.appendChild(listHeading);

//     // Document List Container
//     const docList = document.createElement('div');
//     docList.className = 'pp-doc-list';

//     // Placeholder documents
//     const documents = ['document1.txt', 'document2.pdf', 'document3.jpg', 'notes_2024.md'];
//     documents.forEach(doc => {
//         const docItem = document.createElement('div');
//         docItem.textContent = doc;
//         docItem.className = 'pp-doc-item';
        
//         docItem.onclick = (e) => {
//             // Handle selection styling
//             if (e.target.classList.contains('active')){
//                 e.target.classList.remove('active');
//             }

//             // document.querySelectorAll('.pp-doc-item').forEach(item => item.classList.remove('active'));
//             else{
//                 e.target.classList.add('active');
//             }
            
//             // Logic to load document data would go here
//             console.log(`Selected: ${doc}`);
//         };
//         docList.appendChild(docItem);
//     });
//     leftSidebar.appendChild(docList);


//     // --- RIGHT PANEL ---
//     const rightPanel = document.createElement('div');
//     rightPanel.className = 'pp-main-panel';

//     // Section A: Input Source
//     const inputSection = document.createElement('div');
//     inputSection.className = 'pp-section';

//     // File Upload Group
//     const fileLabel = document.createElement('label');
//     fileLabel.textContent = 'Source File';
//     fileLabel.className = 'pp-label';
//     inputSection.appendChild(fileLabel);

//     const fileUploadDiv = document.createElement('div');
//     fileUploadDiv.className = 'pp-upload-group';

//     const uploadBtn = document.createElement('button');
//     uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Choose File'; // Added icon placeholder
//     uploadBtn.className = 'pp-btn pp-btn-upload';
    
//     const fileInput = document.createElement('input');
//     fileInput.type = 'file';
//     fileInput.style.display = 'none';
    
//     // File Name Display Input
//     const fileNameInput = document.createElement('input');
//     fileNameInput.type = 'text';
//     fileNameInput.placeholder = 'No file selected';
//     fileNameInput.className = 'pp-input';
//     fileNameInput.readOnly = true;

//     // Events
//     uploadBtn.onclick = () => fileInput.click();
//     fileInput.onchange = (e) => {
//         const file = e.target.files[0];
//         if (file) {
//             fileNameInput.value = file.name;
//             // Auto-fill the output filename if empty
//             const outputName = document.getElementById('pp-output-name');
//             if(outputName && !outputName.value) {
//                 outputName.value = file.name;
//             }
//         }
//     };

//     fileUploadDiv.appendChild(uploadBtn);
//     fileUploadDiv.appendChild(fileNameInput);
//     inputSection.appendChild(fileUploadDiv);

//     // OR Separator
//     const orText = document.createElement('div');
//     orText.className = 'pp-separator';
//     orText.textContent = 'OR PASTE TEXT';
//     inputSection.appendChild(orText);

//     // Text Area
//     const textArea = document.createElement('textarea');
//     textArea.className = 'pp-textarea';
//     textArea.placeholder = 'Paste your text content here...';
//     textArea.style.height = '120px';
//     textArea.style.resize = 'vertical';
//     inputSection.appendChild(textArea);

//     rightPanel.appendChild(inputSection);

//     // Section B: Configuration
//     const configSection = document.createElement('div');
//     configSection.className = 'pp-section';
    
//     const configLabel = document.createElement('label');
//     configLabel.textContent = 'Encoding Method';
//     configLabel.className = 'pp-label';
    
//     const dropdown = document.createElement('select');
//     dropdown.className = 'pp-select';
    
//     const option1 = document.createElement('option');
//     option1.value = 'image';
//     option1.textContent = 'Encoding Image';
//     const option2 = document.createElement('option');
//     option2.value = 'text';
//     option2.textContent = 'Extract Text & Encode';
    
//     dropdown.appendChild(option1);
//     dropdown.appendChild(option2);
    
//     configSection.appendChild(configLabel);
//     configSection.appendChild(dropdown);
//     rightPanel.appendChild(configSection);

//     // Section C: Output Settings
//     const outputSection = document.createElement('div');
//     outputSection.className = 'pp-section';
    
//     const outputLabel = document.createElement('label');
//     outputLabel.textContent = 'Output Filename';
//     outputLabel.className = 'pp-label';
    
//     const outputInput = document.createElement('input');
//     outputInput.id = 'pp-output-name'; // ID for auto-fill referencing
//     outputInput.type = 'text';
//     outputInput.className = 'pp-input';
//     outputInput.placeholder = 'Default (Original file name)';
    
//     outputSection.appendChild(outputLabel);
//     outputSection.appendChild(outputInput);
//     rightPanel.appendChild(outputSection);

//     // Section D: Action Buttons
//     const actionDiv = document.createElement('div');
//     actionDiv.className = 'pp-actions';

//     const cancelBtn = document.createElement('button');
//     cancelBtn.textContent = 'Cancel';
//     cancelBtn.className = 'pp-btn pp-btn-secondary';
//     cancelBtn.onclick = () => {
//         // Animation for closing
//         dialog.style.transform = 'scale(0.95)';
//         overlay.style.opacity = '0';
//         setTimeout(() => {
//             if(document.body.contains(overlay)) {
//                 document.body.removeChild(overlay);
//             }
//         }, 200);
//     };

//     const processBtn = document.createElement('button');
//     processBtn.textContent = 'Process Document';
//     processBtn.className = 'pp-btn pp-btn-success';
//     processBtn.onclick = () => {
//         // Visual feedback
//         processBtn.textContent = 'Processing...';
//         processBtn.style.opacity = '0.8';
        
//         // Emulate API call
//         setTimeout(() => {
//             alert('Processing started!');
//             processBtn.textContent = 'Process Document';
//             processBtn.style.opacity = '1';
//         }, 500);
//     };

//     actionDiv.appendChild(cancelBtn);
//     actionDiv.appendChild(processBtn);
//     rightPanel.appendChild(actionDiv);

//     // Assemble Dialog
//     dialog.appendChild(leftSidebar);
//     dialog.appendChild(rightPanel);
//     overlay.appendChild(dialog);
    
//     // Close on click outside (optional)
//     overlay.onclick = (e) => {
//         if (e.target === overlay) cancelBtn.click();
//     };

//     document.body.appendChild(overlay);
// }

// window.showPreprocessDialog = showPreprocessDialog;



// preprocessDialog.js
// Function to create and show the preprocess file dialog modal

async function showPreprocessDialog() {
    // 1. Create Overlay
    const overlay = document.createElement('div');
    overlay.className = 'pp-overlay';

    // 2. Create Dialog Container
    const dialog = document.createElement('div');
    dialog.className = 'pp-dialog';

    // --- LEFT SIDEBAR ---
    const leftSidebar = document.createElement('div');
    leftSidebar.className = 'pp-sidebar';

    // New Document Button
    const newDocBtn = document.createElement('button');
    newDocBtn.textContent = '+ New Document';
    newDocBtn.className = 'pp-btn pp-btn-primary';
    newDocBtn.onclick = () => {
        textArea.disabled = false;
        dropdown.disabled = false;
        const inputs = document.querySelectorAll('.pp-input, .pp-textarea');
        inputs.forEach(input => input.value = '');
        // Remove active class from all items
        document.querySelectorAll('.pp-doc-item').forEach(item => item.classList.remove('active'));
        const preview = document.getElementById('pp-preview-view');
        const form = document.getElementById('pp-form-view');
        if(preview && form) {
            preview.style.display = 'none';
            form.style.display = 'block';
        }
    };
    leftSidebar.appendChild(newDocBtn);

    // List Heading
    const listHeading = document.createElement('h3');
    listHeading.textContent = 'Documents';
    listHeading.className = 'pp-header';
    listHeading.style.marginTop = '20px';
    leftSidebar.appendChild(listHeading);

    // Selection All files button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.className = 'pp-btn pp-btn-secondary';
    selectAllBtn.onclick = () => {
    selectAllBtn.classList.toggle('active');
    const shouldBeActive = selectAllBtn.classList.contains('active');

    document.querySelectorAll('.pp-doc-item').forEach(item => {
        const isItemActive = item.classList.contains('active');

        // Only click the item if its state needs to change
        if (shouldBeActive && !isItemActive) {
            item.click(); // Turn ON
        } else if (!shouldBeActive && isItemActive) {
            item.click(); // Turn OFF
        }
    });
};
    leftSidebar.appendChild(selectAllBtn);

    // Document List Container
    const docList = document.createElement('div');
    docList.className = 'pp-doc-list';
    leftSidebar.appendChild(docList); 

    // --- RIGHT PANEL CONTAINER ---
    const rightPanel = document.createElement('div');
    rightPanel.className = 'pp-main-panel';
    rightPanel.style.position = 'relative'; 
    rightPanel.style.overflow = 'hidden';

    // CONTAINER 1: FORM VIEW
    const mainFormView = document.createElement('div');
    mainFormView.id = 'pp-form-view';
    mainFormView.style.height = '100%';
    mainFormView.style.overflowY = 'auto'; 
    
    // CONTAINER 2: PREVIEW VIEW
    const previewView = document.createElement('div');
    previewView.id = 'pp-preview-view';
    previewView.style.display = 'none';
    previewView.style.height = '100%';
    previewView.style.flexDirection = 'column';

    // =========================================================
    // ⭐ NEW: STATE MANAGEMENT
    // =========================================================
    let currentUserId = null;

    // Helper to get current user ID from session
    const getCurrentUser = async () => {
        try {
            // Using /reload-page as it returns session info including userId
            const response = await fetch('/api/get_current_user'); 
            if (response.ok) {
                const data = await response.json();
                currentUserId = data.userId;
                console.log("Current User ID:", currentUserId);
            }
        } catch (e) {
            console.error("Failed to fetch user session", e);
        }
    };

    // =========================================================
    // ⭐ UPDATED: DOCUMENT LIST LOGIC
    // =========================================================
    
    const fetchAndRenderDocuments = async () => {
        docList.innerHTML = '<div style="padding:10px; color:#888; text-align:center; font-size:12px;">Loading files...</div>';
        
        try {
            // 1. Ensure we have the user ID first
            if (!currentUserId) await getCurrentUser();
            if (!currentUserId) {
                docList.innerHTML = '<div style="padding:10px; color:#666; font-style:italic; font-size:12px;">User not logged in.</div>';
                return;
            }

            // 2. Fetch files
            const response = await fetch('/api/chat/-1/files'); 
            
            if (!response.ok) throw new Error("Failed to load files");
            
            const files = await response.json();
            docList.innerHTML = ''; // Clear loading message

            if (files.length === 0) {
                docList.innerHTML = '<div style="padding:10px; color:#666; font-style:italic; font-size:12px;">No documents found.</div>';
                return;
            }

            files.forEach((fileObj) => {
                const fileName = fileObj.file_name || fileObj.name || "Unknown File";
                const fileId = fileObj.id;
                const objectName = fileObj.object_name;
                // Check if current user is in the active_users array
                const activeUsers = fileObj.active_users || [];
                const isActiveByMe = currentUserId && activeUsers.includes(currentUserId);

                // Create Item Container
                const docItem = document.createElement('div');
                docItem.className = 'pp-doc-item';
                // Apply active class immediately if user is in the list
                if (isActiveByMe) {
                    docItem.classList.add('active');
                }
                
                docItem.id = `doc-item-${fileId}`; 
                docItem.style.userSelect = 'none';      
                
                // 1. Icon
                const icon = getIconForFile(fileName);
                const iconSpan = document.createElement('span');
                iconSpan.innerHTML = icon;
                iconSpan.style.marginRight = '8px';
                iconSpan.style.color = '#b0b0b0';
                
                // 2. Name
                const docName = document.createElement('span');
                docName.textContent = fileName;
                docName.style.pointerEvents = 'none';
                docName.style.flexGrow = '1';
                docName.style.overflow = 'hidden';
                docName.style.textOverflow = 'ellipsis';
                docName.style.whiteSpace = 'nowrap';
                
                // 3. Active Indicator (Visual Feedback)
                const statusSpan = document.createElement('span');
                statusSpan.className = 'pp-doc-status'; 
                
                // 4. Delete Button
                const delBtn = document.createElement('span');
                delBtn.innerHTML = '&times;';
                delBtn.className = 'pp-doc-delete';
                delBtn.title = 'Remove Document';
                
                // ... Delete Logic (Same as before) ...
                delBtn.onclick = async (e) => {
                    e.stopPropagation(); 
                    if(confirm(`Are you sure you want to delete "${fileName}"?`)) {
                        docItem.style.opacity = '0.5';
                        try {
                            const delRes = await fetch(`/api/file/${fileId}`, { method: 'DELETE' });
                            if(delRes.ok) {
                                docItem.style.transform = 'translateX(-20px)';
                                docItem.style.opacity = '0';
                                setTimeout(() => {
                                    if (docItem.parentNode) docItem.parentNode.removeChild(docItem);
                                    // Handle preview closing if needed...
                                    fetchAndRenderDocuments();
                                }, 200);
                            } else {
                                alert("Failed to delete file on server.");
                                docItem.style.opacity = '1';
                            }
                        } catch (err) {
                            console.error("Delete error:", err);
                            docItem.style.opacity = '1';
                        }
                    }
                };

                docItem.appendChild(iconSpan);
                docItem.appendChild(docName);
                docItem.appendChild(statusSpan); 
                docItem.appendChild(delBtn);
                
                // ⭐ CLICK HANDLER: Toggle Active Status via API
                docItem.onclick = async () => {
                    if (!currentUserId) {
                        alert("Session error: Cannot identify user.");
                        return;
                    }

                    // Determine intended action based on current UI state
                    const isCurrentlyActive = docItem.classList.contains('active');
                    const method = isCurrentlyActive ? 'DELETE' : 'POST';
                    
                    // Optimistic UI feedback (optional, or wait for server)
                    statusSpan.classList.add('pp-loading'); 

                    try {
                        const res = await fetch(`/api/file/${fileId}/active`, {
                            method: method,
                            headers: { 'Content-Type': 'application/json' },
                            // body: JSON.stringify({ userId: currentUserId }) // Optional if session handles it
                        });

                        if (res.ok) {
                            const data = await res.json();
                            // Update UI based on the array returned from server
                            if (data.active_users.includes(currentUserId)) {
                                docItem.classList.add('active');
                            } else {
                                docItem.classList.remove('active');
                            }
                        } else {
                            console.error("Failed to toggle status");
                        }
                    } catch (error) {
                        console.error("API Error:", error);
                    } finally {
                        statusSpan.classList.remove('pp-loading');
                    }
                };

                docItem.ondblclick = () => {
                    // Pass the objectName to the preview function
                    handleFilePreview(fileName, objectName, previewView, mainFormView);
                };

                docList.appendChild(docItem);
            });

        } catch (error) {
            console.error("Error fetching docs:", error);
            docList.innerHTML = '<div style="padding:10px; color:#ff6b6b; font-size:12px;">Error loading list.</div>';
        }
    };

    // Initial Load
    fetchAndRenderDocuments();

    // =========================================================
    // FORM CONSTRUCTION (Standard)
    // =========================================================

    const inputSection = document.createElement('div');
    inputSection.className = 'pp-section';

    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'Source File';
    fileLabel.className = 'pp-label';
    inputSection.appendChild(fileLabel);

    const fileUploadDiv = document.createElement('div');
    fileUploadDiv.className = 'pp-upload-group';

    const uploadBtn = document.createElement('button');
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Choose File'; 
    uploadBtn.className = 'pp-btn pp-btn-upload';
    
    const fileInput = document.createElement('input');
    fileInput.id = "inputDocumentFile"
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    
    const fileNameInput = document.createElement('input');
    fileNameInput.type = 'text';
    fileNameInput.placeholder = 'No file selected';
    fileNameInput.className = 'pp-input';
    fileNameInput.readOnly = true;
    
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        textArea.disabled = true;
        textArea.value = ''; 
        const file = e.target.files[0];
        if (file) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (['pdf', 'jpg', 'png', 'jpeg', ''].includes(ext)){
                dropdown.disabled = false;
            }
            else {
                dropdown.value = 'text';
                dropdown.disabled = true;
            }
            fileNameInput.value = file.name;
            const outputName = document.getElementById('pp-output-name');
            if(outputName) {
                outputName.value = file.name;
            }
        }
    };

    fileUploadDiv.appendChild(uploadBtn);
    fileUploadDiv.appendChild(fileNameInput);
    fileUploadDiv.appendChild(fileInput); 
    inputSection.appendChild(fileUploadDiv);

    const orText = document.createElement('div');
    orText.className = 'pp-separator';
    orText.textContent = 'OR PASTE TEXT';
    inputSection.appendChild(orText);

    const textArea = document.createElement('textarea');
    textArea.className = 'pp-textarea';
    textArea.placeholder = 'Paste your text content here...';
    textArea.style.height = '120px';
    textArea.style.resize = 'none';

    textArea.onkeyup = textArea.onkeydown = () => {
        if (textArea.value != ''){
            dropdown.value = 'text'
            dropdown.disabled = true;
        }
        else {
            dropdown.disabled = false;
        }
    }
    inputSection.appendChild(textArea);
    mainFormView.appendChild(inputSection);

    // Section B: Configuration
    const configSection = document.createElement('div');
    configSection.className = 'pp-section';
    
    const configLabel = document.createElement('label');
    configLabel.textContent = 'Encoding Method';
    configLabel.className = 'pp-label';
    
    const dropdown = document.createElement('select');
    dropdown.className = 'pp-select';
    
    const option1 = document.createElement('option');
    option1.value = 'image';
    option1.textContent = 'Encoding Image';
    const option2 = document.createElement('option');
    option2.value = 'text';
    option2.textContent = 'Extract Text & Encode';
    
    dropdown.appendChild(option1);
    dropdown.appendChild(option2);
    
    configSection.appendChild(configLabel);
    configSection.appendChild(dropdown);
    mainFormView.appendChild(configSection);

    // Section C: Output Settings
    const outputSection = document.createElement('div');
    outputSection.className = 'pp-section';
    
    const outputLabel = document.createElement('label');
    outputLabel.textContent = 'Output Filename';
    outputLabel.className = 'pp-label';
    
    const outputInput = document.createElement('input');
    outputInput.id = 'pp-output-name'; 
    outputInput.type = 'text';
    outputInput.className = 'pp-input';
    outputInput.placeholder = 'Default (Original file name)';
    
    outputSection.appendChild(outputLabel);
    outputSection.appendChild(outputInput);
    mainFormView.appendChild(outputSection);

    // Section D: Action Buttons
    const actionDiv = document.createElement('div');
    actionDiv.className = 'pp-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'pp-btn pp-btn-secondary';
    cancelBtn.onclick = () => {
        dialog.style.transform = 'scale(0.95)';
        overlay.style.opacity = '0';
        setTimeout(() => {
            if(document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 200);
    };

    const processBtn = document.createElement('button');
    processBtn.textContent = 'Process Document';
    processBtn.className = 'pp-btn pp-btn-success';
    
    // --- UPDATED PROCESS LOGIC ---
    processBtn.onclick = async () => {
        const fileCount = fileInput.files.length;
        const textContent = textArea.value;
        const outputNameVal = outputInput.value.trim();

        // 1. Validation
        if (fileCount === 0 && textContent.trim() === ''){
            alert("Please select a file or paste text content to process.");
            return;   
        }

        // 2. Lock UI & Visual Feedback
        processBtn.textContent = 'Processing...';
        processBtn.style.opacity = '0.8';
        processBtn.disabled = true;

        // 3. Create Temporary List Item (The "Fake" item)
        const tempItem = document.createElement('div');
        tempItem.className = 'pp-doc-item';
        tempItem.style.opacity = '0.7'; // Dim slightly
        tempItem.style.pointerEvents = 'none'; // Prevent clicking
        
        // Determine Display Name
        let tempDisplayName = "Processing...";
        if (fileCount > 0) {
            const file = fileInput.files[0];
            tempDisplayName = outputNameVal || file.name;
        } else if (outputNameVal) {
            tempDisplayName = outputNameVal;
        } else {
            tempDisplayName = "Text Content";
        }

        // Build Inner HTML for Temp Item
        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = getIconForFile(tempDisplayName); 
        iconSpan.style.marginRight = '8px';
        iconSpan.style.color = '#b0b0b0';

        const docName = document.createElement('span');
        docName.textContent = tempDisplayName;
        docName.style.flexGrow = '1';
        
        // The Loading Spinner
        const statusSpan = document.createElement('span');
        statusSpan.className = 'pp-doc-status pp-loading'; // Add loading class immediately
        statusSpan.style.display = 'inline-block'; // Force visible
        
        tempItem.appendChild(iconSpan);
        tempItem.appendChild(docName);
        tempItem.appendChild(statusSpan);

        // Add to the top of the list or bottom
        docList.insertBefore(tempItem, docList.firstChild);
        docList.scrollTop = 0; // Scroll to top

        // 4. Prepare Data
        const formData = new FormData();
        const methodValue = dropdown.value;
        formData.append('chat_id', '-1'); 

        if (fileCount > 0) {
            const file = fileInput.files[0];
            // Handle renaming if needed
            if (outputNameVal) {
                const renamedFile = new File([file], outputNameVal, { type: file.type });
                formData.append('files', renamedFile);
            } else {
                formData.append('files', file);
            }
        } 
        else if (textContent.trim() !== '') {
            let finalName = tempDisplayName;
            // Ensure extension for text files
            if(finalName.indexOf('.') === -1) finalName += '.txt';
            
            const textFile = new File([textContent], finalName, { type: 'text/plain' });
            formData.append('files', textFile);
        }

        formData.append("text", "Please describe the image in detail in a text format.");
        formData.append('method', methodValue);

        // 5. Send Request
        try {
            const res = await fetch("/api/processDocument", {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Server failed to process document");

            const result = await res.json();
            
            // SUCCESS: Refresh the real list (this will naturally remove the temp item)
            await fetchAndRenderDocuments();
            // alert('Processing complete!');

        } catch (error) {
            console.error(error);
            
            // ERROR: Remove the temp item immediately
            if(tempItem && tempItem.parentNode) {
                tempItem.parentNode.removeChild(tempItem);
            }
            
            alert("Error processing document: " + error.message);
            
        } finally {
            // Reset UI
            fileInput.value = '';
            fileNameInput.value = '';
            outputInput.value = '';
            textArea.value = '';
            textArea.disabled = false;
            
            processBtn.textContent = 'Process Document';
            processBtn.style.opacity = '1';
            processBtn.disabled = false;
            dropdown.disabled = false;
        }
    };

    actionDiv.appendChild(cancelBtn);
    actionDiv.appendChild(processBtn);
    mainFormView.appendChild(actionDiv);

    rightPanel.appendChild(mainFormView);
    rightPanel.appendChild(previewView);

    dialog.appendChild(leftSidebar);
    dialog.appendChild(rightPanel);
    overlay.appendChild(dialog);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) cancelBtn.click();
    };

    document.body.appendChild(overlay);
}

// ---------------------------------------------------------
// COMPREHENSIVE PREVIEW LOGIC (MinIO Integrated)
// ---------------------------------------------------------
async function handleFilePreview(filename, objectName, previewContainer, formContainer) {
    // 1. Switch Views
    formContainer.style.display = 'none';
    previewContainer.style.display = 'flex';
    previewContainer.innerHTML = '';

    // ⭐ Construct the Real URL
    // We use encodeURIComponent to handle slashes/spaces in the MinIO object path safely
    const fileUrl = `/api/storage/${objectName}`;

    // 2. Header (Same as before)
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #3a3a3a; background-color:#2a2a2a; flex-shrink:0;';
    
    const titleGroup = document.createElement('div');
    titleGroup.style.display = 'flex';
    titleGroup.style.alignItems = 'center';
    titleGroup.innerHTML = `<span style="margin-right:10px; font-size:1.2em;">${getIconForFile(filename)}</span>`;
    
    const title = document.createElement('h4');
    title.id = 'pp-preview-title';
    title.textContent = filename;
    title.style.margin = '0';
    title.style.color = '#e0e0e0';
    titleGroup.appendChild(title);
    header.appendChild(titleGroup);

    const btnGroup = document.createElement('div');
    
    // Download Button (Points to the real file)
    const downloadBtn = document.createElement('a');
    downloadBtn.href = fileUrl;
    downloadBtn.download = filename; // Suggests filename to browser
    downloadBtn.innerHTML = '⬇ Download';
    downloadBtn.className = 'pp-btn pp-btn-secondary';
    downloadBtn.style.marginRight = '10px';
    downloadBtn.style.padding = '5px 10px';
    downloadBtn.style.fontSize = '12px';
    downloadBtn.style.textDecoration = 'none';
    downloadBtn.target = '_blank';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.className = 'pp-btn pp-btn-secondary';
    closeBtn.style.padding = '5px 12px';
    closeBtn.style.fontSize = '12px';
    closeBtn.onclick = () => {
        previewContainer.style.display = 'none';
        formContainer.style.display = 'block';
    };
    btnGroup.appendChild(downloadBtn);
    btnGroup.appendChild(closeBtn);
    header.appendChild(btnGroup);
    previewContainer.appendChild(header);

    // 3. Content Area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'flex:1; padding:20px; overflow:auto; background-color:#1e1e1e; color:#e0e0e0; display:flex; justify-content:center; align-items:center; position:relative;';

    const ext = filename.split('.').pop().toLowerCase();

    // --- RENDER LOGIC (UPDATED WITH REAL URLS) ---

    // 1. IMAGES
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        const img = document.createElement('img');
        img.src = fileUrl; // ⭐ Real URL
        img.style.cssText = 'max-width:100%; max-height:100%; border:1px solid #3a3a3a; box-shadow:0 5px 15px rgba(0,0,0,0.3); border-radius:4px; object-fit: contain;';
        contentArea.appendChild(img);
    } 
    // 2. VIDEO
    else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
        const video = document.createElement('video');
        video.controls = true;
        video.style.cssText = 'max-width:100%; max-height:100%; border-radius:8px; outline:none; background:#000;';
        video.src = fileUrl; // ⭐ Real URL
        
        contentArea.appendChild(video);
    }
    // 3. AUDIO
    else if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) {
        const container = document.createElement('div');
        container.style.textAlign = 'center';
        container.style.width = '100%';
        
        const icon = document.createElement('div');
        icon.innerHTML = '🎵';
        icon.style.fontSize = '64px';
        icon.style.marginBottom = '20px';
        
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.style.width = '300px';
        audio.src = fileUrl; // ⭐ Real URL
        
        const msg = document.createElement('p');
        msg.textContent = filename;
        msg.style.color = '#b0b0b0';

        container.appendChild(icon);
        container.appendChild(msg);
        container.appendChild(audio);
        contentArea.appendChild(container);
    }
    // 4. PDF (Embedded)
    else if (['pdf'].includes(ext)) {
        const embed = document.createElement('iframe'); // iframe is often more reliable for PDF blobs/streams
        embed.src = fileUrl; // ⭐ Real URL
        embed.style.cssText = "width:100%; height:100%; border:none; border-radius:4px;";
        
        contentArea.style.padding = '0';
        contentArea.style.display = 'block';
        contentArea.appendChild(embed);
    }
    // 5. TEXT / CODE FILES (Fetch content)
    else if (['txt', 'md', 'js', 'json', 'py', 'html', 'css', 'xml', 'yaml', 'yml', 'sh', 'sql', 'java', 'c', 'cpp'].includes(ext)) {
        contentArea.style.alignItems = 'flex-start';
        
        const pre = document.createElement('pre');
        pre.style.cssText = 'width:100%; margin:0; white-space:pre-wrap; font-family:"Consolas", "Monaco", monospace; font-size:13px; text-align:left; background-color:#2a2a2a; color:#d4d4d4; padding:20px; border-radius:6px; border:1px solid #3a3a3a;';
        pre.textContent = "Loading content...";
        
        // ⭐ Fetch the text content from the API
        try {
            const response = await fetch(fileUrl);
            if (response.ok) {
                const text = await response.text();
                pre.textContent = text;
            } else {
                pre.textContent = `Error loading file: ${response.statusText}`;
            }
        } catch (e) {
            pre.textContent = "Failed to load file content.";
        }

        contentArea.appendChild(pre);
    }

    // 6. DATA (CSV/TSV) - Real Table Render
    else if (['csv', 'tsv', 'xls', 'xlsx'].includes(ext)) {
        contentArea.style.alignItems = 'flex-start';
        contentArea.innerHTML = '<div style="color:#aaa; padding:20px;">Loading data table...</div>';
        
        try {
            const response = await fetch(fileUrl);
            if (response.ok) {
                const text = await response.text();
                contentArea.innerHTML = ''; // Clear loading message
                
                // Determine delimiter based on extension
                const delimiter = ext === 'tsv' ? '\t' : ',';
                
                // Render the table
                const tableContainer = renderCSVToTable(text, delimiter);
                contentArea.appendChild(tableContainer);
            } else {
                contentArea.innerHTML = `<div style="color:#ff6b6b;">Error loading data: ${response.statusText}</div>`;
            }
        } catch (e) {
            console.error(e);
            contentArea.innerHTML = '<div style="color:#ff6b6b;">Failed to load file content.</div>';
        }
    }

    // 7. FALLBACK
    else {
        const fallback = document.createElement('div');
        fallback.style.textAlign = 'center';
        fallback.style.color = '#b0b0b0';
        fallback.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">📄</div>
            <h3 style="color:#e0e0e0">No Preview Available</h3>
            <p>The file format <b>.${ext}</b> is not supported for web preview.</p>
            <a href="${fileUrl}" target="_blank" style="color: #4CAF50; text-decoration: none; border: 1px solid #4CAF50; padding: 8px 16px; border-radius: 4px; margin-top: 10px; display: inline-block;">Download File</a>
        `;
        contentArea.appendChild(fallback);
    }

    previewContainer.appendChild(contentArea);
}

// ---------------------------------------------------------
// HELPER: Mock Code Generator
// ---------------------------------------------------------
function generateMockCode(ext, filename) {
    if(ext === 'json') return `{\n  "filename": "${filename}",\n  "created_at": "2024-12-01",\n  "status": "active",\n  "data": [\n    1, 2, 3, 4\n  ]\n}`;
    if(ext === 'py') return `# ${filename}\nimport os\n\ndef process_data(data):\n    """Sample Python Function"""\n    results = []\n    for item in data:\n        print(f"Processing {item}")\n    return results`;
    if(ext === 'js') return `// ${filename}\nconst config = require('./config');\n\nfunction init() {\n    console.log('System initialized');\n    // TODO: Add more logic\n}\n\ninit();`;
    if(ext === 'html') return `<!DOCTYPE html>\n<html>\n<head>\n  <title>${filename}</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>`;
    if(ext === 'css') return `/* ${filename} */\nbody {\n  background-color: #1e1e1e;\n  color: #fff;\n}\n.container {\n  display: flex;\n}`;
    if(ext === 'sql') return `-- ${filename}\nSELECT * FROM users\nWHERE status = 'active'\nORDER BY created_at DESC;\nLIMIT 100;`;
    return `[Content of ${filename}]\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\nSed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
}

// ---------------------------------------------------------
// HELPER: Real CSV/TSV Renderer (Excel-like)
// ---------------------------------------------------------
function renderCSVToTable(csvText, delimiter = ',') {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%; height:100%; overflow:auto; background-color:#1e1e1e;';

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:separate; border-spacing:0; width:100%; font-size:13px; color:#e0e0e0; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;';

    // Simple CSV Parser (Handles basic quotes, newlines)
    // NOTE: For very complex CSVs, a library like PapaParse is recommended.
    // This is a robust vanilla implementation for preview purposes.
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuote = false;
    
    // Normalize newlines
    const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                currentCell += '"'; // Escaped quote
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === delimiter && !insideQuote) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if (char === '\n' && !insideQuote) {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    // Push last cell/row if exists
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    // Performance Guard: Limit rows for preview to prevent browser freezing
    const MAX_PREVIEW_ROWS = 2000;
    const displayRows = rows.slice(0, MAX_PREVIEW_ROWS);

    // --- DOM GENERATION ---
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    displayRows.forEach((rowCols, rowIndex) => {
        const tr = document.createElement('tr');
        
        rowCols.forEach((cellData, colIndex) => {
            const cell = rowIndex === 0 ? document.createElement('th') : document.createElement('td');
            
            // Clean up styling
            cell.textContent = cellData.trim();
            cell.style.border = '1px solid #3a3a3a';
            cell.style.padding = '6px 10px';
            cell.style.whiteSpace = 'nowrap';
            cell.style.maxWidth = '300px';
            cell.style.overflow = 'hidden';
            cell.style.textOverflow = 'ellipsis';
            
            if (rowIndex === 0) {
                // Header Styling
                cell.style.backgroundColor = '#2d2d2d';
                cell.style.fontWeight = 'bold';
                cell.style.position = 'sticky'; // Sticky Header
                cell.style.top = '0';
                cell.style.zIndex = '2';
                cell.style.borderBottom = '2px solid #555';
            } else {
                // Body Styling
                // Excel-like row numbering column logic could go here
                cell.style.backgroundColor = rowIndex % 2 === 0 ? '#1e1e1e' : '#252525'; // Zebra striping
            }

            tr.appendChild(cell);
        });
        
        if (rowIndex === 0) thead.appendChild(tr);
        else tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);

    // Add footer note if truncated
    if (rows.length > MAX_PREVIEW_ROWS) {
        const note = document.createElement('div');
        note.style.padding = '10px';
        note.style.color = '#888';
        note.style.fontStyle = 'italic';
        note.style.textAlign = 'center';
        note.textContent = `Preview truncated. Showing first ${MAX_PREVIEW_ROWS} of ${rows.length} rows.`;
        wrapper.appendChild(note);
    }

    return wrapper;
}

// ---------------------------------------------------------
// HELPER: File Icons
// ---------------------------------------------------------
function getIconForFile(filename) {
    if(!filename) return '📄';
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg','png','gif','webp','svg'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📕';
    if (['mp4','mov','webm'].includes(ext)) return '🎬';
    if (['mp3','wav'].includes(ext)) return '🎵';
    if (['csv','xls','xlsx'].includes(ext)) return '📊';
    if (['zip','rar','7z'].includes(ext)) return '📦';
    if (['html','css','js','py','java','c','cpp'].includes(ext)) return '💻';
    return '📄';
}

// Global state for document search: 'none', 'searchDoc', 'searchdocAll'
globalThis.docSearchState = 'none'; 

// Helper function to update Button UI and Placeholder based on state
function updateDocSearchUI(state) {
    const btn = document.getElementById('documentSearch');
    const input = document.getElementById('userInput');
    
    if (!btn || !input) return;

    // 1. Remove all active classes
    btn.classList.remove('state-my-doc', 'state-all-doc', 'active'); 

    // 2. Apply new state style and text
    globalThis.docSearchState = state;

    switch (state) {
        case 'searchDoc':
            btn.classList.add('state-my-doc'); // Green
            btn.title = "Searching: Selected Documents";
            input.placeholder = "Ask about Selected documents...";
            console.log("Search Mode: Selected Documents");
            break;
            
        case 'searchdocAll':
            btn.classList.add('state-all-doc'); // Purple
            btn.title = "Searching: ENTIRE Knowledge Base";
            input.placeholder = "Ask the KNOWLEDGE BASE...";
            console.log("Search Mode: ALL Documents");
            break;
            
        default: // 'none'
            btn.title = "Document Search: OFF";
            input.placeholder = "Ask any question...";
            console.log("Search Mode: OFF");
            break;
    }
}

window.showPreprocessDialog = showPreprocessDialog;