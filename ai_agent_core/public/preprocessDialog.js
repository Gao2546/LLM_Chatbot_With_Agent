
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

function showPreprocessDialog() {
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

    // Document List Container
    const docList = document.createElement('div');
    docList.className = 'pp-doc-list';
    leftSidebar.appendChild(docList); // Append immediately so we can populate it

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
    // ⭐ NEW: DYNAMIC DOCUMENT LIST LOGIC
    // =========================================================
    
    // Helper to fetch and render the list
    const fetchAndRenderDocuments = async () => {
        docList.innerHTML = '<div style="padding:10px; color:#888; text-align:center; font-size:12px;">Loading files...</div>';
        
        try {
            // NOTE: Assuming your backend has an endpoint to list files for a chat
            // If not, you need to add: app.get('/api/chat/:chatId/files', ...)
            const response = await fetch('/api/chat/-1/files'); 
            
            if (!response.ok) throw new Error("Failed to load files");
            
            const files = await response.json();
            docList.innerHTML = ''; // Clear loading message

            if (files.length === 0) {
                docList.innerHTML = '<div style="padding:10px; color:#666; font-style:italic; font-size:12px;">No documents found.</div>';
                return;
            }

            files.forEach((fileObj) => {
                // Determine filename (handle object or simple string for robustness)
                const fileName = fileObj.file_name || fileObj.name || "Unknown File";
                const fileId = fileObj.id; // Assuming DB returns an ID

                // Create Item Container
                const docItem = document.createElement('div');
                docItem.className = 'pp-doc-item';
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
                
                // 3. Status Spinner
                const statusSpan = document.createElement('span');
                statusSpan.className = 'pp-doc-status'; 
                
                // 4. Delete Button (Updated to call API)
                const delBtn = document.createElement('span');
                delBtn.innerHTML = '&times;';
                delBtn.className = 'pp-doc-delete';
                delBtn.title = 'Remove Document';
                
                delBtn.onclick = async (e) => {
                    e.stopPropagation(); 
                    if(confirm(`Are you sure you want to delete "${fileName}"?`)) {
                        // Optimistic UI update
                        docItem.style.opacity = '0.5';
                        
                        try {
                            // Call API to delete file
                            const delRes = await fetch(`/api/file/${fileId}`, { method: 'DELETE' });
                            if(delRes.ok) {
                                docItem.style.transform = 'translateX(-20px)';
                                docItem.style.opacity = '0';
                                setTimeout(() => {
                                    if (docItem.parentNode) docItem.parentNode.removeChild(docItem);
                                    // If we deleted the file currently being previewed
                                    const currentTitle = document.getElementById('pp-preview-title');
                                    if (currentTitle && currentTitle.textContent === fileName) {
                                        previewView.style.display = 'none';
                                        mainFormView.style.display = 'block';
                                    }
                                    // Refresh list to be safe
                                    fetchAndRenderDocuments();
                                }, 200);
                            } else {
                                alert("Failed to delete file on server.");
                                docItem.style.opacity = '1';
                            }
                        } catch (err) {
                            console.error("Delete error:", err);
                            alert("Error deleting file.");
                            docItem.style.opacity = '1';
                        }
                    }
                };

                // Append in Order
                docItem.appendChild(iconSpan);
                docItem.appendChild(docName);
                docItem.appendChild(statusSpan); 
                docItem.appendChild(delBtn);
                
                docItem.onclick = () => {
                     // Handle active class
                    //  document.querySelectorAll('.pp-doc-item').forEach(i => i.classList.remove('active'));
                    const isActive = docItem.classList.contains('active')
                    if (isActive){
                        docItem.classList.remove('active')
                    }
                    else {
                     docItem.classList.add('active');
                    }
                };

                docItem.ondblclick = () => {
                    // Pass the file ID or URL logic if available, currently just using name for mock preview
                    handleFilePreview(fileName, previewView, mainFormView);
                };

                docList.appendChild(docItem);
            });

        } catch (error) {
            console.error("Error fetching docs:", error);
            docList.innerHTML = '<div style="padding:10px; color:#ff6b6b; font-size:12px;">Error loading list.<br><small>Is backend running?</small></div>';
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
        // 1. Get current values
        const fileCount = fileInput.files.length;
        const textContent = textArea.value;
        const outputNameVal = outputInput.value.trim();

        // 2. Validation
        if (fileCount === 0 && textContent.trim() === ''){
            alert("Please select a file or paste text content to process.");
            return console.error("Invalid form");   
        }

        // 3. UI Feedback
        processBtn.textContent = 'Processing...';
        processBtn.style.opacity = '0.8';
        processBtn.disabled = true;

        const statusSpinners = document.querySelectorAll('.pp-doc-status');
        statusSpinners.forEach(spinner => {
            spinner.classList.add('pp-loading');
        });

        // 4. Prepare Data
        const formData = new FormData();
        const methodValue = dropdown.value;
        
        // ⭐ Force chat_id to -1 for the dummy buffer
        formData.append('chat_id', '-1'); 

        // Handle File or Text
        if (fileCount > 0) {
            const file = fileInput.files[0];
            if (outputNameVal) {
                const renamedFile = new File([file], outputNameVal, { type: file.type });
                formData.append('files', renamedFile);
            } else {
                formData.append('files', file);
            }
        } 
        else if (textContent.trim() !== '') {
            let finalFilename = outputNameVal;
            let mimeType = 'text/plain';

            if (!finalFilename) {
                const trimmedText = textContent.trim();
                if (trimmedText.startsWith('<html') || trimmedText.startsWith('<!DOCTYPE')) {
                    finalFilename = 'content.html'; mimeType = 'text/html';
                } else if ((trimmedText.startsWith('{') && trimmedText.endsWith('}'))) {
                    finalFilename = 'data.json'; mimeType = 'application/json';
                } else {
                    finalFilename = 'text_content.txt';
                }
            } else if (finalFilename.indexOf('.') === -1) {
                finalFilename += '.txt';
            }

            const textFile = new File([textContent], finalFilename, { type: mimeType });
            formData.append('files', textFile);
        }

        const promptMessage = "Please describe the image in detail in a text format.";
        formData.append("text", promptMessage);
        formData.append('method', methodValue);

        try {
            const res = await fetch("/api/processDocument", {
                method: "POST",
                body: formData
            });

            const result = await res.json();
            console.log('Result:', result);
            
            // ⭐ REFRESH THE LIST AFTER UPLOAD
            await fetchAndRenderDocuments();

            alert('Processing complete!');
        } catch (error) {
            console.error(error);
            alert("Error processing document");
        } finally {
             // Reset UI
            statusSpinners.forEach(spinner => spinner.classList.remove('pp-loading'));
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
// COMPREHENSIVE PREVIEW LOGIC (Kept exactly as provided)
// ---------------------------------------------------------
function handleFilePreview(filename, previewContainer, formContainer) {
    // 1. Switch Views
    formContainer.style.display = 'none';
    previewContainer.style.display = 'flex';
    previewContainer.innerHTML = '';

    // 2. Header
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
    
    // Download/Open External Mock Button
    const extBtn = document.createElement('button');
    extBtn.innerHTML = '&#x2197; Open System';
    extBtn.className = 'pp-btn pp-btn-secondary';
    extBtn.style.marginRight = '10px';
    extBtn.style.padding = '5px 10px';
    extBtn.style.fontSize = '12px';
    extBtn.onclick = () => alert(`Opening ${filename} in system viewer (simulation).`);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.className = 'pp-btn pp-btn-secondary';
    closeBtn.style.padding = '5px 12px';
    closeBtn.style.fontSize = '12px';
    closeBtn.onclick = () => {
        previewContainer.style.display = 'none';
        formContainer.style.display = 'block';
    };
    btnGroup.appendChild(extBtn);
    btnGroup.appendChild(closeBtn);
    header.appendChild(btnGroup);
    previewContainer.appendChild(header);

    // 3. Content Area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'flex:1; padding:20px; overflow:auto; background-color:#1e1e1e; color:#e0e0e0; display:flex; justify-content:center; align-items:center; position:relative;';

    const ext = filename.split('.').pop().toLowerCase();

    // --- RENDER LOGIC ---

    // 1. IMAGES
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        const img = document.createElement('img');
        img.src = `https://placehold.co/600x400/3a3a3a/e0e0e0?text=${filename}`; 
        img.style.cssText = 'max-width:100%; max-height:100%; border:1px solid #3a3a3a; box-shadow:0 5px 15px rgba(0,0,0,0.3); border-radius:4px;';
        contentArea.appendChild(img);
    } 
    // 2. VIDEO
    else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
        const video = document.createElement('video');
        video.controls = true;
        video.style.cssText = 'max-width:100%; max-height:100%; border-radius:8px; outline:none; background:#000;';
        video.src = "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"; 
        
        const note = document.createElement('div');
        note.innerHTML = '<small style="color:#666;">Playing sample video from remote source</small>';
        note.style.position = 'absolute';
        note.style.bottom = '10px';
        
        const container = document.createElement('div');
        container.style.cssText = 'display:flex; flex-direction:column; align-items:center; width:100%; height:100%; justify-content:center;';
        container.appendChild(video);
        container.appendChild(note);
        contentArea.appendChild(container);
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
        // Mock source
        audio.src = ""; 
        
        const msg = document.createElement('p');
        msg.textContent = "Audio Preview Player";
        msg.style.color = '#b0b0b0';

        container.appendChild(icon);
        container.appendChild(msg);
        container.appendChild(audio);
        contentArea.appendChild(container);
    }
    // 4. PDF (Embedded)
    else if (['pdf'].includes(ext)) {
        const embed = document.createElement('embed');
        // Mock PDF URL
        embed.src = "https://pdfobject.com/pdf/sample.pdf"; 
        embed.type = "application/pdf";
        embed.style.cssText = "width:100%; height:100%; border:none; border-radius:4px;";
        
        contentArea.style.padding = '0';
        contentArea.style.display = 'block';
        contentArea.appendChild(embed);
    }
    // 5. DATA (CSV) - Mock Table
    else if (['csv', 'tsv'].includes(ext)) {
        contentArea.style.alignItems = 'flex-start';
        contentArea.appendChild(createMockTable(filename));
    }
    // 6. CODE / TEXT / DATA FILES
    else if (['txt', 'md', 'js', 'json', 'py', 'html', 'css', 'xml', 'yaml', 'yml', 'sh', 'sql', 'java', 'c', 'cpp'].includes(ext)) {
        contentArea.style.alignItems = 'flex-start';
        
        const pre = document.createElement('pre');
        pre.style.cssText = 'width:100%; margin:0; white-space:pre-wrap; font-family:"Consolas", "Monaco", monospace; font-size:13px; text-align:left; background-color:#2a2a2a; color:#d4d4d4; padding:20px; border-radius:6px; border:1px solid #3a3a3a;';
        
        pre.textContent = generateMockCode(ext, filename);
        contentArea.appendChild(pre);
    }
    // 7. FALLBACK
    else {
        const fallback = document.createElement('div');
        fallback.style.textAlign = 'center';
        fallback.style.color = '#b0b0b0';
        fallback.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">📄</div>
            <h3 style="color:#e0e0e0">No Preview Available</h3>
            <p>The file format <b>.${ext}</b> is not supported for quick preview.</p>
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
// HELPER: Mock Table Generator (Dark Theme)
// ---------------------------------------------------------
function createMockTable(filename) {
    const tableWrapper = document.createElement('div');
    tableWrapper.style.width = '100%';
    
    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px; color:#e0e0e0;';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr style="background-color:#2a2a2a; text-align:left;">
            <th style="padding:10px; border-bottom:1px solid #4a4a4a;">ID</th>
            <th style="padding:10px; border-bottom:1px solid #4a4a4a;">Name</th>
            <th style="padding:10px; border-bottom:1px solid #4a4a4a;">Date</th>
            <th style="padding:10px; border-bottom:1px solid #4a4a4a;">Status</th>
        </tr>
    `;
    
    const tbody = document.createElement('tbody');
    for(let i=1; i<=10; i++) {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #3a3a3a';
        tr.innerHTML = `
            <td style="padding:10px;">${1000 + i}</td>
            <td style="padding:10px;">Item_Entry_${i}</td>
            <td style="padding:10px;">2024-10-${i < 10 ? '0'+i : i}</td>
            <td style="padding:10px;"><span style="color:#0a8276; font-weight:bold;">Active</span></td>
        `;
        tbody.appendChild(tr);
    }
    
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    
    const note = document.createElement('div');
    note.textContent = `Preview of first 10 rows from ${filename}`;
    note.style.cssText = 'margin-top:10px; color:#666; font-size:12px; font-style:italic;';
    tableWrapper.appendChild(note);
    
    return tableWrapper;
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

window.showPreprocessDialog = showPreprocessDialog;