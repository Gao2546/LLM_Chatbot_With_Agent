let socket = io({ serveClient: false });
const userId = null; // Replace with the actual user ID
// socket.emit('pong');

socket.on('connect', () => {
    console.log('Connected to server via Socket.IO');
});

socket.on('ping', () => {
    console.log('Received ping from server');
    socket.emit('pong');
});

socket.on('StreamText', (text) => {
    console.log('Received stream text from server');
    // socket.emit('pong');
    displayMarkdownMessageStream(text,window.messageElementStream)
});

socket.on('CallTool', async (toolName, toolParameters, callback) => {
  console.log(`Call Tool \nTool Name: ${toolName}`);

  const baseURL = 'http://localhost:3333/files';
  const baseSysURL = 'http://localhost:3333/system'

  try {
    switch (toolName) {

      case 'GetSystemInformation': {
        const response = await fetch(`${baseSysURL}/info`);
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'ListFiles': {
        const response = await fetch(`${baseURL}/list`);
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'ChangeDirectory': {
        console.log(toolParameters);
        const response = await fetch(`${baseURL}/change_dir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_path: toolParameters.new_path,
          }),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'ReadFile': {
        const response = await fetch(`${baseURL}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: toolParameters.file_name,
            start_line: toolParameters.start_line,
            end_line: toolParameters.end_line
          },),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'EditFile': {
        const response = await fetch(`${baseURL}/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: toolParameters.file_name,
            text: toolParameters.text,
            start_line: toolParameters.start_line,
            end_line: toolParameters.end_line
          }),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'CreateFile': {
        console.log(toolParameters);
        const response = await fetch(`${baseURL}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: toolParameters.file_name,
            text: toolParameters.text
          }),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'DeleteFile': {
        const response = await fetch(`${baseURL}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: toolParameters.file_name }),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'DownloadFile': {
        const response = await fetch(`${baseURL}/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: toolParameters.file_name }),
          mode: "cors",
          credentials: "include"
        });

        // NOTE: You can't directly download via socket server; this is for logging/debug
        const blob = await response.blob();
        console.log(`Downloaded file: ${toolParameters.file_name} - size: ${blob.size}`);
        callback(data);
        break;
      }

      case 'CreateFolder': {
        console.log("create_folder");
        const response = await fetch(`${baseURL}/create_folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_name: toolParameters.folder_name }),
          mode: "cors",
          credentials: "include"
        });
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
      }

      case 'ExecuteCommand': {
        console.log("command...");
        const response = await fetch(`${baseURL}/CMD`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              command: toolParameters.command,
              directory: toolParameters.directory, // optional
              wait: toolParameters.wait ? toolParameters.wait : 'False'
            }),
            mode: "cors",
            credentials: "include"
          });
          const data = await response.json();
          console.log(data);
          callback(data);
          break;
        }

       case 'CurrentDirectory': {
        const response = await fetch(`${baseURL}/CurrentDirectory`);
        const data = await response.json();
        console.log(data);
        callback(data);
        break;
        }

        case 'TakeScreenshot': {
          console.log("Server requested screenshot via 'TakeScreenshot' tool.");
        
          try {
            // 1. Fetch the image from your local API
            const response = await fetch(`${baseSysURL}/screenshot`);
        
            // 2. Check if the network request was successful
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
        
            // 3. Get the raw image data as a Blob
            const imageBlob = await response.blob();
        
            // 4. Convert the Blob to a Base64 string to send via the callback
            const base64Image = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result); // The result is the base64 string
              reader.onerror = reject;
              reader.readAsDataURL(imageBlob); // This starts the conversion
            });
        
            // 5. Now, send the base64 string back to the server
            console.log(`Screenshot sent back to server. Size: ${base64Image.length}`);
            callback({
              imageData: base64Image, // This is now a proper base64 data URL
              message: "Screenshot captured successfully."
            });
        
          } catch (error) {
            console.error("Screenshot capture failed:", error);
            // Send an error back if any step failed
            callback({
              imageData: null,
              message: `Error: Could not capture screenshot. ${error.message}`
            });
          }
          break;
        }




      default:
        throw new Error(`Tool function '${toolName}' not found.`);
    }
  } catch (err) {
    console.error(`Error handling tool '${toolName}':`, err);
    callback(`Tool function '${toolName}' not found.`);
  }
});

async function captureScreenFrameAsBase64() {
    try {
        // Request screen sharing with simplified constraints
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false // Explicitly disable audio
        });

        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
            console.error("No video track found in the screen stream.");
            return null;
        }

        const track = videoTracks[0];
        const imageCapture = new ImageCapture(track);

        // Capture a single frame as an ImageBitmap
        const bitmap = await imageCapture.grabFrame();

        // Important: Stop the track to end the screen sharing session
        track.stop();

        // Use a canvas to convert the ImageBitmap to a data URL
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        // Convert canvas content to base64 PNG
        return canvas.toDataURL('image/png');

    } catch (err) {
        // Handle cases where the user denies permission or another error occurs
        console.error("Error capturing screen:", err);
        return null;
    }
}

// How to use it:
// captureScreenFrameAsBase64().then(imageData => {
//     if (imageData) {
//         console.log("Captured Base64 Image:", imageData.substring(0, 50) + "...");
//         // You can now use this imageData, e.g., set it as an image source
//         // const myImage = document.getElementById('screenshot-img');
//         // myImage.src = imageData;
//     }
// });


const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const chatList = document.getElementById('chatList');
const toggleSidebarButton = document.getElementById('toggleSidebarButton');
const modeSelector = document.getElementById('modeSelector');
const modelSelector = document.getElementById('modelSelector'); // Add reference for model selector
const loginBtn = document.getElementById('loginBtn');
// Get references to original parent containers for responsive repositioning
const authContainer = document.querySelector('.auth-container');
const chatboxHeader = document.querySelector('#chatbox h1');
const chatbox = document.getElementById('chatbox');
const btnsidebarcontainer = document.querySelector('.btn-sidebar-container');
const stopButton = document.getElementById('stopButton');

const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const fileDialogButton = document.getElementById('fileDialogButton');
const changeDirButton = document.getElementById('changeDirButton');

// 1. Create a global DataTransfer object to hold the accumulated files
const dt = new DataTransfer();

fileInput.addEventListener('change', function() {
    for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i];
        // ตรวจสอบไฟล์ซ้ำ (เหมือนเดิม)
        let isDuplicate = false;
        for (let j = 0; j < dt.items.length; j++) {
            if (dt.items[j].getAsFile().name === file.name && 
                dt.items[j].getAsFile().size === file.size) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) {
            dt.items.add(file);
        }
    }
    // ลบ this.files = dt.files; ออก เพราะไม่ทำงานใน Chrome/Edge
    updateFileList();  // อัปเดต UI ตามปกติ
});

function updateFileList() {
    selectedFilesDiv.innerHTML = '';
    
    if (dt.files.length > 0) {
        selectedFilesDiv.style.display = 'flex';
        
        for (let i = 0; i < dt.files.length; i++) {
            const file = dt.files[i];
            const fileItem = document.createElement('div');
            fileItem.textContent = file.name;
            fileItem.setAttribute('data-file-name', file.name);
            
            // Add click event to remove file
            fileItem.addEventListener('click', function() {
                removeFile(file.name);
            });
            
            selectedFilesDiv.appendChild(fileItem);
        }
    } else {
        selectedFilesDiv.style.display = 'none';
    }
}

function clearSelectedFiles() {
    dt.items.clear();
    // ลบ fileInput.files = dt.files; ออก เพราะไม่ทำงาน
    updateFileList();
    selectedFilesDiv.style.display = 'none';
    selectedFilesDiv.innerHTML = '';
}

// Function to remove a file from the selection
function removeFile(fileName) {
    const newDt = new DataTransfer();
    for (let i = 0; i < dt.files.length; i++) {
        if (dt.files[i].name !== fileName) {
            newDt.items.add(dt.files[i]);
        }
    }
    dt.items.clear();
    for (let i = 0; i < newDt.files.length; i++) {
        dt.items.add(newDt.files[i]);
    }
    // ลบ fileInput.files = dt.files; ออก
    updateFileList();
}

window.addEventListener('beforeunload', async (event) => {
    // event.preventDefault(); // Some browsers require this
    // alert('Are you sure you want to leave?');
    // event.returnValue = ""; // This shows the native confirmation prompt
    // console.log('beforeunload-page')
    // await fetch('/auth/endsession')
    //     .then(response => {
    //         if (response.ok) {
    //             console.log('Session ended successfully');
    //         } else {
    //             console.error('Failed to end session');
    //         }
    //     })
    //     .catch(error => {
    //         console.error('Error ending session:', error);
    //     });
});

// window.addEventListener('unload', async (event) => {
//     // event.preventDefault(); // Some browsers require this
//     // alert('Are you sure you want to leave?');
//     // event.returnValue = ""; // This shows the native confirmation prompt
//     await fetch('/auth/endsession')
//         .then(response => {
//             if (response.ok) {
//                 console.log('Session ended successfully');
//             } else {
//                 console.error('Failed to end session');
//             }
//         })
//         .catch(error => {
//             console.error('Error ending session:', error);
//         });
// });


// Fetch chat history when the page loads
document.addEventListener('DOMContentLoaded', async (event) => {
    // socket.emit('pong');
    console.log('reload-page')
    // Add this check: Collapse sidebar on load if screen is small
    if (window.innerWidth < 868) {
        const chatList = document.getElementById('chatList');
        chatList.style.display = 'none';
        if (chatList) { // Check if chatList exists
            console.log("Reloading on small screen (< 868px), collapsing sidebar initially.");
            chatList.classList.toggle('collapsed');
            chatboxHeader.classList.toggle('collapsed');
            chatbox.classList.toggle('collapsed');
            // handleResize below will adjust other elements based on this collapsed state
        }
    }
    const docSearchBtn = document.getElementById('documentSearch');
    
    // State variable to track mode (Optional: use this in your send logic)
    let isRagMode = false; 

    if(docSearchBtn) {
        docSearchBtn.addEventListener('click', () => {
            // 1. Toggle the visual class
            docSearchBtn.classList.toggle('active');
            
            // 2. Update logic state
            isRagMode = docSearchBtn.classList.contains('active');
            
            // Optional: Provide UI feedback
            if(isRagMode) {
                console.log("Knowledge Base Search: ON");
                // You might want to change the placeholder text
                document.getElementById('userInput').placeholder = "Ask questions about your documents...";
            } else {
                console.log("Knowledge Base Search: OFF");
                document.getElementById('userInput').placeholder = "Ask any question...";
            }
        });
    }
    
    await fetch(`/api/reload-page`)
        .then(response => response.json())
        .then(data => {
            console.log('Reload-page data:', data);
            // Ensure dropdowns are populated before setting values
            const defaultMode = populateModes();
            const defaultModel = populateModels();

            if (data.userId) {
                socket.emit('register', { userId: data.userId });
                messagesDiv.innerHTML = ''; // Clear existing messages
                if (data.chatHistory && data.chatHistory.length > 0) {
                    data.chatHistory.forEach(message => {
                        if (message.startsWith('user:')) {
                            // displayMessage(message.substring(5).trim(), 'user-message');
                            displayMarkdownMessage(message.substring(5).trim(), 'user-message');
                        } 
                        else if (message.startsWith('assistance:')) {
                            displayMarkdownMessage(message.substring(11).trim(), 'agent-message');
                        }
                        else if (message.startsWith('img_url:')) {
                        // Extract the URL by slicing the string after "img_url:"
                        const imageUrl = message.substring("img_url:".length).trim();
                        console.log(imageUrl);
                        displayImageMessage(imageUrl, 'img-message');
                    }
                    });
                }

                // Validate and set Mode dropdown
                if (modeSelector) {
                    if (data.chatMode && modeSelector.querySelector(`option[value="${data.chatMode}"]`)) {
                        modeSelector.value = data.chatMode;
                        console.log(`Mode set from reload: ${data.chatMode}`);
                    } else {
                        modeSelector.value = defaultMode; // Set default if invalid/null
                        console.log(`Mode reset to default from reload: ${defaultMode}`);
                    }
                }
                // Validate and set Model dropdown
                if (modelSelector) {
                     if (data.chatModel && modelSelector.querySelector(`option[value="${data.chatModel}"]`)) {
                        modelSelector.value = data.chatModel;
                        console.log(`Model set from reload: ${data.chatModel}`);
                    } else {
                        modelSelector.value = defaultModel; // Set default if invalid/null
                        console.log(`Model reset to default from reload: ${defaultModel}`);
                    }
                }
            } else if (data.error) {
                console.error('Error fetching reload-page:', data.error);
                // Reset dropdowns to default if error indicates session issue
                if (modeSelector) modeSelector.value = defaultMode;
                if (modelSelector) modelSelector.value = defaultModel;
            }
        })
        .catch(error => {
            console.error('Error fetching reload-page:', error);
        });



        const loginBtn = document.getElementById('loginBtn');
        const usernameDisplay = document.getElementById('usernameDisplay'); // Get the new span

        if (loginBtn && usernameDisplay) { // Check if both elements exist
            try {
                const response = await fetch('/auth/session');
                const data = await response.json();
                console.log('Session data:', data);
                // Ensure dropdowns are populated before setting values
                const defaultMode = populateModes();
                const defaultModel = populateModels();

                if (data.loggedIn) {
                    loginBtn.textContent = data.isGuest ? 'Login' : 'Logout';
                    loginBtn.href = data.isGuest ? '/auth/login' : '/auth/logout';
                    // loginBtn.style.display = 'inline-block'; // Use inline-block for button

                    if (!data.isGuest && data.username) {
                        usernameDisplay.textContent = `Welcome: ${data.username}`;
                        usernameDisplay.style.display = 'inline'; // Show the span
                    } else {
                        usernameDisplay.style.display = 'none'; // Hide if guest or no username
                    }

                    if (data.chatIds) {
                        await displayChatList(data.chatIds);
                        const currChatId = data.currChatId;

                        // Highlight the active chat item
                        if (currChatId) {
                            const chatListDiv = document.getElementById('chatListEle');
                            const allChatItems = chatListDiv.querySelectorAll('.chat-item');
                            allChatItems.forEach(item => item.classList.remove('active'));
                            const targetText = `Chat ${currChatId}`;
                            const targetItem = Array.from(allChatItems).find(item => item.getElementsByClassName('chat-title')[0].textContent?.trim() === targetText);
                            if (targetItem) {
                                targetItem.classList.add('active');
                            } else {
                                console.warn('Chat item not found for currentChatId:', targetText);
                            }
                        }

                        // Validate and set Mode dropdown from session
                        if (modeSelector) {
                            if (data.currentChatMode && modeSelector.querySelector(`option[value="${data.currentChatMode}"]`)) {
                                modeSelector.value = data.currentChatMode;
                                console.log(`Mode set from session: ${data.currentChatMode}`);
                            } else {
                                modeSelector.value = defaultMode; // Reset to default if null/invalid
                                console.log(`Mode reset to default from session: ${defaultMode}`);
                            }
                        }
                        // Validate and set Model dropdown from session
                        if (modelSelector) {
                            if (data.currentChatModel && modelSelector.querySelector(`option[value="${data.currentChatModel}"]`)) {
                                modelSelector.value = data.currentChatModel;
                                console.log(`Model set from session: ${data.currentChatModel}`);
                            } else {
                                modelSelector.value = defaultModel; // Reset to default if null/invalid
                                console.log(`Model reset to default from session: ${defaultModel}`);
                            }
                        }
                    } else {
                        // Logged in but no chats yet, ensure dropdowns are at default
                        if (modeSelector) modeSelector.value = defaultMode;
                        if (modelSelector) modelSelector.value = defaultModel;
                    }
                } else {
                    // Not logged in
                    loginBtn.textContent = 'Login';
                    loginBtn.href = '/auth/login';
                    // loginBtn.style.display = 'inline-block';
                    usernameDisplay.style.display = 'none'; // Hide username span
                    messagesDiv.innerHTML = '';
                    usernameDisplay.innerHTML = '';
                    const chatListDiv = document.getElementById('chatListEle');
                    chatListDiv.innerHTML = '';
                    if (modeSelector) modeSelector.value = defaultMode;
                    if (modelSelector) modelSelector.value = defaultModel;
                }
            } catch (error) {
                console.error('Error checking session status:', error);
                loginBtn.textContent = 'Login';
                loginBtn.href = '/auth/login';
                // loginBtn.style.display = 'inline-block';
                usernameDisplay.style.display = 'none'; // Hide username span on error
                // Reset dropdowns on error too
                if (modeSelector) modeSelector.value = populateModes();
                if (modelSelector) modelSelector.value = populateModels();
            }
        }
    
    const cc = populateModes(); // Populate modes on load
    const mm = populateModels(); // Populate models on load
    console.log('Modes:', cc, 'Models:', mm);
    if (modeSelector) {
        modeSelector.addEventListener('change', handleModeChange);
    }
    // Add event listener for model change
    if (modelSelector) {
        modelSelector.addEventListener('change', handleModelChange);
    }
    // Initial check for responsive layout on load
    handleResize(); // This call will now respect the potentially collapsed state

    // Add click listener to close sidebar on outside click (small screens)
    document.addEventListener('click', (event) => {
        const chatList = document.getElementById('chatList');
        const toggleSidebarButton = document.getElementById('toggleSidebarButton');

        // Ensure elements exist and screen is small
        if (!chatList || !toggleSidebarButton || window.innerWidth >= 868) {
            return;
        }

        // Check if chat list is visible (not collapsed) and click is outside chatList and not the toggle button itself or its children
        if (!chatList.classList.contains('collapsed') &&
            !chatList.contains(event.target) &&
            event.target !== toggleSidebarButton &&
            !toggleSidebarButton.contains(event.target)) {

            console.log("Clicked outside sidebar on small screen, closing sidebar.");
            // Simulate a click on the toggle button to close the sidebar
            toggleSidebarButton.click();
        }
    });
});

// Sidebar toggle functionality
if (toggleSidebarButton && chatList) {
    toggleSidebarButton.addEventListener('click', async () => {
        chatList.style.display = 'inline-block';
        chatList.classList.toggle('collapsed');
        chatboxHeader.classList.toggle('collapsed');
        chatbox.classList.toggle('collapsed');
        // if(chatList.classList.contains('collapsed')){
        //     setTimeout(() => {
        //         chatbox.style.maxWidth = chatList.classList.contains('collapsed') ? '100%' : 'calc(100% - 250px)';
        //     }, 300);
        // }
        // else{
        //     chatbox.style.maxWidth = chatList.classList.contains('collapsed') ? '100%' : 'calc(100% - 250px)';  
        // }
        if (window.innerWidth > 868) {
            // chatbox.style.maxWidth = chatList.classList.contains('collapsed') ? '100%' : 'calc(100% - 250px)';
            chatbox.style.maxWidth = '100%';
        }
        else{
        chatbox.style.maxWidth = '100%';  
        }
        // After toggling, immediately check and reposition if on a small screen
        await handleResize(); // Re-run handleResize to apply correct positioning based on new state
    });
}

// Function to handle responsive layout changes based on window width
async function handleResize() {
    // Ensure elements exist before manipulating them
    const chatList = document.getElementById('chatList');
    const loginBtn = document.getElementById('loginBtn');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const toggleSidebarButton = document.getElementById('toggleSidebarButton');
    // Re-fetch containers inside in case they weren't ready on initial load
    const authContainer = document.querySelector('.auth-container');
    const chatboxHeader = document.querySelector('#chatbox h1');

    if (!chatList || !loginBtn || !usernameDisplay || !toggleSidebarButton || !authContainer || !chatboxHeader) {
        console.warn("Responsive layout: One or more required elements not found.");
        return; // Exit if elements are missing
    }

    const isSmallScreen = window.innerWidth < 868;

    if (isSmallScreen) {
        console.log("is call")
        // Small screen layout
        console.log("Responsive: Applying small screen layout (< 868px)");
        chatList.style.zIndex = '1000'; // Bring sidebar to front
        chatList.style.float = 'left'; // Float sidebar to the left

        // Move auth elements into the sidebar
        if (usernameDisplay.parentElement !== chatList) {
            chatList.insertBefore(usernameDisplay, newChatButton);
        }
        if (loginBtn.parentElement !== btnsidebarcontainer) {
            btnsidebarcontainer.prepend(loginBtn);
        }

        // Position toggle button based on sidebar state
        if (chatList.classList.contains('collapsed')) {
            // If sidebar is collapsed, move toggle button to header
            if (toggleSidebarButton.parentElement !== chatboxHeader) {
                toggleSidebarButton.style.marginRight = '10px';
                toggleSidebarButton.style.marginLeft = '5px';
                chatboxHeader.prepend(toggleSidebarButton);
            }
        } else {
            // If sidebar is visible, move toggle button to auth container (left of login)
            if (toggleSidebarButton.parentElement !== btnsidebarcontainer) {
                 // Ensure loginBtn is also in authContainer or temporarily move it for insertBefore
                 if (loginBtn.parentElement === btnsidebarcontainer) {
                    // authContainer.insertBefore(toggleSidebarButton, loginBtn);
                    console.log("Responsive: Moving toggle button to auth container");
                    // btnsidebarcontainer.insertBefore(toggleSidebarButton, loginBtn);
                    toggleSidebarButton.style.marginRight = '2px';
                    toggleSidebarButton.style.marginLeft = '10px';
                    btnsidebarcontainer.appendChild(toggleSidebarButton)
                 } else {
                    // If loginBtn isn't in authContainer yet (shouldn't happen often here), just append
                    console.log("Responsive: Appending toggle button to auth container");
                    chatboxHeader.appendChild(toggleSidebarButton);
                 }
            }
        }

    } else {
        // Large screen layout
        console.log("Responsive: Applying large screen layout (>= 868px)");
        chatList.style.zIndex = ''; // Reset z-index

        // Move elements back to their original positions
        // Check if the element is not already in its original parent
        if (toggleSidebarButton.parentElement !== chatboxHeader) {
            toggleSidebarButton.style.marginRight = '10px';
            toggleSidebarButton.style.marginLeft = '10px';
            chatboxHeader.prepend(toggleSidebarButton); // Prepend toggle button back to h1
        }
        // Important: Append usernameDisplay *before* loginBtn in authContainer
        if (usernameDisplay.parentElement !== authContainer) {
             // Ensure loginBtn is also in authContainer or temporarily move it
             if (loginBtn.parentElement === authContainer) {
                authContainer.insertBefore(usernameDisplay, loginBtn);
             } else {
                authContainer.appendChild(usernameDisplay);
             }
        }
        if (loginBtn.parentElement !== authContainer) {
            authContainer.appendChild(loginBtn); // Append login button back
        }

        // Ensure sidebar is not collapsed when screen is large
        // chatList.classList.remove('collapsed');
    }
}

// Add resize event listener to apply layout changes dynamically
window.addEventListener('resize', handleResize);

// Note: The original 'windowResize' listener block (lines 227-234) is now replaced by the handleResize function and the 'resize' listener.

const newChatButton = document.getElementById('newChatButton');
newChatButton.addEventListener('click', createNewChat);

async function createNewChat() {
    await fetch('/api/ClearChat')
        .then(response => response.json())
        .then(data => {
            console.log('Middleware data:', data);
            // Ensure dropdowns are populated before setting values
            const defaultMode = populateModes();
            const defaultModel = populateModels();

            if (data.exp){
                loginBtn.textContent = 'Login';
                loginBtn.href = '/auth/login';
                loginBtn.style.display = 'block';
                messagesDiv.innerHTML = '';
                usernameDisplay.innerHTML = '';
                const chatListDiv = document.getElementById('chatListEle');
                chatListDiv.innerHTML = '';
                if (modeSelector) modeSelector.value = defaultMode;
                if (modelSelector) modelSelector.value = defaultModel;
                return;
            }
        })
        .catch(error => {
            console.error('Error clearing chat:', error);
        });
        messagesDiv.innerHTML = '';
        const chatListDiv = document.getElementById('chatListEle');
        const allChatItems = chatListDiv.querySelectorAll('.chat-item');
        allChatItems.forEach(item => item.classList.remove('active'));
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keydown',async (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        sendMessage();
    }
});

    
// Add event listener for file dialog button
fileDialogButton.addEventListener('click', function() {
    // Open our custom file browser instead of the native file input
    openFileBrowser();
});

// Add event listener for change directory button
changeDirButton.addEventListener('click', function() {
    // Open file browser to select a directory
    openDirectoryBrowser();
});
// Add event listener to detect @ symbol in input
userInput.addEventListener('input', function() {
    const cursorPos = userInput.selectionStart;
    const textBeforeCursor = userInput.value.substring(0, cursorPos);
    
    // Check if the last character before cursor is @
    const lastChar = textBeforeCursor.charAt(textBeforeCursor.length - 1);
    
    // if (lastChar === '@') {
    //     // Show the file dialog button
    //     fileDialogButton.style.display = 'inline-flex';
    //     // Show the change directory button
    //     changeDirButton.style.display = 'inline-flex';
    // } else {
    //     // Hide the file dialog button
    //     fileDialogButton.style.display = 'none';
    //     // Hide the change directory button
    //     changeDirButton.style.display = 'none';
    // }
    
    // Also adjust textarea height
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});


async function sendMessage() {
    const defaultMode = populateModes(true); // Get default without modifying DOM yet
    const defaultModel = populateModels(true); // Get default without modifying DOM yet

    // Show stop button and hide send button when message is sent
    sendButton.style.display = 'none';
    stopButton.style.display = 'inline-flex';

    // Check middleware status first
    try {
        const middlewareResponse = await fetch(`/api/get-middlewares`);
        const middlewareData = await middlewareResponse.json();
        // const loginForm = document.getElementsByClassName('login-form')
        console.log('Middleware data:', middlewareData);
        if (middlewareData.exp) {
            loginBtn.textContent = 'Login';
            loginBtn.href = '/auth/login';
            loginBtn.style.display = 'block';
            const SocketInp = document.createElement('input')
            SocketInp.className = 'socket'
            SocketInp.value = socket.id
            SocketInp.hidden = true //************************************************************************************************************* */
            messagesDiv.innerHTML = '';
            usernameDisplay.innerHTML = '';
            const chatListDiv = document.getElementById('chatListEle');
            chatListDiv.innerHTML = '';
            // if (modeSelector) modeSelector.value = defaultMode;
            // if (modelSelector) modelSelector.value = defaultModel;
            // return; // Stop execution if middleware check fails
        }
    } catch (err) {
        console.error('Error fetching middleware status:', err);
        // Optionally display an error to the user
        resetButtonState(); // Reset button state on error
        return; // Stop if middleware check fails
    }

    let currentMessage = userInput.value.trim();
    const userFiles = document.getElementById('fileInput')
    // let currentFiles = userFiles.files;
    let currentFiles = dt.files;  // ใช้ dt.files แทน userFiles.files
    if (currentMessage === '') {
        resetButtonState(); // Reset button state if message is empty
        return;
    }

    // displayMessage(currentMessage, 'user-message'); // Display initial user message
    displayMarkdownMessage(currentMessage, 'user-message'); // Display initial user message
    // userInput.value = ''; // Clear input field
    // userFiles.value = '';
    userInput.style.height = 'auto'; // Reset height after sending

    let agentResponse = ''; // Variable to hold the latest agent response
    let attempt_completion = false;
    let img_url = null;
    let loopCount = 0; // Add a counter to prevent infinite loops in case of unexpected issues
    const MAX_LOOPS = 100; // Set a maximum number of iterations
    const selectedMode = modeSelector ? modeSelector.value : defaultMode; // Get selected mode *before* loop
    const selectedModel = modelSelector ? modelSelector.value : defaultModel; // Get selected model *before* loop
    let role = "user";
    // let data = null;

    try {

        const create_record_res = await fetch('/api/create_record', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: currentMessage, // Use currentMessage for the loop
                    // Use the actual current values from selectors or defaults captured *before* the loop
                    mode: selectedMode,
                    model: selectedModel,
                    role: role,
                    socket: socket.id //****************************************************************************************************************** */
                })
            });
        console.log(create_record_res);
        const formData = new FormData();
        formData.append("text", currentMessage);
        console.log(currentFiles);
        console.log(currentFiles.length);
        userInput.value = ''; // Clear input field
        userFiles.value = '';
        selectedFilesDiv.style.display = 'none';
        selectedFilesDiv.innerHTML = '';
        if (currentFiles.length === 0){
            console.log("No file")
        }
        else {
            if (currentFiles) {
                for (let i = 0; i < currentFiles.length; i++) {
                    formData.append("files", currentFiles[i]); // Use same name: "files"
                }
            }
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });
            console.log(res);

            const result = await res.json();
            console.log('show result')
            console.log(result)
            clearSelectedFiles();
        }
        // Show result in UI
        // document.getElementById("messages").innerHTML += `<p><strong>You:</strong> ${text}</p>`;
        // document.getElementById("messages").innerHTML += `<p><strong>AI:</strong> ${result.reply}</p>`;
    } catch (err) {
        console.error(err);
        // alert("Error sending message.");
        console.log("Error sending message")
        resetButtonState(); // Reset button state on error
        clearSelectedFiles();
    }

    try { // Wrap the loop in a try-catch
        do {
            loopCount++;
            if (loopCount > MAX_LOOPS) {
                console.error("Loop limit reached. Breaking.");
                displayMarkdownMessage("Loop limit reached. Please check the agent's response or try again.", 'agent-message');
                break;
            }

            if (selectedMode === "code") {
              try {
                await checkLocalAgent();
              } catch (err) {
                console.error("Agent unreachable", err);
                openModal();
                resetButtonState(); // Reset button state on error
                return;
              }
            }

            console.log(`Loop iteration ${loopCount}, Mode: ${selectedMode}, sending message:`, currentMessage.substring(0, 100) + "..."); // Log message start and mode
            
            window.messageElementStream = createMarkdownMessageStreamElement('agent-message')
            const sessionResponse = await fetch('/auth/session');
            const sessionData = await sessionResponse.json();
            console.log(socket.id + sessionData.currChatId)
            // Set your desired timeout in milliseconds (e.g., 30 seconds)
            const TIMEOUT_DURATION = 1000*60*60*2;
                    
            // 1. Create an AbortController instance
            const controller = new AbortController();
            const signal = controller.signal;
                    
            // 2. Set up the timeout
            const timeoutId = setTimeout(() => {
                console.log('Request timed out!');
                controller.abort(); // This will cancel the fetch request
            }, TIMEOUT_DURATION);

            // Send message to the backend
            const response = await fetch('/api/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: currentMessage,
                    mode: selectedMode,
                    model: selectedModel,
                    role: role,
                    socket: socket.id,
                    requestId: socket.id + sessionData.currChatId
                }),
                // 3. Pass the signal to the fetch options
                signal: signal
            });










            // if (!response.ok) {
            //         throw new Error(`HTTP error! status: ${response.status}`);
            //     }

            //     // --- Stream Processing ---
            //     const reader = response.body.getReader();
            //     const decoder = new TextDecoder();
            //     // responseContainer.innerHTML = ''; // Clear for new content
            //     messageElement = createMarkdownMessageStreamElement('agent-message')

            //     while (true) {
            //         const { value, done } = await reader.read();
            //         if (done) break;
                    
            //         const chunk = decoder.decode(value, { stream: true });
            //         // Sanitize HTML to prevent injection, although we expect plain
            //         const sanitizedChunk = chunk.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            //         // responseContainer.innerHTML += sanitizedChunk;
            //         displayMarkdownMessageStream(sanitizedChunk,messageElement)
                    
            //         // Optional: auto-scroll to the bottom
            //         // responseContainer.scrollTop = responseContainer.scrollHeight;
            //     }

            


            


            const data = await response.json();

            if (data.response) {
                agentResponse = data.response; // Store the response
                attempt_completion = data.attempt_completion;
                followup_question = data.followup_question;
                img_url = data.img_url;
                // Display the agent's response, unless it's the final completion signal
                if (followup_question) {
                    displayMarkdownMessage(agentResponse, 'agent-message');
                    console.log("Loop finished: 'ask_followup_question' received.");
                    // currentMessage = ""; // Update message for the next loop iteration (only relevant if looping)
                
                } else if (!attempt_completion) {
                    console.log(window.messageElementStream.innerHTML)
                    if (window.messageElementStream.innerHTML.length == 0){
                        console.log("display double")
                        displayMarkdownMessage(agentResponse, 'agent-message');
                    }
                    // currentMessage = ""; // Update message for the next loop iteration (only relevant if looping)
                }
                else {
                    console.log("Loop finished: 'attempt_completion' received.");

                    // Optionally display a final completion message here if needed
                    displayMarkdownMessage(`Task completed. Result: ${agentResponse}`, 'agent-message');
                    // displayMessage("Task completed.", 'agent-message');
                }

                if (img_url){
                    displayImageMessage(img_url, "img-message");
                }
            } else if (stopCon) {
                stopCon = false
                break

            }else if (data.error) {
                // Display the error message received from the backend
                const errorMessage = 'Error from agent: ' + data.error;
                displayMarkdownMessage(errorMessage, 'agent-message error-message'); // Add an error class
                console.error('Agent Error:', data.error);
                agentResponse = "error"; // Set response to break loop on error
            } else {
                // Handle unexpected response format
                displayMarkdownMessage('Unexpected response format from agent.', 'agent-message error-message');
                console.error('Unexpected response format:', data);
                agentResponse = "error"; // Set response to break loop
            }
        role = "assistance";
        // Loop ONLY if mode is 'code' AND until completion signal, error, or max loops reached
        } while ((selectedMode === 'code') && (!attempt_completion) && (!followup_question));

    } catch (error) {
        console.error('Error during message loop:', error);
        displayMarkdownMessage('Network error or issue communicating with the agent.', 'agent-message error-message');
    } finally {
        // This block executes regardless of whether the loop completed successfully or broke due to error/limit
        resetButtonState(); // Reset button state when finished

        // Update chat list and session info after the loop finishes
        try {
            const sessionResponse = await fetch('/auth/session');
            const sessionData = await sessionResponse.json();
            if (sessionData.loggedIn) {
                if (sessionData.chatIds) {
                    await displayChatList(sessionData.chatIds); // Ensure displayChatList is awaited if it becomes async
                    const currChatId = sessionData.currChatId;

                    // Highlight the active chat item
                    if (currChatId) {
                        const chatListDiv = document.getElementById('chatListEle');
                        const allChatItems = chatListDiv.querySelectorAll('.chat-item');
                        allChatItems.forEach(item => item.classList.remove('active'));
                        const targetText = `Chat ${currChatId}`;
                        const targetItem = Array.from(allChatItems).find(item => item.getElementsByClassName('chat-title')[0].textContent?.trim() === targetText);
                        if (targetItem) {
                            targetItem.classList.add('active');
                        } else {
                            console.warn('Chat item not found for currentChatId:', targetText);
                        }
                    }
                }
                if (sessionData.userId) {
                    socket.emit('register', { userId: sessionData.userId });
                }
            }
        } catch (sessionError) {
            console.error('Error checking session status after loop:', sessionError);
        }
    }
}

// Add event listener for preprocess button
document.getElementById('preprocessButton').addEventListener('click', () => {
    showPreprocessDialog();
});



function displayMessage(text, className) {
    const messageElement = document.createElement('div');
    messageElement.textContent = text;
    messageElement.className = className;
    
    // Add edit button for user messages
    if (className === 'user-message') {
        const editButton = document.createElement('button');
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.className = 'edit-button';
        editButton.title = 'Edit message';
        editButton.style.display = 'none'; // Hidden by default
        
        // Show button on hover
        messageElement.addEventListener('mouseenter', () => {
            editButton.style.display = 'inline-flex';
        });
        messageElement.addEventListener('mouseleave', () => {
            editButton.style.display = 'none';
        });
        
        // Edit button click handler
        editButton.addEventListener('click', () => {
            startEditMessage(messageElement, text);
        });
        
        messageElement.appendChild(editButton);
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
}



let stopCon = false;

// Function to reset button state to show send button and hide stop button
function resetButtonState() {
    sendButton.style.display = 'inline-flex';
    stopButton.style.display = 'none';
}

stopButton.addEventListener('click', async () => {
    const sessionResponse = await fetch('/auth/session');
    const sessionData = await sessionResponse.json();
    console.log(socket.id + sessionData.currChatId);
    await fetch("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: socket.id + sessionData.currChatId })
    })
    .then(res => res.json())
    .then((res) => {
    console.log(res);
    if (res.success){
        stopCon = true;
        resetButtonState(); // Reset button state after successful stop
        }
    });
})


async function displayChatList(chatIds) {
    const chatListDiv = document.getElementById('chatListEle');
    chatListDiv.innerHTML = ''; // Clear existing list

    chatIds.forEach(chatId => {
        const chatElement = document.createElement('div');
        chatElement.classList.add('chat-item');

        const titleSpan = document.createElement('span');
        titleSpan.textContent = `Chat ${chatId}`;
        titleSpan.classList.add('chat-title');
        chatElement.addEventListener('click', () => {
            // Remove 'active' class from all chat items
            const allChatItems = chatListDiv.querySelectorAll('.chat-item');
            allChatItems.forEach(item => item.classList.remove('active'));
            // Add 'active' class to the clicked item
            chatElement.classList.add('active');
            // Load chat history
            loadChatHistory(chatId);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering chat load
            try {
                const response = await fetch(`/api/chat-history/${chatId}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    const data = await response.json();
                    if (chatElement.classList.contains('active')) {
                        messagesDiv.innerHTML = ''; // Clear existing messages
                    }
                    chatElement.remove();
                    // if (data.ClearDisplay){
                    //     messagesDiv.innerHTML = ''; // Clear existing messages
                    // }
                    console.log(`Chat history ${chatId} deleted successfully`);
                } else {
                    const data = await response.json();
                    console.error('Failed to delete chat history:', data.error);
                    alert('Failed to delete chat history');
                }
            } catch (error) {
                console.error('Error deleting chat history:', error);
                alert('Error deleting chat history');
            }
        });

        chatElement.appendChild(titleSpan);
        chatElement.appendChild(deleteBtn);
        chatListDiv.appendChild(chatElement);
    });
}

