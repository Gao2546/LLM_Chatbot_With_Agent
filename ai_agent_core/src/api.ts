import express, { Request, response, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import { Server as SocketIOServer, Socket } from 'socket.io';
import path from 'path';
import dotenv from "dotenv";
import { Readable } from 'stream';
import FormData from 'form-data';
import * as fs from 'fs';
// import { saveVerifiedAnswer, searchVerifiedAnswers, getAnswerVerifications } from './db.js';


dotenv.config();

import { fileURLToPath } from 'url';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleGenAI } from "@google/genai";
import fetch from 'node-fetch'; // Import the node-fetch library
// import * as cheerio from 'cheerio';   // Import cheerio
import { parseStringPromise } from 'xml2js';
// import { Ollama } from 'ollama';

// import bcrypt from 'bcrypt';
import { setChatMode, setChatModel, getChatMode, getChatModel } from './db.js'; // Import necessary DB functions
import pool, { createUser, getUserByUsername, newChatHistory, storeChatHistory, readChatHistory, deleteChatHistory, setCurrentChatId, listChatHistory, getUserActiveStatus, setUserActiveStatus } from './db.js';
import { text } from 'stream/consumers';
// import { Socket } from 'socket.io-client';


type resultsT = {
  content: { // This means an object with 'type' and 'text' properties
    type: string;
    text?: string;
    metadata?: Object;
  }[]; // This means an array of the above objects (can have 0, 1, or many)
};

// --- Existing Type Definitions ---
export type ResultIMG_Generate = { result: string; data_path?: string; };
export type ResultGetPage = { result: string; };
export type ResultClick = { result: string; };
export type ResultGetSourcePage = { result: string; };
export type ResultGetTextPage = { result: string; };
export type ResultGetData = { retrieved_docs: string; };
export type ResultSearchByID = { result: string; };
export type ResultSearchByDuckDuckGo = { result: string; };
export type ResultProcess = { reply: string; };
export type ResultSearchSimilar = { results: string; };
export type AttemptCompletion = { results: string; };

// --- New Type Definitions for File API ---
export type ResultListFiles = { data: { files: string[] }, message: string };
export type ResultReadFile = { data: { content?: string, lines?: string[] }, message: string };
export type ResultEditFile = { data: null, message: string };
export type ResultCreateFile = { data: null, message: string };
export type ResultDeleteFile = { data: null, message: string };
export type ResultCreateFolder = { message: string };
// Download does not have a JSON response, it returns the file directly.

let io:SocketIOServer;
export async function GetSocketIO(ios:SocketIOServer) {
  io = ios;
  return true;
}


// Existing functions (IMG_Generate, getPage, etc.) remain the same...

async function IMG_Generate(prompt: string | number, img_url: string) {
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

    const data = await response.json() as ResultIMG_Generate;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                },
                                {
                                    "type": "resource_link",
                                    "text": data.data_path!
                                }]}
    console.log('Generate Response:', data);
    return output;
  } catch (error) {
    console.error('Error generating model:', error);
    throw error;
  }
}

async function getPage(url: string) {
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

    const data = await response.json() as ResultGetPage;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }]}
    console.log('GetPage Response:', data);
    return output;
  } catch (error) {
    console.error('Error getting page:', error);
    throw error;
  }
}

async function clickElement(Id: string, Class: string, TagName: string) {
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

    const data = await response.json() as ResultClick;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }]}
    console.log('Click Response:', data);
    return output;
  } catch (error) {
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

    const data = await response.json() as ResultGetSourcePage;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }
                                ]}
    console.log('GetSourcePage Response:', data);
    return output;
  } catch (error) {
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

    const data = await response.json() as ResultGetTextPage;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }
                                ]}
    console.log('GetTextPage Response:', data);
    return output;
  } catch (error) {
    console.error('Error getting text page:', error);
    throw error;
  }
}

async function getData(prompt: string, k: number) {
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

    const data = await response.json() as ResultGetData;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.retrieved_docs
                                }]}
    console.log('GetData Response:', data);
    return output;
  } catch (error) {
    console.error('Error getting data:', error);
    throw error;
  }
}

