import { response } from 'express';
import path from 'path';
import dotenv from "dotenv";
import FormData from 'form-data';
import * as fs from 'fs';
import { saveVerifiedAnswer, searchVerifiedAnswers, updateAnswerRating } from './db.js';
dotenv.config();
import fetch from 'node-fetch'; // Import the node-fetch library
// Download does not have a JSON response, it returns the file directly.
let io;
export async function GetSocketIO(ios) {
    io = ios;
    return true;
}
// Existing functions (IMG_Generate, getPage, etc.) remain the same...
async function IMG_Generate(prompt, img_url) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/Generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, img_url }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                },
                {
                    "type": "resource_link",
                    "text": data.data_path
                }
            ] };
        console.log('Generate Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error generating model:', error);
        throw error;
    }
}
async function getPage(url) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/GetPage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('GetPage Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error getting page:', error);
        throw error;
    }
}
async function clickElement(Id, Class, TagName) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/Click`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ Id, Class, TagName }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('Click Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error clicking element:', error);
        throw error;
    }
}
async function getSourcePage() {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/GetSourcePage`, {
            method: 'GET', // Or 'POST' if you strictly want to use POST, but GET is more idiomatic here
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('GetSourcePage Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error getting source page:', error);
        throw error;
    }
}
async function getTextPage() {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/GetTextPage`, {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('GetTextPage Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error getting text page:', error);
        throw error;
    }
}
async function getData(prompt, k) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/GetData`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, k }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.retrieved_docs
                }
            ] };
        console.log('GetData Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error getting data:', error);
        throw error;
    }
}
async function searchById(id, className, tagName, text) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/Search_By_ID`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ Id: id, Class: className, TagName: tagName, text }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('Search_By_ID Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error searching by ID:', error);
        throw error;
    }
}
async function searchByDuckDuckGo(query, maxResults) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/Search_By_DuckDuckGo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, max_results: maxResults }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [
                {
                    "type": "string",
                    "text": data.result
                }
            ] };
        console.log('Search_By_DuckDuckGo Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error searching by DuckDuckGo:', error);
        throw error;
    }
}
// === File/Image/Table Cleanup & Processing ===
// Function to organize files for model processing
async function organizeFilesForProcessing(filePaths) {
    const organized = {
        images: [],
        tables: [],
        documents: [],
        other: []
    };
    for (const filePath of filePaths) {
        const ext = filePath.toLowerCase().split('.').pop() || '';
        // Image files
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
            organized.images.push(filePath);
        }
        // Table/Spreadsheet files
        else if (['csv', 'xlsx', 'xls', 'json'].includes(ext)) {
            organized.tables.push(filePath);
        }
        // Document files
        else if (['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext)) {
            organized.documents.push(filePath);
        }
        // Other files
        else {
            organized.other.push(filePath);
        }
    }
    return organized;
}
// Function to prepare file metadata for model
async function prepareFileMetadata(filePaths) {
    const metadata = [];
    for (const filePath of filePaths) {
        try {
            const stat = fs.statSync(filePath);
            const fileName = path.basename(filePath);
            const ext = fileName.split('.').pop() || 'unknown';
            metadata.push({
                name: fileName,
                path: filePath,
                size: stat.size,
                type: getFileType(ext),
                extension: ext,
                createdAt: stat.birthtime,
                modifiedAt: stat.mtime
            });
        }
        catch (error) {
            console.error(`Error reading file metadata for ${filePath}:`, error);
        }
    }
    return metadata;
}
// Helper function to determine file type
function getFileType(ext) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const tableExts = ['csv', 'xlsx', 'xls', 'json'];
    const docExts = ['pdf', 'docx', 'doc', 'txt', 'md', 'odt', 'rtf'];
    if (imageExts.includes(ext.toLowerCase()))
        return 'image';
    if (tableExts.includes(ext.toLowerCase()))
        return 'table';
    if (docExts.includes(ext.toLowerCase()))
        return 'document';
    return 'file';
}
// Function to cleanup and format file content for processing
async function cleanupFileForModel(filePath) {
    try {
        const ext = filePath.toLowerCase().split('.').pop() || '';
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        if (['csv', 'json'].includes(ext)) {
            // For CSV/JSON: parse and format as structured data
            if (ext === 'csv') {
                const lines = fileContent.split('\n').filter(l => l.trim());
                return `[CSV File: ${path.basename(filePath)}]\n${lines.join('\n')}`;
            }
            else if (ext === 'json') {
                try {
                    const parsed = JSON.parse(fileContent);
                    return `[JSON File: ${path.basename(filePath)}]\n${JSON.stringify(parsed, null, 2)}`;
                }
                catch {
                    return fileContent;
                }
            }
        }
        if (['txt', 'md'].includes(ext)) {
            // For text files: clean up whitespace
            return fileContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n');
        }
        return fileContent;
    }
    catch (error) {
        console.error(`Error cleaning up file ${filePath}:`, error);
        return '';
    }
}
// Function to prepare files summary for model context
async function prepareFileSummaryForModel(filePaths) {
    let summary = '';
    const organized = await organizeFilesForProcessing(filePaths);
    if (organized.images.length > 0) {
        summary += `\n📷 Images (${organized.images.length}): ${organized.images.map(p => path.basename(p)).join(', ')}\n`;
    }
    if (organized.tables.length > 0) {
        summary += `📊 Tables/Data (${organized.tables.length}): ${organized.tables.map(p => path.basename(p)).join(', ')}\n`;
    }
    if (organized.documents.length > 0) {
        summary += `📄 Documents (${organized.documents.length}): ${organized.documents.map(p => path.basename(p)).join(', ')}\n`;
    }
    if (organized.other.length > 0) {
        summary += `📦 Other Files (${organized.other.length}): ${organized.other.map(p => path.basename(p)).join(', ')}\n`;
    }
    return summary;
}
async function processFiles(text, filePaths, userId, chatHistoryId) {
    try {
        // Step 1: Organize files by type
        const organized = await organizeFilesForProcessing(filePaths);
        console.log('Organized files:', organized);
        // Step 2: Prepare file metadata
        const metadata = await prepareFileMetadata(filePaths);
        console.log('File metadata:', metadata);
        // Step 3: Create form data with organized structure
        const formData = new FormData();
        formData.append('text', text);
        formData.append('user_id', userId);
        formData.append('chat_history_id', chatHistoryId);
        formData.append('file_metadata', JSON.stringify(metadata));
        // Step 4: Process each file type appropriately
        for (const filePath of filePaths) {
            const fileName = path.basename(filePath);
            const fileType = getFileType(filePath.split('.').pop() || '');
            try {
                // For documents and text files, add cleaned content
                if (['document', 'table'].includes(fileType) && fs.existsSync(filePath)) {
                    const cleanContent = await cleanupFileForModel(filePath);
                    formData.append(`${fileType}_content`, cleanContent, { filename: fileName });
                }
                // For images, add the file directly
                if (fileType === 'image' && fs.existsSync(filePath)) {
                    const fileStream = fs.createReadStream(filePath);
                    formData.append('images', fileStream, { filename: fileName });
                }
                // For all files, add the file stream
                const fileStream = fs.createReadStream(filePath);
                formData.append('files', fileStream, { filename: fileName });
            }
            catch (err) {
                console.error(`Error adding file ${fileName} to form data:`, err);
            }
        }
        // Step 5: Send organized data to API server
        const response = await fetch(`${process.env.API_SERVER_URL}/process`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [{ "type": "string", "text": data.reply }] };
        console.log('Process Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error processing files:', error);
        throw error;
    }
}
async function searchSimilar(query, userId, chatHistoryId, topK = 5) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/search_similar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, user_id: userId, chat_history_id: chatHistoryId, top_k: topK }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const output = { "content": [{ "type": "string", "text": data.results }] };
        console.log('Search Similar Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error searching similar documents:', error);
        throw error;
    }
}
// --- NEW FILE API FUNCTIONS ---
function emitWithAck(socket, toolName, toolParameters) {
    console.log(`CallTool from server to local : ${toolName}`);
    return new Promise((resolve, reject) => {
        if (toolName == "ExecuteCommand" && toolParameters.wait == "True") {
            socket.timeout(1000000).emit("CallTool", toolName, toolParameters, (err, response) => {
                if (err) {
                    return reject(err);
                }
                resolve(response);
            });
        }
        else {
            socket.timeout(10000).emit("CallTool", toolName, toolParameters, (err, response) => {
                if (err) {
                    return reject(err);
                }
                resolve(response);
            });
        }
        ;
    });
}
/**
 * Sends a request to the client to capture a screenshot and waits for the base64 image data.
 * @param socket The client's Socket.IO socket object.
 * @returns A promise that resolves with the base64 image data.
 */
async function RequestScreenshot(socket) {
    try {
        console.log(`Requesting screenshot from client ${socket.id}...`);
        // 1. Use the existing emitWithAck mechanism to call a client-side function named 'TakeScreenshot'
        // The server waits for the client to call the callback function passed to its 'CallTool' listener.
        const responseData = await emitWithAck(socket, 'TakeScreenshot', {});
        console.log("Screenshot received from client, size:", responseData.imageData.length, "bytes");
        // 2. Process the received data (e.g., save it, or pass the base64 string to the LLM)
        // For demonstration, we'll return the base64 string and a message.
        // NOTE: If you need to save the file on the server, you would do the base64 decoding and fs.writeFileSync here.
        // Return a structured response (resultsT)
        const output = {
            "content": [
                {
                    "type": "string",
                    "text": `Screenshot captured successfully. Data length: ${responseData.imageData.length}.`
                },
                {
                    "type": "resource_data", // A new type to indicate base64 image data
                    "text": responseData.imageData
                }
            ]
        };
        return output;
    }
    catch (error) {
        console.error('Error in RequestScreenshot:', error);
        const output = {
            "content": [
                {
                    "type": "string",
                    "text": `Error capturing screenshot: ${error instanceof Error ? error.message : String(error)}`
                }
            ]
        };
        return output;
    }
}
// async function ListFiles() {
//     try {
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/list`, {
//             method: 'GET',
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultListFiles;
//         const output: resultsT = { "content": [{ "type": "string", "text": `Message: ${data.message}\nFiles: ${data.data.files.join(', ')}` }] };
//         console.log('ListFiles Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error listing files:', error);
//         throw error;
//     }
// }
// async function ReadFile(fileName: string, startLine?: number, endLine?: number) {
//     try {
//         const body: { file_name: string; start_line?: number; end_line?: number } = { file_name: fileName };
//         if (startLine !== undefined) body.start_line = startLine;
//         if (endLine !== undefined) body.end_line = endLine;
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/read`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(body),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultReadFile;
//         const content = data.data.content || (data.data.lines || []).join('\n');
//         const output: resultsT = { "content": [{ "type": "string", "text": `Message: ${data.message}\nContent:\n${content}` }] };
//         console.log('ReadFile Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error reading file:', error);
//         throw error;
//     }
// }
// async function EditFile(fileName: string, text: string, startLine?: number, endLine?: number) {
//     try {
//         const body: { file_name: string; text: string; start_line?: number; end_line?: number } = { file_name: fileName, text };
//         if (startLine !== undefined) body.start_line = startLine;
//         if (endLine !== undefined) body.end_line = endLine;
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/edit`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(body),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultEditFile;
//         const output: resultsT = { "content": [{ "type": "string", "text": data.message }] };
//         console.log('EditFile Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error editing file:', error);
//         throw error;
//     }
// }
// async function CreateFile(fileName: string, text?: string) {
//     try {
//         const body: { file_name: string; text?: string } = { file_name: fileName };
//         if (text !== undefined) body.text = text;
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/create`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(body),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultCreateFile;
//         const output: resultsT = { "content": [{ "type": "string", "text": data.message }] };
//         console.log('CreateFile Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error creating file:', error);
//         throw error;
//     }
// }
// async function DeleteFile(fileName: string) {
//     try {
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/delete`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ file_name: fileName }),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultDeleteFile;
//         const output: resultsT = { "content": [{ "type": "string", "text": data.message }] };
//         console.log('DeleteFile Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error deleting file:', error);
//         throw error;
//     }
// }
// async function DownloadFile(fileName: string, destinationPath: string) {
//     try {
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/download`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ file_name: fileName }),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const fileStream = fs.createWriteStream(destinationPath);
//         await new Promise<void>((resolve, reject) => {
//             response.body!.pipe(fileStream);
//             response.body!.on('error', reject);
//             fileStream.on('finish', () => resolve());
//         });
//         const successMessage = `File '${fileName}' downloaded successfully to '${destinationPath}'.`;
//         const output: resultsT = { "content": [{ "type": "string", "text": successMessage }] };
//         console.log(successMessage);
//         return output;
//     } catch (error) {
//         console.error('Error downloading file:', error);
//         throw error;
//     }
// }
// --- END NEW FILE API FUNCTIONS ---
async function AttemptCompletion(result, command) {
    const output = { "content": [{ "type": "string", "text": result }] };
    console.log('AttemptCompletion Response:', result);
    return output;
}
async function AskFollowupQuestion(question, follow_up) {
    // Assuming follow_up is an object/array that can be stringified
    const followUpText = typeof follow_up === 'object' ? JSON.stringify(follow_up, null, 2) : follow_up;
    const output = { "content": [
            { "type": "string", "text": `Question: ${question}` },
            { "type": "string", "text": `Suggestions: ${followUpText}` }
        ] };
    console.log('AskFollowupQuestion Response:', question);
    return output;
}
async function CreateFolder(folderName) {
    try {
        const response = await fetch(`${process.env.API_SERVER_URL}/files/create_folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_name: folderName }),
        });
        if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json(); // Assuming you'll define ResultCreateFolder
        const output = { "content": [{ "type": "string", "text": data.message }] };
        console.log('CreateFolder Response:', data);
        return output;
    }
    catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
}
/**
 * Dynamically calls a tool function based on its name and parameters.
 */