const markdown = window.markdownit({
    html: true,
    breaks: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return `<div class="code-block-header"><div class="lang">${lang}</div><pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre></div>`;
            } catch (__) {}
        }

        return '<pre class="hljs"><code>' + markdown.utils.escapeHtml(str) + '</code></pre>';
    }
});


function displayMarkdownMessage(text, className) {
    const html = markdown.render(text);
    const messageElement = document.createElement('div');
    messageElement.innerHTML = html;
    messageElement.className = className;
    
    // Add copy button for agent messages
    if (className === 'agent-message') {
        const copyButton = document.createElement('button');
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.className = 'copy-button';
        copyButton.title = 'Copy message';
        copyButton.style.display = 'none'; // Hidden by default
        
        // Show button on hover
        messageElement.addEventListener('mouseenter', () => {
            copyButton.style.display = 'inline-flex';
        });
        messageElement.addEventListener('mouseleave', () => {
            copyButton.style.display = 'none';
        });
        
        // Copy button click handler
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(text).then(() => {
                // Show feedback
                copyButton.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                }, 1000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
        
        messageElement.appendChild(copyButton);
    }

    // Add edit button for user messages
    else if (className === 'user-message') {
        const editButton = document.createElement('button');
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.className = 'edit-button';
        editButton.title = 'Edit message';
        editButton.style.display = 'none'; // Hidden by default
        
        // Show button on hover
        messageElement.addEventListener('mouseenter', () => {
            editButton.style.display = 'inline-flex';
        });
        messageElement.addEventListener('mouseleave', () => {
            editButton.style.display = 'none';
        });
        
        // Edit button click handler
        editButton.addEventListener('click', () => {
            startEditMessage(messageElement, text);
        });
        
        messageElement.appendChild(editButton);

        const copyButton = document.createElement('button');
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.className = 'copy-button';
        copyButton.title = 'Copy message';
        copyButton.style.display = 'none'; // Hidden by default
        
        // Show button on hover
        messageElement.addEventListener('mouseenter', () => {
            copyButton.style.display = 'inline-flex';
        });
        messageElement.addEventListener('mouseleave', () => {
            copyButton.style.display = 'none';
        });
        
        // Copy button click handler
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(text).then(() => {
                // Show feedback
                copyButton.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                }, 1000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
        
        messageElement.appendChild(copyButton);
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([messageElement]).catch(err => console.error(err));
    }
}


function displayMarkdownMessageStream(text, messageElement) {
    const html = markdown.render(text);
    messageElement.innerHTML = html;

    // Add copy button for agent messages
    const copyButton = document.createElement('button');
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.className = 'copy-button';
    copyButton.title = 'Copy message';
    copyButton.style.display = 'none'; // Hidden by default
    
    // Show button on hover
    messageElement.addEventListener('mouseenter', () => {
        copyButton.style.display = 'inline-flex';
    });
    messageElement.addEventListener('mouseleave', () => {
        copyButton.style.display = 'none';
    });
    
    // Copy button click handler
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            copyButton.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    });
    
    messageElement.appendChild(copyButton);
    

    // Only auto-scroll if user is already at (or near) the bottom
    const threshold = 300; // px, how close to bottom counts as "at the bottom"
    const isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < threshold;

    if (isAtBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    if (window.MathJax) {
        MathJax.typesetPromise([messageElement]).catch(err => console.error(err));
    }
}

function createMarkdownMessageStreamElement(className){
    const messageElement = document.createElement('div');
    messageElement.className = className;
    messagesDiv.appendChild(messageElement);
    return messageElement
}

// function displayImageMessage(imageUrl, className = '') {
//     // Create a div to hold the image, allowing for potential styling or future additions
//     const messageElement = document.createElement('div');
//     messageElement.className = className; // Apply the provided class name

//     // Create the image element
//     const imgElement = document.createElement('img');
//     imgElement.src = imageUrl;
//     imgElement.alt = 'Chat image'; // Provide a descriptive alt text for accessibility
//     imgElement.style.maxWidth = '100%'; // Ensure the image fits within its container
//     imgElement.style.height = 'auto'; // Maintain aspect ratio
//     imgElement.style.borderRadius = '8px'; // Add some rounded corners for aesthetics
//     imgElement.style.marginTop = '5px'; // Add a small margin top for spacing

//     // Optional: Add an error handler for broken image links
//     imgElement.onerror = function() {
//         console.error('Failed to load image:', imageUrl);
//         // You could replace the broken image with a placeholder or a "failed to load" message
//         imgElement.src = 'https://placehold.co/150x150/FF0000/FFFFFF?text=Image+Error';
//         imgElement.alt = 'Image failed to load';
//     };

//     // Append the image to the message container
//     messageElement.appendChild(imgElement);

//     // Assuming 'messagesDiv' is the container where all chat messages are appended
//     // Make sure 'messagesDiv' is defined in your scope.
//     if (typeof messagesDiv !== 'undefined' && messagesDiv instanceof Element) {
//         messagesDiv.appendChild(messageElement);
//         // Scroll to the bottom of the messages div to show the new message
//         messagesDiv.scrollTop = messagesDiv.scrollHeight;
//     } else {
//         console.error("Error: 'messagesDiv' is not defined or is not a valid DOM element. Please ensure your chat container element is correctly referenced.");
//     }
// }

function displayImageMessage(objectName, className = '') {
    // Create a div to hold the image, allowing for potential styling or future additions
    const messageElement = document.createElement('div');
    messageElement.className = className; // Apply the provided class name

    // Create the image element
    const imgElement = document.createElement('img');
    
    // ⭐ UPDATE: Construct the full URL using your API endpoint
    imgElement.src = `/api/storage/${objectName}`; 
    
    imgElement.alt = 'Chat image'; // Provide a descriptive alt text for accessibility
    imgElement.style.maxWidth = '100%'; // Ensure the image fits within its container
    imgElement.style.height = 'auto'; // Maintain aspect ratio
    imgElement.style.borderRadius = '8px'; // Add some rounded corners for aesthetics
    imgElement.style.marginTop = '5px'; // Add a small margin top for spacing

    // Optional: Add an error handler for broken image links
    imgElement.onerror = function() {
        console.error('Failed to load image from object name:', objectName);
        // You could replace the broken image with a placeholder or a "failed to load" message
        imgElement.src = 'https://placehold.co/150x150/FF0000/FFFFFF?text=Image+Error';
        imgElement.alt = 'Image failed to load';
    };

    // Append the image to the message container
    messageElement.appendChild(imgElement);

    // Assuming 'messagesDiv' is the container where all chat messages are appended
    // Make sure 'messagesDiv' is defined in your scope.
    if (typeof messagesDiv !== 'undefined' && messagesDiv instanceof Element) {
        messagesDiv.appendChild(messageElement);
        // Scroll to the bottom of the messages div to show the new message
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
        console.error("Error: 'messagesDiv' is not defined or is not a valid DOM element. Please ensure your chat container element is correctly referenced.");
    }
}

async function loadChatHistory(chatId) {
    await fetch(`/api/chat-history?chatId=${chatId}`)
        .then(response => response.json())
        .then(data => {
            console.log('Load chat history data:', data);
            // Ensure dropdowns are populated before setting values
            const defaultMode = populateModes();
            const defaultModel = populateModels();

            if (data.exp){
                loginBtn.textContent = 'Login';
                loginBtn.href = '/auth/login';
                loginBtn.style.display = 'block';
                messagesDiv.innerHTML = '';
                usernameDisplay.innerHTML = '';
                const chatListDiv = document.getElementById('chatListEle');
                chatListDiv.innerHTML = '<h3>Chat History</h3>';
                if (modeSelector) modeSelector.value = defaultMode;
                if (modelSelector) modelSelector.value = defaultModel;
                return;
            }

            messagesDiv.innerHTML = ''; // Clear existing messages
            if (data.chatHistory && data.chatHistory.length >= 0) { // Allow empty history array
                data.chatHistory.forEach(message => {
                    if (message.startsWith('user:')) {
                        // displayMessage(message.substring(5).trim(), 'user-message');
                        displayMarkdownMessage(message.substring(5).trim(), 'user-message');
                    } 
                    else if (message.startsWith('assistance:')) {
                        displayMarkdownMessage(message.substring(11).trim(), 'agent-message');
                    }

                    else if (message.startsWith('img_url:')) {
                        // Extract the URL by slicing the string after "img_url:"
                        const imageUrl = message.substring("img_url:".length).trim();
                        console.log(imageUrl);
                        displayImageMessage(imageUrl, 'img-message');
                    }
                });

                // Validate and set Mode dropdown
                if (modeSelector) {
                    if (data.chatMode && modeSelector.querySelector(`option[value="${data.chatMode}"]`)) {
                        modeSelector.value = data.chatMode;
                        console.log(`Mode set from loadChatHistory: ${data.chatMode}`);
                    } else {
                        modeSelector.value = defaultMode; // Reset to default if null/invalid
                        console.log(`Mode reset to default from loadChatHistory: ${defaultMode}`);
                    }
                }
                 // Validate and set Model dropdown
                if (modelSelector) {
                    if (data.chatModel && modelSelector.querySelector(`option[value="${data.chatModel}"]`)) {
                        modelSelector.value = data.chatModel;
                        console.log(`Model set from loadChatHistory: ${data.chatModel}`);
                    } else {
                        modelSelector.value = defaultModel; // Reset to default if null/invalid
                        console.log(`Model reset to default from loadChatHistory: ${defaultModel}`);
                    }
                }
            } else if (data.error) {
                console.error('Error loading chat history:', data.error);
                // On error loading specific chat, maybe reset dropdowns to default?
                if (modeSelector) modeSelector.value = defaultMode;
                if (modelSelector) modelSelector.value = defaultModel;
            }
        })
        .catch(error => {
            console.error('Error fetching chat history:', error);
        });
}

// Function to populate the mode selector dropdown
// Added returnDefault parameter to get the default value without modifying the DOM
function populateModes(returnDefault = false) {
    const modes = [
        { id: 'code', name: 'Code' },
        { id: 'ask', name: 'Ask' },
        { id: 'architect', name: 'Architect' },
        { id: 'debug', name: 'Debug' }
    ];
    const defaultValue = modes.length > 0 ? modes[1].id : null;

    if (returnDefault) {
        return defaultValue;
    }

    if (!modeSelector) return defaultValue; // Exit if element doesn't exist

    const currentValue = modeSelector.value; // Store current value if exists
    console.log('Modes:', currentValue);
    modeSelector.innerHTML = ''; // Clear existing options

    modes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.name;
        modeSelector.appendChild(option);
    });
    console.log('Modes:', currentValue);

    // Try to restore previous value, otherwise set default
    if (modes.some(mode => mode.id === currentValue)) {
        modeSelector.value = currentValue;
    } else if (defaultValue) {
        modeSelector.value = defaultValue;
    }
    return modeSelector.value; // Return the final set value
}