async function searchById(id: string, className: string, tagName: string, text: string) {
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

    const data = await response.json() as ResultSearchByID;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }
                                ]}
    console.log('Search_By_ID Response:', data);
    return output;
  } catch (error) {
    console.error('Error searching by ID:', error);
    throw error;
  }
}

async function searchByDuckDuckGo(query: string, maxResults: number) {
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

    const data = await response.json() as ResultSearchByDuckDuckGo;
    const output : resultsT = {"content": [
                                {
                                    "type": "string",
                                    "text": data.result
                                }
                                ]}
    console.log('Search_By_DuckDuckGo Response:', data);
    return output;
  } catch (error) {
    console.error('Error searching by DuckDuckGo:', error);
    throw error;
  }
}

// === File/Image/Table Cleanup & Processing ===
// Function to organize files for model processing
async function organizeFilesForProcessing(filePaths: string[]) {
  const organized = {
    images: [] as string[],
    tables: [] as string[],
    documents: [] as string[],
    other: [] as string[]
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
async function prepareFileMetadata(filePaths: string[]) {
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
    } catch (error) {
      console.error(`Error reading file metadata for ${filePath}:`, error);
    }
  }

  return metadata;
}

// Helper function to determine file type
function getFileType(ext: string): string {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const tableExts = ['csv', 'xlsx', 'xls', 'json'];
  const docExts = ['pdf', 'docx', 'doc', 'txt', 'md', 'odt', 'rtf'];
  
  if (imageExts.includes(ext.toLowerCase())) return 'image';
  if (tableExts.includes(ext.toLowerCase())) return 'table';
  if (docExts.includes(ext.toLowerCase())) return 'document';
  return 'file';
}

