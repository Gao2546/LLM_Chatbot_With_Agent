
// preprocessDialog.js
// Function to create and show the preprocess file dialog modal

function showPreprocessDialog() {
    // 1. Create Overlay
    const overlay = document.createElement('div');
    overlay.className = 'pp-overlay'; // Uses CSS class for styling

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
        // Clear inputs logic here
        const inputs = document.querySelectorAll('.pp-input, .pp-textarea');
        inputs.forEach(input => input.value = '');
        
        // Remove active class from list items
        document.querySelectorAll('.pp-doc-item').forEach(item => item.classList.remove('active'));
    };
    leftSidebar.appendChild(newDocBtn);

    // List Heading
    const listHeading = document.createElement('h3');
    listHeading.textContent = 'Documents';
    listHeading.className = 'pp-header';
    listHeading.style.marginTop = '20px'; // Slight manual adjustment
    leftSidebar.appendChild(listHeading);

    // Document List Container
    const docList = document.createElement('div');
    docList.className = 'pp-doc-list';

    // Placeholder documents
    const documents = ['document1.txt', 'document2.pdf', 'document3.jpg', 'notes_2024.md'];
    documents.forEach(doc => {
        const docItem = document.createElement('div');
        docItem.textContent = doc;
        docItem.className = 'pp-doc-item';
        
        docItem.onclick = (e) => {
            // Handle selection styling
            if (e.target.classList.contains('active')){
                e.target.classList.remove('active');
            }

            // document.querySelectorAll('.pp-doc-item').forEach(item => item.classList.remove('active'));
            else{
                e.target.classList.add('active');
            }
            
            // Logic to load document data would go here
            console.log(`Selected: ${doc}`);
        };
        docList.appendChild(docItem);
    });
    leftSidebar.appendChild(docList);


    // --- RIGHT PANEL ---
    const rightPanel = document.createElement('div');
    rightPanel.className = 'pp-main-panel';

    // Section A: Input Source
    const inputSection = document.createElement('div');
    inputSection.className = 'pp-section';

    // File Upload Group
    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'Source File';
    fileLabel.className = 'pp-label';
    inputSection.appendChild(fileLabel);

    const fileUploadDiv = document.createElement('div');
    fileUploadDiv.className = 'pp-upload-group';

    const uploadBtn = document.createElement('button');
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Choose File'; // Added icon placeholder
    uploadBtn.className = 'pp-btn pp-btn-upload';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    
    // File Name Display Input
    const fileNameInput = document.createElement('input');
    fileNameInput.type = 'text';
    fileNameInput.placeholder = 'No file selected';
    fileNameInput.className = 'pp-input';
    fileNameInput.readOnly = true;

    // Events
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameInput.value = file.name;
            // Auto-fill the output filename if empty
            const outputName = document.getElementById('pp-output-name');
            if(outputName && !outputName.value) {
                outputName.value = file.name;
            }
        }
    };

    fileUploadDiv.appendChild(uploadBtn);
    fileUploadDiv.appendChild(fileNameInput);
    inputSection.appendChild(fileUploadDiv);

    // OR Separator
    const orText = document.createElement('div');
    orText.className = 'pp-separator';
    orText.textContent = 'OR PASTE TEXT';
    inputSection.appendChild(orText);

    // Text Area
    const textArea = document.createElement('textarea');
    textArea.className = 'pp-textarea';
    textArea.placeholder = 'Paste your text content here...';
    textArea.style.height = '120px';
    textArea.style.resize = 'vertical';
    inputSection.appendChild(textArea);

    rightPanel.appendChild(inputSection);

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
    rightPanel.appendChild(configSection);

    // Section C: Output Settings
    const outputSection = document.createElement('div');
    outputSection.className = 'pp-section';
    
    const outputLabel = document.createElement('label');
    outputLabel.textContent = 'Output Filename';
    outputLabel.className = 'pp-label';
    
    const outputInput = document.createElement('input');
    outputInput.id = 'pp-output-name'; // ID for auto-fill referencing
    outputInput.type = 'text';
    outputInput.className = 'pp-input';
    outputInput.placeholder = 'Default (Original file name)';
    
    outputSection.appendChild(outputLabel);
    outputSection.appendChild(outputInput);
    rightPanel.appendChild(outputSection);

    // Section D: Action Buttons
    const actionDiv = document.createElement('div');
    actionDiv.className = 'pp-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'pp-btn pp-btn-secondary';
    cancelBtn.onclick = () => {
        // Animation for closing
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
    processBtn.onclick = () => {
        // Visual feedback
        processBtn.textContent = 'Processing...';
        processBtn.style.opacity = '0.8';
        
        // Emulate API call
        setTimeout(() => {
            alert('Processing started!');
            processBtn.textContent = 'Process Document';
            processBtn.style.opacity = '1';
        }, 500);
    };

    actionDiv.appendChild(cancelBtn);
    actionDiv.appendChild(processBtn);
    rightPanel.appendChild(actionDiv);

    // Assemble Dialog
    dialog.appendChild(leftSidebar);
    dialog.appendChild(rightPanel);
    overlay.appendChild(dialog);
    
    // Close on click outside (optional)
    overlay.onclick = (e) => {
        if (e.target === overlay) cancelBtn.click();
    };

    document.body.appendChild(overlay);
}

window.showPreprocessDialog = showPreprocessDialog;