// Function to populate the AI model selector dropdown
// Added returnDefault parameter to get the default value without modifying the DOM
function populateModels(returnDefault = false) {
    const models = [
        { id: '01:18m', name: '01:18m' },
        // { id: '{_Ollama_API_}deepcoder:1.5b', name: 'deepcoder:1.5b' },
        // { id: '{_Ollama_API_}deepcoder:14b', name: 'deepcoder:14b' },
        // { id: '{_Ollama_API_}deepseek-coder:1.3b', name: 'deepseek-coder:1.3b' },
        // { id: '{_Ollama_API_}deepseek-coder:6.7b', name: 'deepseek-coder:6.7b' },
        { id: '{_Ollama_API_}deepseek-r1:1.5b', name: 'OLdeepseek-r1:1.5b' },
        { id: '{_Ollama_API_}deepseek-r1:8b', name: 'OLdeepseek-r1:8b'},
        // { id: '{_Ollama_API_}deepseek-r1:14b', name: 'deepseek-r1:14b' },
        // { id: '{_Ollama_API_}deepseek-r1:32b', name: 'deepseek-r1:32b' },
        // { id: '{_Ollama_API_}deepseek-r1:latest', name: 'deepseek-r1:latest' },
        { id: '{_Ollama_API_}gemma3:270m', name: 'OLgemma3:270m' },
        { id: '{_Ollama_API_}gemma3:1b', name: 'OLgemma3:1b' },
        { id: '{_Ollama_API_}gemma3:4b', name: 'OLgemma3:4b' },
        { id: '{_Ollama_API_}gemma3n:e4b', name: 'OLgemma3n:e4b'},
        { id: '{_Ollama_API_}gpt-oss:20b', name: 'OLgpt-oss:20b'},
        // { id: '{_Ollama_API_}gemma3:12b', name: 'gemma3:12b' },
        // { id: '{_Ollama_API_}gemma3:27b', name: 'gemma3:27b' },
        { id: '{_Google_API_}gemma-3-1b-it', name: 'GGgemma-3-1b-it'},
        { id: '{_Google_API_}gemma-3-4b-it', name: 'GGemma-3-4b-it'},
        { id: '{_Google_API_}gemma-3-12b-it', name: 'GGgemma-3-12b-it'},
        { id: '{_Google_API_}gemma-3-27b-it', name: 'GGgemma-3-27b-it'},
        { id: '{_Google_API_}gemini-2.5-pro', name: 'GGgemini-2.5-pro' },
        { id: '{_Google_API_}gemini-2.5-flash-lite', name: 'GGgemini-2.5-flash-lite'},
        { id: '{_Google_API_}gemini-2.5-flash', name: 'GGgemini-2.5-flash'},
        { id: '{_Google_API_}gemini-2.0-flash', name: 'GGgemini-2.0-flash'},
        // { id: 'gemini-1.5-flash-002', name: 'gemini-1.5-flash-002' },
        // { id: 'gemini-1.5-flash-8b-exp-0827', name: 'gemini-1.5-flash-8b-exp-0827' },
        // { id: 'gemini-1.5-flash-exp-0827', name: 'gemini-1.5-flash-exp-0827' },
        // { id: 'gemini-1.5-pro-002', name: 'gemini-1.5-pro-002' },
        // { id: 'gemini-1.5-pro-exp-0827', name: 'gemini-1.5-pro-exp-0827' },
        // { id: 'gemini-2.0-flash-001', name: 'gemini-2.0-flash-001' },
        // { id: 'gemini-2.0-flash-exp', name: 'gemini-2.0-flash-exp' },
        // { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'gemini-2.0-flash-lite-preview-02-05' },
        // { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'gemini-2.0-flash-thinking-exp-01-21' },
        // { id: 'gemini-2.0-flash-thinking-exp-1219', name: 'gemini-2.0-flash-thinking-exp-1219' },
        // { id: 'gemini-2.0-pro-exp-02-05', name: 'gemini-2.0-pro-exp-02-05' },
        // { id: 'gemini-exp-1206', name: 'gemini-exp-1206' },
        
        { id: '{_OpenRouter_API_}deepseek/deepseek-chat-v3-0324:free', name: 'ORdeepseek-chat-v3-0324:free'},
        { id: '{_OpenRouter_API_}deepseek/deepseek-r1-0528:free', name: 'ORdeepseek-r1-0528:free'},
        { id: '{_OpenRouter_API_}deepseek/deepseek-chat-v3-0324', name: 'ORdeepseek-chat-v3-0324'},
        { id: '{_OpenRouter_API_}deepseek/deepseek-chat-v3.1', name: 'ORdeepseek-chat-v3.1'},
        { id: '{_OpenRouter_API_}openai/gpt-oss-20b', name: 'ORgpt-oss-20b'},
        { id: '{_OpenRouter_API_}openai/gpt-oss-120b', name: 'ORgpt-oss-120b'},
        { id: '{_OpenRouter_API_}google/gemma-3-27b-it:free', name: 'ORgemma-3-27b-it:free'},
        { id: '{_OpenRouter_API_}google/gemma-3-27b-it', name: 'ORgemma-3-27b-it'},
        { id: '{_OpenRouter_API_}google/gemma-3-12b-it:free', name: 'ORgemma-3-12b-it:free'},
        { id: '{_OpenRouter_API_}google/gemma-3-12b-it', name: 'ORgemma-3-12b-it'},
        { id: '{_OpenRouter_API_}google/gemma-3-4b-it:free', name: 'ORgemma-3-4b-it:free'},
        { id: '{_OpenRouter_API_}google/gemma-3-4b-it', name: 'ORgemma-3-4b-it'},
        { id: '{_OpenRouter_API_}google/gemini-2.0-flash-001', name: 'ORgemini-2.0-flash-001'},
        { id: '{_OpenRouter_API_}google/gemini-2.5-flash', name: 'ORgemini-2.5-flash'},
        { id: '{_OpenRouter_API_}z-ai/glm-4.6', name: 'ORglm-4.6'},
        { id: '{_OpenRouter_API_}x-ai/grok-code-fast-1', name: 'ORgrok-code-fast-1'},
        { id: '{_OpenRouter_API_}x-ai/grok-4-fast', name: 'ORgrok-4-fast'},
        { id: '{_OpenRouter_API_}qwen/qwen3-coder:free', name: 'ORqwen3-coder:free'},
        { id: '{_OpenRouter_API_}qwen/qwen3-coder', name: 'ORqwen3-coder'},
        { id: '{_OpenRouter_API_}qwen/qwen3-coder-30b-a3b-instruct', name: 'ORqwen3-coder-30b-a3b-instruct'},
        { id: '{_OpenRouter_API_}meta-llama/llama-3.1-8b-instruct', name: 'ORllama-3.1-8b-instruct'},
        { id: '{_OpenRouter_API_}meta-llama/llama-3.2-1b-instruct', name: 'ORllama-3.1-1b-instruct'},
        { id: '{_OpenRouter_API_}openrouter/sonoma-sky-alpha', name: 'ORsonoma-sky-alpha'},
        // { id: '{_Ollama_API_}hhao/qwen2.5-coder-tools:7b', name: 'hhao/qwen2.5-coder-tools:7b' },
        // { id: '{_Ollama_API_}hhao/qwen2.5-coder-tools:14b', name: 'hhao/qwen2.5-coder-tools:14b' },
        // { id: '{_Ollama_API_}llama3.2:latest', name: 'llama3.2:latest' },
        // { id: '{_Ollama_API_}phi4:14b', name: 'phi4:14b' },
        // { id: '{_Ollama_API_}qwq:latest', name: 'qwq:latest' },
        // { id: '{_Ollama_API_}qwen2.5-coder:0.5b', name: 'qwen2.5-coder:0.5b' },
        // { id: '{_Ollama_API_}qwen2.5-coder:1.5b', name: 'qwen2.5-coder:1.5b' },
        // { id: '{_Ollama_API_}qwen2.5-coder:3b', name: 'qwen2.5-coder:3b' },
        // { id: '{_Ollama_API_}qwen2.5-coder:7b', name: 'qwen2.5-coder:7b' },
        // { id: '{_Ollama_API_}qwen2.5-coder:14b', name: 'qwen2.5-coder:14b' },
        // { id: '{_Ollama_API_}qwen2.5-coder:32b', name: 'qwen2.5-coder:32b' },
        // { id: '{_Ollama_API_}qwen3:4b', name: 'qwen3:4b'},
        // { id: '{_Ollama_API_}wizardlm2:7b', name: 'wizardlm2:7b' },
    ];
    const defaultValue = models.length > 0 ? models[10].id : null;

    if (returnDefault) {
        return defaultValue;
    }

    if (!modelSelector) return defaultValue; // Exit if element doesn't exist

    const currentValue = modelSelector.value; // Store current value if exists
    console.log('Models:', currentValue);
    modelSelector.innerHTML = ''; // Clear existing options

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelector.appendChild(option);
    });
    // modelSelector.value = 'gemma3:4b'
    // modeSelector.name = "gemma3:4b"
    console.log('Models:', currentValue);

    // Try to restore previous value, otherwise set default
    if (models.some(model => model.id === currentValue)) {
        modelSelector.value = currentValue;
    } else if (defaultValue) {
        modelSelector.value = defaultValue;
    }
    return modelSelector.value; // Return the final set value
}