// Function to cleanup and format file content for processing
async function cleanupFileForModel(filePath: string): Promise<string> {
  try {
    const ext = filePath.toLowerCase().split('.').pop() || '';
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    if (['csv', 'json'].includes(ext)) {
      // For CSV/JSON: parse and format as structured data
      if (ext === 'csv') {
        const lines = fileContent.split('\n').filter(l => l.trim());
        return `[CSV File: ${path.basename(filePath)}]\n${lines.join('\n')}`;
      } else if (ext === 'json') {
        try {
          const parsed = JSON.parse(fileContent);
          return `[JSON File: ${path.basename(filePath)}]\n${JSON.stringify(parsed, null, 2)}`;
        } catch {
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
  } catch (error) {
    console.error(`Error cleaning up file ${filePath}:`, error);
    return '';
  }
}

// Function to prepare files summary for model context
async function prepareFileSummaryForModel(filePaths: string[]): Promise<string> {
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


// upload files and process with simple method (can be used for both chat dialog and process file dialog, just need to pass the file paths and other parameters)
async function processFiles(text: string, filePaths: string[], userId: string, chatHistoryId: string) {
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
      } catch (err) {
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

    const data = await response.json() as ResultProcess;
    const output : resultsT = {"content": [{ "type": "string", "text": data.reply }]};
    console.log('Process Response:', data);
    return output;
  } catch (error) {
    console.error('Error processing files:', error);
    throw error;
  }
}

async function searchSimilar(query: string, userId: string, chatHistoryId: string, topK: number = 5) {
  try {
    const response = await fetch(`${process.env.API_SERVER_URL}/search_similar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id: userId, chat_history_id: chatHistoryId, top_k: topK }),
    });

    if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }

    const data = await response.json() as ResultSearchSimilar;
    const output : resultsT = {"content": [{ "type": "string", "text": data.results }]};
    console.log('Search Similar Response:', data);
    return output;
  } catch (error) {
    console.error('Error searching similar documents:', error);
    throw error;
  }
}

// --- NEW FILE API FUNCTIONS ---

function emitWithAck<T = any>(socket: Socket, toolName: string, toolParameters: {[text:string]:any}): Promise<T> {
  console.log(`CallTool from server to local : ${toolName}`);
  return new Promise((resolve, reject) => {
    if (toolName == "ExecuteCommand" && toolParameters.wait == "True"){
      socket.timeout(1000000).emit("CallTool" ,toolName, toolParameters, (err: Error, response: T) => {
        if (err) {
          return reject(err);
        }
        resolve(response);
      });
    }
    else
    {
      socket.timeout(1000000).emit("CallTool" ,toolName, toolParameters, (err: Error, response: T) => {
        if (err) {
          return reject(err);
        }
        resolve(response);
      });
    };
  });
}

// New Type Definition for the screenshot result (must match client's callback data structure)
// The client will return an object with a base64 'imageData' string.
export type ResultTakeScreenshot = { 
    imageData: string; 
    message: string;   
    metadata?: {
        width: number;
        height: number;
        sizeBytes: number;
        mimeType: string;
    };
};

async function TakeScreenshotSocket(socket: Socket, target_application?: string): Promise<resultsT> {
    try {
        console.log(`Requesting screenshot from client ${socket.id}...`);
        const responseData = await emitWithAck<ResultTakeScreenshot>(socket, 'TakeScreenshot', { target_application }); 
        console.log("Screenshot received from client, size:", responseData.imageData?.length || 0, "bytes");

        const output: resultsT = {
            "content": [
                {
                    "type": "string",
                    "text": responseData.message || "Screenshot captured successfully."
                },
                {
                    "type": "resource_data", 
                    "text": responseData.imageData 
                },
                {
                    "type": "object",
                    "metadata": {
                        "width": responseData.metadata?.width || 0,
                        "height": responseData.metadata?.height || 0,
                        "sizeBytes": responseData.metadata?.sizeBytes || 0,
                        "mimeType": responseData.metadata?.mimeType || "image/png"
                    }
                }

            ]
        };
        return output;
    } catch (error) {
        console.error('Error in TakeScreenshot:', error);
        return {
            "content": [{
                "type": "string",
                "text": `Error capturing screenshot: ${error instanceof Error ? error.message : String(error)}`
            }]
        };
    }
}

// Assuming resultsT looks something like this based on your TakeScreenshotSocket function:
type resultsCoordinateT = {
    content: Array<{
        type: string;
        text?: string;
        metadata?: any;
    }>;
};

async function LocateElement(Image: string, prompt: string, Metadata: any): Promise<resultsCoordinateT> {
  try { 
    console.log(`Requesting location for element: '${prompt}'...`);
    
    // Note: Payload keys must match the Flask endpoint exactly
    const payload = {
        image_base64: Image,
        element_description: prompt
    };

    const response = await fetch(`${process.env.API_SERVER_URL}/locate_element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) { 
        const errData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(`HTTP error! status: ${response.status}, message: ${errData.error || response.statusText}`); 
    }

    const data = await response.json() as { status: string; location?: [number, number, number, number]; raw_response?: string; message?: string };

    if (data.status === "success" && data.location) {
        // AI returns normalized coordinates [x_min, y_min, x_max, y_max] between 0 and 1
        const [nx1, ny1, nx2, ny2] = data.location;
        
        // Convert to absolute pixel coordinates using the screenshot metadata
        const x1 = Math.round(nx1 * Metadata.width);
        const y1 = Math.round(ny1 * Metadata.height);
        const x2 = Math.round(nx2 * Metadata.width);
        const y2 = Math.round(ny2 * Metadata.height);

        // Calculate the center point (useful for clicking!)
        const centerX = Math.round((x1 + x2) / 2);
        const centerY = Math.round((y1 + y2) / 2);

        return {
            content: [
                {
                    type: "string",
                    text: `Successfully located '${prompt}'. Absolute pixels: [${x1}, ${y1}, ${x2}, ${y2}]. Center: (${centerX}, ${centerY})`
                },
                {
                    type: "object",
                    metadata: {
                        normalized_location: [nx1, ny1, nx2, ny2],
                        absolute_location: [x1, y1, x2, y2],
                        center_point: [centerX, centerY],
                        width: x2 - x1,
                        height: y2 - y1
                    }
                }
            ]
        };
    } else {
        return {
            content: [{
                type: "string",
                text: `Failed to locate element: ${data.message || "Unknown error"}`
            }]
        };
    }

  } catch (error) {
    console.error('Error in VLM endpoint:', error);
    return {
        content: [{
            type: "string",
            text: `Error locating element: ${error instanceof Error ? error.message : String(error)}`
        }]
    };
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


async function AttemptCompletion(result: string, command: string) {
    const output : resultsT = {"content": [{ "type": "string", "text": result }]};                            
    console.log('AttemptCompletion Response:', result);
    return output;
}

async function AskFollowupQuestion(question: string, follow_up: any) {
    // Assuming follow_up is an object/array that can be stringified
    const followUpText = typeof follow_up === 'object' ? JSON.stringify(follow_up, null, 2) : follow_up;
    const output : resultsT = {"content": [
        { "type": "string", "text": `Question: ${question}`},
        { "type": "string", "text": `Suggestions: ${followUpText}`}
    ]};                            
    console.log('AskFollowupQuestion Response:', question);
    return output;
}

// async function CreateFolder(folderName: string) {
//     try {
//         const response = await fetch(`${process.env.API_SERVER_URL}/files/create_folder`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ folder_name: folderName }),
//         });
//         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json() as ResultCreateFolder; // Assuming you'll define ResultCreateFolder
//         const output: resultsT = { "content": [{ "type": "string", "text": data.message }] };
//         console.log('CreateFolder Response:', data);
//         return output;
//     } catch (error) {
//         console.error('Error creating folder:', error);
//         throw error;
//     }
// }

/**
 * Dynamically calls a tool function based on its name and parameters.
 */
export async function callToolFunction(toolName: string, toolParameters: { [key: string]: any }, socketId:string): Promise<any> {
  console.log(`Attempting to call tool: ${toolName} with parameters:`, toolParameters);
  const socket = io.sockets.sockets.get(socketId);

  if (socket == undefined){
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
    case 'ProcessFiles': // upload files and process with simple method (can be used for both chat dialog and process file dialog, just need to pass the file paths and other parameters)
        return await processFiles(toolParameters.text, toolParameters.filePaths, toolParameters.userId, toolParameters.chatHistoryId);
    case 'SearchSimilar':
        const topK = typeof toolParameters.topK === 'number' ? toolParameters.topK : 5;
        return await searchSimilar(toolParameters.query, toolParameters.userId, toolParameters.chatHistoryId, topK);

    // --- SYSTEM INFORMATION ---
    case 'GetSystemInformation':
      {
        const response = await emitWithAck(socket, toolName, toolParameters);
        console.log("\n\n\n\n------------------- System Information -------------------\n:",response,"\n-------------------------- End ---------------------------\n\n\n\n")
        return response
      }

    // --- NEW FILE TOOL CASES ---
    case 'ListFiles' :
        //socket?.emit('StreamText', out_res);
        {
        const response = await emitWithAck(socket, toolName, toolParameters);
        console.log("Response from server:", response);
        return response
        }
        // return await ListFiles();
    
    case 'ReadFile':{
        if (typeof toolParameters.file_path !== 'string') throw new Error('ReadFile requires a file_path.');
          const response = await emitWithAck(socket, toolName, toolParameters);
          console.log("Response from server:", response);
          return response
        }
        // return await ReadFile(toolParameters.file_path, toolParameters.start_line, toolParameters.end_line);

    case 'EditFile':{
        if (typeof toolParameters.file_path !== 'string') throw new Error('EditFile requires file_path and text.');
          const response = await emitWithAck(socket, toolName, toolParameters);
          console.log("Response from server:", response);
          return response
        }
        // return await EditFile(toolParameters.file_path, toolParameters.text, toolParameters.start_line, toolParameters.end_line);
        
    case 'CreateFile':
        if (typeof toolParameters.file_path !== 'string') throw new Error('CreateFile requires a file_path.')
        
        let fileContent = '';
        if (toolParameters.text !== undefined) {
            // Check if text is already a string
            if (typeof toolParameters.text === 'string') {
                fileContent = toolParameters.text;
            } else if (typeof toolParameters.text === 'object' && toolParameters.text !== null) {
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
            let New_toolParameters = {file_path:toolParameters.file_path, text:fileContent};
            const response = await emitWithAck(socket, toolName, New_toolParameters);
            console.log("Response from server:", response);
            return response
        }
        // return await CreateFile(toolParameters.file_path, fileContent);

    case 'DeleteFile':{
        if (typeof toolParameters.file_path !== 'string') throw new Error('DeleteFile requires a file_path.');
        const response = await emitWithAck(socket, toolName, toolParameters);
        console.log("Response from server:", response);
        return response
      }
        // return await DeleteFile(toolParameters.file_path);

    case 'DownloadFile':{
        if (typeof toolParameters.destination_path !== 'string' || typeof toolParameters.source_url !== 'string') throw new Error('DownloadFile requires destination_path and a source_url.');
        const response = await emitWithAck(socket, toolName, toolParameters);
        console.log("Response from server:", response);
        return response
      }
        // return await DownloadFile(toolParameters.destination_path, toolParameters.source_url);

    case 'CreateFolder': {// Add this new case!
        if (typeof toolParameters.directory_path !== 'string') throw new Error('CreateFolder requires a directory_path.');
        const response = await emitWithAck(socket, toolName, toolParameters);
        console.log("Response from server:", response);
        return response
      }
        // return await CreateFolder(toolParameters.directory_path);

    case 'ChangeDirectory': {
      if (typeof toolParameters.target_path !== 'string') throw new Error('ChangeDirectory requires a target_path.');
      const response = await emitWithAck(socket, toolName, toolParameters);
      console.log("Response from server:", response);
      return response
    }

    case 'ExecuteCommand': {
      if (typeof toolParameters.command_string !== 'string') throw new Error('CMD requires a command_string.');
      const response = await emitWithAck(socket, toolName, toolParameters);
      console.log("Response from server:", response);
      return response
    }

    case 'CurrentDirectory': {
      const response = await emitWithAck(socket, toolName, toolParameters);
      console.log("Response from server:", response);
      return response
    }

    // ==========================================
    // WEB & UI AUTOMATION TOOLS (NEW)
    // ==========================================
    
    case 'WebSearch': {
      if (typeof toolParameters.search_query !== 'string') throw new Error('WebSearch requires a search_query.');
      const response = await emitWithAck(socket, toolName, toolParameters);
      return response;
    }

    case 'OpenURL': {
      if (typeof toolParameters.target_url !== 'string') throw new Error('OpenURL requires a target_url.');
      const response = await emitWithAck(socket, toolName, toolParameters);
      return response;
    }

    case 'ScrapeWebsite': {
      if (typeof toolParameters.url !== 'string') {
        throw new Error('ScrapeWebsite requires a url.');
      }
      if (toolParameters.method !== 'screenshot' && toolParameters.method !== 'text') {
        toolParameters.method = 'text'; // Default fallback
      }
      
      console.log('Received ScrapeWebsite tool call with parameters:', toolParameters);
      const response = await emitWithAck(socket, toolName, toolParameters);
      console.log("Response from server (ScrapeWebsite):", response);
      return response;
    }

    case 'TakeScreenshot': {
      if (!socket) throw new Error('Socket not found for TakeScreenshot.');
      return await TakeScreenshotSocket(socket, toolParameters.target_application);
    }

    case 'GetLocationElementOnScreen': {
      if (!socket) throw new Error('Socket not found for GetLocationElementOnScreen.');
      const response = await TakeScreenshotSocket(socket, toolParameters.target_application);
      if (response.content && response.content.length > 0) {
        const screenshotData = response.content.find(c => c.type === 'resource_data');
        const metadata = response.content.find(c => c.type === 'object')?.metadata;
        if (screenshotData && typeof screenshotData.text === 'string' && metadata) {
          return await LocateElement(screenshotData.text, toolParameters.element_description, metadata);
        } else {
          throw new Error('Invalid screenshot data or metadata received from client.');
        }
      } else {
        throw new Error('No content received from TakeScreenshot for GetLocationElementOnScreen.');
      }

    }

    case 'ClickCoordinates': {
    console.log('Received ClickCoordinates tool call with parameters:', toolParameters);
    if (toolParameters.x_coordinate == null || toolParameters.y_coordinate == null) {
      throw new Error('ClickCoordinates requires x_coordinate and y_coordinate.');
    }
  
    try {
      const response = await emitWithAck(socket, toolName, toolParameters);

      // If the client returns a raw string or an improperly formatted object, wrap it safely
      if (typeof response === 'string' || !response?.content) {
        return {
          content: [{ 
            type: "string", 
            text: typeof response === 'string' ? response : JSON.stringify(response) 
          }]
        } as resultsT;
      }

      return response; // Return as-is if it already matches resultsT format
    } catch (error) {
      // Return socket errors as a valid resultsT string to prevent agent.js from crashing
      return {
        content: [{ 
          type: "string", 
          text: `Socket Error in ClickCoordinates: ${error instanceof Error ? error.message : String(error)}` 
        }]
      } as resultsT;
    }
  }

    case 'TypeKeys': {
      if (typeof toolParameters.key_sequence !== 'string') throw new Error('TypeKeys requires a key_sequence.');
      const response = await emitWithAck(socket, toolName, toolParameters);
      return response;
    }

    // --- END NEW SCREENSHOT_TOOL CASE ---
    case 'attempt_completion':
      if (typeof toolParameters.command_string == 'string'){
        const response = await emitWithAck(socket, 'ExecuteCommand', toolParameters);
        console.log("Response from server:", response);
        return response
      }
      else{
        return await AttemptCompletion(toolParameters.result, toolParameters.command || '');
      }

    case 'ask_followup_question':
        return await AskFollowupQuestion(toolParameters.question, toolParameters.follow_up);

    // --- Verified Answers Tool Cases ---
    // case 'SearchVerifiedAnswers':
    //   if (!Array.isArray(toolParameters.question_embedding)) throw new Error('SearchVerifiedAnswers requires question_embedding array.');
    //   return await SearchVerifiedAnswers(toolParameters.question_embedding, toolParameters.threshold || 0.7, toolParameters.limit || 5);

    // case 'SaveVerifiedAnswer':
    //   if (typeof toolParameters.question !== 'string' || typeof toolParameters.answer !== 'string') {
    //     throw new Error('SaveVerifiedAnswer requires question and answer.');
    //   }
    //   return await SaveVerifiedAnswer(
    //     toolParameters.question,
    //     toolParameters.answer,
    //     toolParameters.question_embedding,
    //     toolParameters.answer_embedding,
    //     toolParameters.user_id,
    //     toolParameters.commenter_name
    //   );

    default:
      throw new Error(`Tool function '${toolName}' not found.`);
  }
}

// === Verified Answers Functions ===

// async function SearchVerifiedAnswers(questionEmbedding: number[], threshold: number = 0.7, limit: number = 5) {
//   try {
//     const results = await searchVerifiedAnswers(questionEmbedding, threshold, limit);
//     return {
//       success: true,
//       results: results.map(r => ({
//         id: r.id,
//         question: r.question,
//         answer: r.answer,
//         similarity: r.similarity
//       }))
//     };
//   } catch (error) {
//     return { success: false, error: String(error) };
//   }
// }

// async function SaveVerifiedAnswer(
//   question: string,
//   answer: string,
//   questionEmbedding: number[],
//   answerEmbedding?: number[],
//   userId?: number,
//   commenterName: string = 'Anonymous'
// ) {
//   try {
//     const result = await saveVerifiedAnswer(question, answer, questionEmbedding, answerEmbedding, userId, commenterName);
//     return { success: true, answerId: result.answerId };
//   } catch (error) {
//     return { success: false, error: String(error) };
//   }
// }