export async function callToolFunction(toolName, toolParameters, socketId) {
    console.log(`Attempting to call tool: ${toolName} with parameters:`, toolParameters);
    const socket = io.sockets.sockets.get(socketId);
    if (socket == undefined) {
        return console.error(`can not find socket`);
    }
    switch (toolName) {
        // ... existing cases
        case 'IMG_Generate':
            return await IMG_Generate(toolParameters.prompt.toString(), toolParameters.img_url);
        case 'GetPage':
            return await getPage(toolParameters.url);
        case 'ClickElement':
            return await clickElement(toolParameters.Id || '', toolParameters.Class || '', toolParameters.TagName || '');
        case 'GetSourcePage':
            return await getSourcePage();
        case 'GetTextPage':
            return await getTextPage();
        case 'GetData':
            return await getData(toolParameters.prompt, toolParameters.k);
        case 'SearchByID':
            return await searchById(toolParameters.Id || '', toolParameters.Class || '', toolParameters.TagName || '', toolParameters.text || '');
        case 'SearchByDuckDuckGo':
            return await searchByDuckDuckGo(toolParameters.query, toolParameters.max_results);
        case 'ProcessFiles':
            return await processFiles(toolParameters.text, toolParameters.filePaths, toolParameters.userId, toolParameters.chatHistoryId);
        case 'SearchSimilar':
            const topK = typeof toolParameters.topK === 'number' ? toolParameters.topK : 5;
            return await searchSimilar(toolParameters.query, toolParameters.userId, toolParameters.chatHistoryId, topK);
        // --- SYSTEM INFORMATION ---
        case 'GetSystemInformation':
            {
                const response = await emitWithAck(socket, toolName, toolParameters);
                console.log("\n\n\n\n------------------- System Information -------------------\n:", response, "\n-------------------------- End ---------------------------\n\n\n\n");
                return response;
            }
        // --- NEW FILE TOOL CASES ---
        case 'ListFiles':
            //socket?.emit('StreamText', out_res);
            {
                const response = await emitWithAck(socket, toolName, toolParameters);
                console.log("Response from server:", response);
                return response;
            }
        // return await ListFiles();
        case 'ReadFile': {
            if (typeof toolParameters.file_name !== 'string')
                throw new Error('ReadFile requires a file_name.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // return await ReadFile(toolParameters.file_name, toolParameters.start_line, toolParameters.end_line);
        case 'EditFile': {
            if (typeof toolParameters.file_name !== 'string')
                throw new Error('EditFile requires file_name and text.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // return await EditFile(toolParameters.file_name, toolParameters.text, toolParameters.start_line, toolParameters.end_line);
        case 'CreateFile':
            if (typeof toolParameters.file_name !== 'string')
                throw new Error('CreateFile requires a file_name.');
            let fileContent = '';
            if (toolParameters.text !== undefined) {
                // Check if text is already a string
                if (typeof toolParameters.text === 'string') {
                    fileContent = toolParameters.text;
                }
                else if (typeof toolParameters.text === 'object' && toolParameters.text !== null) {
                    // If it's an object, stringify it.
                    // You might need more specific logic here if the object format is complex.
                    // For example, if it's { html: "<div>..." }, you'd use toolParameters.text.html
                    // For a generic object, JSON.stringify is a fallback.
                    fileContent = JSON.stringify(toolParameters.text, null, 2); // Pretty print for readability
                    // If the object structure is specifically { html: "your_html_string_here" }
                    // then use:
                    // if (typeof toolParameters.text.html === 'string') {
                    //     fileContent = toolParameters.text.html;
                    // } else {
                    //     fileContent = JSON.stringify(toolParameters.text, null, 2);
                    // }
                }
                // If it's some other type, you might want to throw an error or handle it differently.
                let New_toolParameters = { file_name: toolParameters.file_name, text: fileContent };
                const response = await emitWithAck(socket, toolName, New_toolParameters);
                console.log("Response from server:", response);
                return response;
            }
        // return await CreateFile(toolParameters.file_name, fileContent);
        case 'DeleteFile': {
            if (typeof toolParameters.file_name !== 'string')
                throw new Error('DeleteFile requires a file_name.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // return await DeleteFile(toolParameters.file_name);
        case 'DownloadFile': {
            if (typeof toolParameters.file_name !== 'string' || typeof toolParameters.destination_path !== 'string')
                throw new Error('DownloadFile requires file_name and a destination_path.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // return await DownloadFile(toolParameters.file_name, toolParameters.destination_path);
        case 'CreateFolder': { // Add this new case!
            if (typeof toolParameters.folder_name !== 'string')
                throw new Error('CreateFolder requires a folder_name.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // return await CreateFolder(toolParameters.folder_name);
        case 'ChangeDirectory': {
            if (typeof toolParameters.new_path !== 'string')
                throw new Error('ChangeDirectory requires a new_path.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        case 'ExecuteCommand': {
            if (typeof toolParameters.command !== 'string' || typeof toolParameters.wait !== 'string')
                throw new Error('CMD requires a command.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        case 'CurrentDirectory': {
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        // --- END NEW FILE TOOL CASES ---
        // --- NEW SCREENSHOT TOOL CASE ---
        case 'RequestScreenshot': // New case
            if (!socket)
                throw new Error('Socket not found for RequestScreenshot.');
            return await RequestScreenshot(socket);
        case 'findObjectOnScreen': {
            if (typeof toolParameters.object_prompt !== 'string')
                throw new Error('findObjectOnScreen requires an object_prompt.');
            // Use request screenshot first
            const screenshotResponse = await RequestScreenshot(socket);
            // Now call findObjectOnScreen with the screenshot data
            // const response = await findObjectOnScreen(toolParameters.object_prompt, screenshotResponse);
            return response;
        }
        case 'clickObjectOnScreen': {
            if (typeof toolParameters.object_location !== 'string')
                throw new Error('clickObjectOnScreen requires an object_location.');
            const response = await emitWithAck(socket, toolName, toolParameters);
            console.log("Response from server:", response);
            return response;
        }
        case 'findObjectOnScreenAndClick': {
            if (typeof toolParameters.object_prompt !== 'string')
                throw new Error('findObjectOnScreenAndClick requires an object_prompt.');
            // Use request screenshot first
            const screenshotResponse = await RequestScreenshot(socket);
            // Now call findObjectOnScreen with the screenshot data
            // const findResponse = await findObjectOnScreen(toolParameters.object_prompt, screenshotResponse);
            // Then click at the found location
            // const clickResponse = await clickObjectOnScreen(findResponse.location);
            return response;
        }
        // --- END NEW SCREENSHOT_TOOL CASE ---
        case 'attempt_completion':
            if (typeof toolParameters.command == 'string') {
                const response = await emitWithAck(socket, 'ExecuteCommand', toolParameters);
                console.log("Response from server:", response);
                return response;
            }
            else {
                return await AttemptCompletion(toolParameters.result, toolParameters.command || '');
            }
        case 'ask_followup_question':
            return await AskFollowupQuestion(toolParameters.question, toolParameters.follow_up);
        // --- Verified Answers Tool Cases ---
        case 'SearchVerifiedAnswers':
            if (!Array.isArray(toolParameters.question_embedding))
                throw new Error('SearchVerifiedAnswers requires question_embedding array.');
            return await SearchVerifiedAnswers(toolParameters.question_embedding, toolParameters.threshold || 0.7, toolParameters.limit || 5);
        case 'SaveVerifiedAnswer':
            if (typeof toolParameters.question !== 'string' || typeof toolParameters.answer !== 'string') {
                throw new Error('SaveVerifiedAnswer requires question and answer.');
            }
            return await SaveVerifiedAnswer(toolParameters.question, toolParameters.answer, toolParameters.question_embedding, toolParameters.user_id, toolParameters.rating, toolParameters.commenter_name);
        default:
            throw new Error(`Tool function '${toolName}' not found.`);
    }
}
// === Verified Answers Functions ===
async function SearchVerifiedAnswers(questionEmbedding, threshold = 0.7, limit = 5) {
    try {
        const results = await searchVerifiedAnswers(questionEmbedding, threshold, limit);
        return {
            success: true,
            results: results.map(r => ({
                id: r.id,
                question: r.question,
                answer: r.answer,
                rating: r.avg_rating,
                verified_count: r.verified_count,
                similarity: r.similarity
            }))
        };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
async function SaveVerifiedAnswer(question, answer, questionEmbedding, userId, rating = 1, commenterName = 'Anonymous') {
    try {
        const result = await saveVerifiedAnswer(question, answer, questionEmbedding, userId, rating, commenterName);
        await updateAnswerRating(result.answerId);
        return { success: true, answerId: result.answerId };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