// Function to handle AI model change
async function handleModelChange() {
    if (!modelSelector) return;
    const selectedModel = modelSelector.value;
    console.log(`AI Model changed to: ${selectedModel}`);
    
    // Send the selected model to the backend
    try {
        const response = await fetch('/api/set-model', { // Use the correct endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: selectedModel }) // Send as 'model'
        });
        if (response.ok) {
            const data = await response.json();
            console.log('Model successfully set on backend:', data);
        } else {
            const errorData = await response.json();
            console.error('Failed to set model on backend:', response.status, errorData);
            // Optional: Revert dropdown or show error message
            // populateModels(); // Re-fetch/reset if needed
        }
    } catch (error) {
        console.error('Error sending model change request:', error);
        // Optional: Show error message
    }
}

// Function to handle mode change
async function handleModeChange() {
    if (!modeSelector) return;
    const selectedMode = modeSelector.value;
    console.log(`Mode changed to: ${selectedMode}`);

    try {
        const response = await fetch('/api/set-mode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode: selectedMode })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Mode successfully set on backend:', data);
            // Optional: Display a confirmation to the user or update UI further
        } else {
            const errorData = await response.json();
            console.error('Failed to set mode on backend:', response.status, errorData);
            // Optional: Revert dropdown or show error message
            // populateModes(); // Re-fetch/reset to actual current mode if setting failed
        }
    } catch (error) {
        console.error('Error sending mode change request:', error);
        // Optional: Show error message
    }
}


async function checkLocalAgent() {
  const res = await fetch("http://localhost:3333/ping");
  if (!res.ok) throw new Error("Agent not reachable");
}

function openModal() {
      document.getElementById("setupModal").style.display = "flex";
    }

function closeModal() {
  document.getElementById("setupModal").style.display = "none";
}

function downloadScript() {
  fetch('/api/detect-platform', {
    method: 'POST'
  })
  .then(response => response.json())
  .then(data => {
    console.log(data);
    if (data && data.script) {
      // Trigger browser download
      window.location.href = `/api/download-script/${data.script}`;
    }
  })
  .catch(err => console.error('Download error:', err));
}

// Optional: Close modal when clicking outside of it
window.onclick = function(event) {
  const modal = document.getElementById("setupModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
}
// Function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// // Function to open directory browser for changing current directory
// function openDirectoryBrowser() {
//     const modal = document.getElementById('directoryBrowserModal');
//     if (!modal) {
//         createDirectoryBrowserModal();
//     }

//     // Start with the current working directory
//     loadDirectoryForChange('');
//     document.getElementById('directoryBrowserModal').style.display = 'flex';
// }

// // Function to create directory browser modal
// function createDirectoryBrowserModal() {
//     const modal = document.createElement('div');
//     modal.id = 'directoryBrowserModal';
//     modal.className = 'directory-browser-modal';
//     modal.innerHTML = `
//         <div class="file-browser-content">
//             <div class="file-browser-header">
//                 <h3>Change Directory</h3>
//                 <button class="close-button" onclick="closeDirectoryBrowser()">&times;</button>
//             </div>
//             <div class="file-browser-path">
//                 <input type="text" id="currentDirPath" readonly>
//             </div>
//             <div class="file-browser-nav">
//                 <button id="parentDirBtn" onclick="navigateToParentDirectoryForChange()">..</button>
//                 <button id="homeDirBtn" onclick="navigateToHomeDirectoryForChange()">Home</button>
//                 <input type="text" id="searchBox1" oninput="filterItemsForChange()" placeholder="Search current directory..." class="file-browser-search">
//             </div>
//             <div class="file-browser-list" id="dirFileList">
//             </div>
//             <div class="file-browser-footer">
//                 <button id="changeBtn" onclick="confirmDirectoryChange()" disabled>Change</button>
//                 <button onclick="closeDirectoryBrowser()">Cancel</button>
//             </div>
//         </div>
//     `;

//     // Add styles for the modal (reusing existing styles)
//     const style = document.createElement('style');
//     style.textContent = `
//         .directory-browser-modal {
//             display: none; position: fixed; z-index: 1000;
//             left: 0; top: 0; width: 100%; height: 100%;
//             background-color: rgba(0,0,0,0.5);
//             align-items: center; justify-content: center;
//         }
//         .file-browser-content {
//             background-color: #2a2a2a; margin: auto; padding: 0;
//             border: 1px solid #3a3a3a; width: 80%; max-width: 800px;
//             height: 70%; max-height: 600px; border-radius: 8px;
//             box-shadow: 0 4px 8px rgba(0,0,0,0.2);
//             display: flex; flex-direction: column;
//             backdrop-filter: blur(5px);
//         }
//         .file-browser-header {
//             display: flex; justify-content: space-between; align-items: center;
//             padding: 10px 20px; background-color: #0a8276; color: white;
//             border-radius: 8px 8px 0 0;
//         }
//         .file-browser-header h3 { margin: 0; font-weight: 600; }
//         .close-button {
//             background: none; border: none; font-size: 24px;
//             cursor: pointer; color: white; transition: color 0.2s ease;
//         }
//         .close-button:hover { color: #e0e0e0; }
//         .file-browser-path {
//             padding: 10px 20px; background-color: #1e1e1e;
//             border-bottom: 1px solid #3a3a3a;
//         }
//         .file-browser-path input {
//             width: 100%; padding: 8px; border: 1px solid #4a4a4a;
//             border-radius: 8px; background-color: #3c3c3c; color: #e0e0e0;
//             font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//         }
//         .file-browser-path input:focus { outline: none; border-color: #0a8276; }
//         .file-browser-nav { padding: 10px 20px; display: flex; align-items: center; gap: 10px; }
//         .file-browser-nav button {
//             padding: 8px 15px; background-color: #3c3c3c;
//             border: 1px solid #4a4a4a; border-radius: 8px; cursor: pointer;
//             color: #e0e0e0; transition: background-color 0.2s ease, transform 0.1s ease;
//             flex-shrink: 0;
//         }
//         .file-browser-nav button:hover { background-color: #4a4a4a; transform: scale(1.02); }
//         .file-browser-nav button:active { transform: scale(0.98); }
//         .file-browser-search {
//             flex-grow: 1;
//             padding: 8px;
//             border-radius: 8px;
//             border: 1px solid #4a4a4a;
//             background-color: #3c3c3c;
//             color: #e0e0e0;
//             font-family: inherit;
//             font-size: 0.9em;
//         }
//         .file-browser-search:focus {
//             outline: none;
//             border-color: #0a8276;
//         }
//         .file-browser-list {
//             flex-grow: 1; overflow-y: auto; padding: 10px 20px;
//             background-color: #1e1e1e; scrollbar-width: thin;
//             scrollbar-color: #555 #2a2a2a;
//         }
//         .file-browser-list::-webkit-scrollbar { width: 8px; }
//         .file-browser-list::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 10px; }
//         .file-browser-list::-webkit-scrollbar-thumb {
//             background-color: #555; border-radius: 10px; border: 2px solid #2a2a2a;
//         }
//         .file-browser-list::-webkit-scrollbar-thumb:hover { background-color: #777; }
//         .file-item {
//             display: flex; align-items: center; padding: 10px;
//             cursor: pointer; border-radius: 8px; margin-bottom: 5px;
//             transition: background-color 0.2s ease, transform 0.1s ease;
//         }
//         .file-item:hover { background-color: #3a3a3a; transform: scale(1.01); }
//         .file-item.selected { background-color: #0a8276; color: white; }
//         .file-icon { margin-right: 10px; width: 20px; text-align: center; }
//         .file-name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
//         .file-size { margin-left: 10px; color: #b0b0b0; font-size: 0.9em; }
//         .file-item.selected .file-size { color: rgba(255, 255, 255, 0.8); }
//         .file-browser-footer {
//             padding: 15px 20px; display: flex; justify-content: flex-end;
//             gap: 10px; border-top: 1px solid #3a3a3a;
//         }
//         .file-browser-footer button {
//             padding: 10px 20px; border: none; border-radius: 8px;
//             cursor: pointer; font-weight: 600;
//             transition: background-color 0.2s ease, transform 0.1s ease;
//         }
//         #changeBtn { background-color: #0a8276; color: white; }
//         #changeBtn:hover { background-color: #005fa3; transform: scale(1.02); }
//         #changeBtn:active { transform: scale(0.98); }
//         #changeBtn:disabled { background-color: #555; cursor: not-allowed; transform: none; }
//         .file-browser-footer button:not(#changeBtn) {
//             background-color: #3c3c3c; color: #e0e0e0; border: 1px solid #4a4a4a;
//         }
//         .file-browser-footer button:not(#changeBtn):hover { background-color: #4a4a4a; transform: scale(1.02); }
//         .file-browser-footer button:not(#changeBtn):active { transform: scale(0.98); }
//     `;

//     document.head.appendChild(style);
//     document.body.appendChild(modal);
// }

// // Function to close directory browser modal
// function closeDirectoryBrowser() {
//     document.getElementById('directoryBrowserModal').style.display = 'none';
//     selectedDirectoryPath = '';
// }

// // Global variable to store selected directory path
// let selectedDirectoryPath = '';

// // Function to load directory for change directory browser
// async function loadDirectoryForChange(directory) {
//     try {
//         const response = await fetch('http://localhost:3333/files/browse', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ directory: directory }),
//             mode: "cors",
//             credentials: "include"
//         });

//         if (response.ok) {
//             const data = await response.json();
//             const content = data.content[0];
//             const dirData = JSON.parse(content.text);

//             currentDirectory = dirData.current_directory;
//             document.getElementById('currentDirPath').value = currentDirectory;

//             // Reset search box when navigating to a new directory
//             const searchBox1 = document.getElementById('searchBox1');
//             if (searchBox1) {
//                 searchBox1.value = '';
//             }

//             const parentDirBtn = document.getElementById('parentDirBtn');
//             parentDirBtn.disabled = (currentDirectory === dirData.parent_directory);

//             const fileList = document.getElementById('dirFileList');
//             fileList.innerHTML = ''; // Clear previous list

//             // Only show directories in the directory browser
//             const directories = dirData.items.filter(item => item.isDirectory);
//             directories.sort((a, b) => a.name.localeCompare(b.name));

//             directories.forEach(item => {
//                 const fileItem = document.createElement('div');
//                 fileItem.className = 'file-item';
//                 fileItem.innerHTML = `
//                     <div class="file-icon">${item.isDirectory ? '📁' : '📄'}</div>
//                     <div class="file-name">${item.name}</div>
//                     <div class="file-size">${item.isDirectory ? '' : formatFileSize(item.size)}</div>
//                 `;

//                 fileItem.addEventListener('click', () => {
//                     selectDirectoryForChange(item.path, fileItem);
//                 });

//                 if (item.isDirectory) {
//                     fileItem.addEventListener('dblclick', () => loadDirectoryForChange(item.path));
//                     fileItem.title = `Double-click to open '${item.name}'`;
//                 } else {
//                     fileItem.title = `Select file '${item.name}'`;
//                 }

//                 fileList.appendChild(fileItem);
//             });
//         } else {
//             console.error('Failed to load directory:', response.statusText);
//             alert('Error: Could not load directory contents.');
//         }
//     } catch (error) {
//         console.error('Error loading directory:', error);
//         alert('An error occurred while trying to connect to the server.');
//     }
// }

// // Function to handle directory selection
// function selectDirectoryForChange(dirPath, element) {
//     console.log("check select")
//     console.log(dirPath)
//     console.log(element)
//     document.querySelectorAll('#dirFileList .file-item.selected').forEach(item => {
//         item.classList.remove('selected');
//     });
//     element.classList.add('selected');
//     selectedDirectoryPath = dirPath;
//     console.log(selectedDirectoryPath);
//     document.getElementById('changeBtn').disabled = false;
// }

// // Function to navigate to parent directory for change directory browser
// function navigateToParentDirectoryForChange() {
//     let path = currentDirectory.replace(/\\/g, '/');
//     if (path.length > 1 && path.endsWith('/')) {
//         path = path.slice(0, -1);
//     }

//     const lastSlashIndex = path.lastIndexOf('/');
//     if (lastSlashIndex === -1) {
//         loadDirectoryForChange('');
//         return;
//     }
    
//     if (lastSlashIndex === 0) {
//         loadDirectoryForChange('/');
//         return;
//     }

//     const parentDir = path.substring(0, lastSlashIndex);
    
//     if (/^[a-zA-Z]:$/.test(parentDir)) {
//         loadDirectoryForChange(parentDir + '/');
//     } else {
//         loadDirectoryForChange(parentDir);
//     }
// }

// // Function to navigate to home directory for change directory browser
// function navigateToHomeDirectoryForChange() {
//     loadDirectoryForChange('');
// }

// // Function to filter items in change directory browser
// function filterItemsForChange() {
//     const searchInput1 = document.getElementById('searchBox1');
//     if (!searchInput1) return;

//     const searchTerm = searchInput1.value.toLowerCase();
//     const items = document.querySelectorAll('#dirFileList .file-item');

//     items.forEach(item => {
//         const itemNameElement = item.querySelector('.file-name');
//         if (itemNameElement) {
//             const itemName = itemNameElement.textContent.toLowerCase();
//             // Show item if its name includes the search term
//             item.style.display = itemName.includes(searchTerm) ? 'flex' : 'none';
//         }
//     });
// }

// // Function to confirm directory change
// async function confirmDirectoryChange() {
//     console.log(selectedDirectoryPath);
//     if (selectedDirectoryPath) {
//         try {
//             const response = await fetch('http://localhost:3333/files/change_dir', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({
//                     new_path: selectedDirectoryPath,
//                 }),
//                 mode: "cors",
//                 credentials: "include"
//             });
            
//             const data = await response.json();
            
//             if (response.ok) {
//                 // Display success message
//                 displayMarkdownMessage(`Successfully changed directory to: ${selectedDirectoryPath}`, 'agent-message');
//             } else {
//                 // Display error message
//                 displayMarkdownMessage(`Error changing directory: ${data.error || 'Unknown error'}`, 'agent-message error-message');
//             }
//         } catch (error) {
//             console.error('Error changing directory:', error);
//             displayMarkdownMessage('An error occurred while changing directory.', 'agent-message error-message');
//         }

//         closeDirectoryBrowser();
//     }
// }


function startEditMessage(messageElement, originalText) {
    // 1. Save original content in case user cancels
    // We assume the messageElement contains just the text or simple HTML. 
    // If you have timestamps inside the div, you might need to target a specific inner-text span.
    const originalHTML = messageElement.innerHTML;
    const originalElement = messageElement.cloneNode(true);

    messageElement.classList.add('message-editing');

    // If this is a user-message, re-attach edit/copy button events
    if (originalElement.classList.contains('user-message')) {
        const editButton = originalElement.querySelector('.edit-button');
        const copyButton = originalElement.querySelector('.copy-button');
        if (editButton) {
            editButton.addEventListener('click', () => {
                startEditMessage(originalElement, originalText);
            });
            originalElement.addEventListener('mouseenter', () => {
                editButton.style.display = 'inline-flex';
            });
            originalElement.addEventListener('mouseleave', () => {
                editButton.style.display = 'none';
            });
        }
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(originalText).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            });
            originalElement.addEventListener('mouseenter', () => {
                copyButton.style.display = 'inline-flex';
            });
            originalElement.addEventListener('mouseleave', () => {
                copyButton.style.display = 'none';
            });
        }
    }

    // 2. Clear current message content
    // Clear and inject the editor
    messageElement.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'edit-form-container';
    container.innerHTML = `
        <textarea class="edit-textarea" rows="1"></textarea>
        <div class="edit-buttons">
            <button class="edit-btn edit-cancel">Cancel</button>
            <button class="edit-btn edit-submit">Save</button>
        </div>
    `;
    messageElement.appendChild(container);

    const textarea = container.querySelector('.edit-textarea');
    const submitBtn = container.querySelector('.edit-submit');
    const cancelBtn = container.querySelector('.edit-cancel');

    // Set initial text
    textarea.value = originalText;

    // --- CORE LOGIC: HEIGHT FIT TO LINES ---
    const autoResize = () => {
        // 1. Save the scroll position of the main window (or your chat container)
        // If your chat scrolls inside a specific div (e.g., messagesDiv), use that instead of window
        const scrollPos = messagesDiv.scrollY; 
        // const scrollPos = messagesDiv.scrollTop; // Use this if scrolling happens in a div

        // 2. Perform the resize (this causes the jump)
        textarea.style.height = 'auto'; 
        textarea.style.height = textarea.scrollHeight + 'px';

        // 3. Restore the scroll position immediately
        window.scrollTo(window.scrollX, scrollPos + 100);
        // messagesDiv.scrollTop = scrollPos; // Use this if scrolling happens in a div
    };

    // Trigger immediately to fit the original text
    autoResize();

    // Trigger on every character input
    textarea.addEventListener('input', autoResize);
    // ---------------------------------------

    textarea.focus({ preventScroll: true });
    // Move cursor to end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Handlers
    const handleCancel = () => {
        // messageElement.innerHTML = originalHTML;
        messageElement.replaceWith(originalElement);
        messageElement.classList.remove('message-editing');
    };

    const handleSubmit = async () => {
        const newText = textarea.value.trim();
        if (newText && newText !== originalText) {
            textarea.disabled = true;
            submitBtn.textContent = '...';
            await editMessage(messageElement, newText);
        } else {
            handleCancel();
        }
    };

    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); handleCancel(); });
    submitBtn.addEventListener('click', (e) => { e.stopPropagation(); handleSubmit(); });
    
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    });
}

// 1. New Helper Function: Deletes all siblings after a specific element
function removeMessagesBelow(element) {
    // While there is a next sibling, remove it
    while (element.nextElementSibling) {
        // Note: If your editDialog is appended to messagesDiv, 
        // this will remove it too, which is generally fine as the edit is finished.
        element.nextElementSibling.remove();
    }
}

// 2. Updated editMessage Function
async function editMessage(messageElement, newText) {
    try {
        // Get session info
        const sessionResponse = await fetch('/auth/session');
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.loggedIn || !sessionData.currChatId) {
            console.error('No active session or chat');
            return;
        }

        messageElement.classList.remove('message-editing');

        const html = markdown.render(newText);
        messageElement.style.display = 'block'; // Show loading state if needed
        messageElement.innerHTML = html;

        console.log('Editing message in chat ID:', sessionData.currChatId);
        console.log('Editing message Index:', getMessageIndex(messageElement));
        console.log('New message text:', newText);
        removeMessagesBelow(messageElement);
        window.messageElementStream = createMarkdownMessageStreamElement('agent-message')
        // Call edit message API
        const response = await fetch('/api/edit-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: sessionData.currChatId,
                messageIndex: getMessageIndex(messageElement),
                newMessage: newText,
                socketId: socket.id,
                requestId: socket.id + sessionData.currChatId
            })
        });
        
        if (response.ok) {
            // --- NEW CODE START ---
            // Remove all messages below the edited element immediately
            // removeMessagesBelow(messageElement);
            // --- NEW CODE END ---

            // Reload chat history to get new responses (and the updated current message)
            await loadChatHistory(sessionData.currChatId);
            
        } else {
            console.error('Failed to edit message');
            // Restore original display
            messageElement.style.display = '';
            messageElement.classList.remove('message-editing');
        }
    } catch (error) {
        console.error('Error editing message:', error);
        messageElement.style.display = '';
        messageElement.classList.remove('message-editing');
    }
}

// Function to get message index in chat
function getMessageIndex(messageElement) {
    const messages = Array.from(messagesDiv.children);
    return messages.indexOf(messageElement);
}


// Make functions globally accessible on the window object
window.openDirectoryBrowser = openDirectoryBrowser;
window.closeDirectoryBrowser = closeDirectoryBrowser;
window.navigateToParentDirectoryForChange = navigateToParentDirectoryForChange;
window.navigateToHomeDirectoryForChange = navigateToHomeDirectoryForChange;
window.confirmDirectoryChange = confirmDirectoryChange;
window.filterItemsForChange = filterItemsForChange;
window.selectDirectoryForChange = selectDirectoryForChange;

