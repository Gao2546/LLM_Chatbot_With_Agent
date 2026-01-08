import express, { Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import dotenv from "dotenv";
import { Readable } from 'stream';
import FormData, { from } from 'form-data';
import { XMLParser } from 'fast-xml-parser';
import * as Minio from 'minio'; // Import for /save_img endpoint
import { saveVerifiedAnswer, searchVerifiedAnswers, getAnswerVerifications, filterQuestionsByType, countQuestionsByType, getHotTags, saveVerificationAttachments, getVerificationAttachments, getAnswerVerificationAttachments, triggerNotificationsForQuestion, saveAISuggestion, getAISuggestion, updateAISuggestionDecision, saveAILearningAnalysis, getAIPerformanceSummary, getAIConflictPatterns, getKnowledgeGroupAnalytics, getConfidenceDistribution } from './db.js';

dotenv.config();

import { fileURLToPath } from 'url';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleGenAI } from "@google/genai";
import fetch from 'node-fetch';

import { 
    setChatMode, 
    setChatModel 
} from './db.js';
import pool, { 
    createUser, 
    createGuestUser,
    getUserByUsername, 
    newChatHistory, 
    storeChatHistory, 
    readChatHistory, 
    deleteChatHistory, 
    setCurrentChatId, 
    listChatHistory, 
    setUserActiveStatus,
    uploadFile, // Import the new MinIO upload function
    getFileInfoByObjectName,
    getFileByObjectName,
    saveQuestionAttachment,
    getQuestionAttachments,
    getQuestionAttachmentData,
    deleteQuestionAttachment,
    getFilesByChatId,
    deleteFile,
    addActiveUserToFile,       // <-- Import this
    removeActiveUserFromFile,  // <-- Import this
    getDocSearchStatus,
    setDocSearchStatus,
    setFileProcessStatus,
} from './db.js';
import { callToolFunction, GetSocketIO } from "./api.js"

// --- MinIO Client Setup (for direct use in /save_img) ---
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});
const minioBucketName = process.env.MINIO_BUCKET || 'uploads';


const ai = new GoogleGenAI({apiKey:process.env.Google_API_KEY});

import fs = require('fs');
import { get } from 'http';
import { json } from 'stream/consumers';
import { error } from 'console';

// Configure Multer to use memory storage instead of disk
const upload = multer({ storage: multer.memoryStorage() });

async function readFile(filename: string) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err , data : string) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  })
}

let setting_prompts : string = await readFile("./build/setting.txt") as string;

console.log("Setting Prompt Loaded: ", setting_prompts.substring(0, 100), "...");

// interface ToolData {
//   toolName: string;
//   arguments: {[key: string]: string[]};
// }

interface ToolData {
  toolName: string;
  arguments: Record<string, any>;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface MyModel {
  answer: string;
}

type resultsT = {
  content: {
    type: string;
    text: string;
  }[];
};

interface SimilarDocument {
  id: number;
  file_name: string;
  text: string;
  distance: number;
}

interface SearchSimilarResponse {
  results: SimilarDocument[];
}
const xmlToJson = async (xml: string): Promise<Record<string , any>> => {
  const parser = new XMLParser({ignoreAttributes: false, cdataPropName: false});
  
  const jsonObj = parser.parse(xml);
  const toolName = Object.keys(jsonObj)[0];
  const content = jsonObj[toolName];

  const toolData: ToolData = {
    toolName,
    arguments: {}
  };

  for (const key in content) {
    let value = content[key];

    // Check if the tool is CreateFile or EditFile and if the value is a string
    if ((toolName === 'CreateFile' || toolName === 'EditFile') && typeof value === 'string') {
      // Replace html entities globally
      console.log("Before replace: ", value.substring(0, 100), "...");
      value = value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&#x2F;/g, '/').replace(/&#x60;/g, '`').replace(/&#x3D;/g, '=').replace(/&#10;/g, '\n').replace(/&#13;/g, '\r').replace(/&#9;/g, '\t').replace(/&#x0;/g, '').replace(/&nbsp;/g, ' ').replace(/&#xA0;/g, ' ');
      console.log("After replace: ", value.substring(0, 100), "...");
    }

    toolData.arguments[key] = value;
  }

  return toolData;
};

let io: SocketIOServer;
const router = express.Router();
export default async function agentRouters(ios: SocketIOServer) {
  io = ios;

  // === Verified Answers Endpoints ===

  // ③ Search Verified Answers
  router.post('/search-verified-answers', async (req, res) => {
    try {
      const { question, threshold, limit } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: 'Question required' });
      }

      // สร้าง embedding (สำหรับ verified_answers ต้อง 1024 dimensions)
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      console.log(`Calling embedding API at ${API_SERVER_URL}/encode_embedding...`);
      
      let embedding: number[] = [];
      try {
        const embeddingRes = await axios.post(
          `${API_SERVER_URL}/encode_embedding`,
          { 
            text: question,
            dimensions: 1024  // ← ต้องเป็น 1024 dimensions
          },
          { timeout: 30000 } // 30 second timeout
        );
        
        // ตรวจสอบว่า response มี embedding หรือไม่
        if (!embeddingRes.data || !embeddingRes.data.embedding) {
          throw new Error('API response missing embedding data');
        }
        embedding = embeddingRes.data.embedding;
        console.log(`Got embedding with ${embedding.length} dimensions`);
      } catch (apiError: any) {
        console.error('Failed to get embedding from API:', apiError.message);
        return res.status(503).json({ 
          error: `Python API Server unavailable: ${apiError.message}. Please ensure api_server is running on ${API_SERVER_URL}` 
        });
      }

      // ตรวจสอบว่า embedding ไม่ว่าง
      if (!embedding || embedding.length === 0) {
        return res.status(500).json({ error: 'Question embedding must not be empty - API returned empty embedding' });
      }

      // ตรวจสอบ dimensions
      if (embedding.length !== 1024) {
        console.warn(`Warning: Expected 1024 dimensions, got ${embedding.length}. Proceeding anyway...`);
      }

      // ค้นหา
      const results = await searchVerifiedAnswers(embedding, threshold || 0.7, limit || 5);

      res.json({ success: true, results });
    } catch (error) {
      console.error('Error searching verified answers:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ④ Get All Verified Answers
  // ⑤ Get Verifications for Answer
  // Removed old /get-verifications/:answerId route - use GET /api/get-verifications/:questionId instead
  
  return router;
}

function buildMessages(setting_prompt: string, question: string) {
  const messages: { role: string; content: string }[] = [];
  messages.push({ role: "system", content: setting_prompt });

  const parts = question.includes("<DATA_SECTION>")
    ? question.split("\n<DATA_SECTION>\n").filter(s => s.trim() !== "")
    : [question.trim()];

  for (const part of parts) {
    if (part.startsWith("user:")) {
      messages.push({ role: "user", content: part.replace(/^user:\s*/, "") });
    } else if (part.startsWith("assistance:")) {
      messages.push({ role: "assistant", content: part.replace(/^assistance:\s*/, "") });
    }
  }
  return messages;
}

function wrapUseToolWithXml(responsetext: string): string {
  if (/```xml([\s\S]*?)```/g.test(responsetext)) {
    return responsetext;
  }
  return responsetext.replace(/(<use_tool>[\s\S]*?<\/use_tool>)/g, "```xml\n$1\n```");
}

// =================================================================================
// ⭐ NEW API ENDPOINT TO SERVE FILES FROM STORAGE ⭐
// =================================================================================
router.get('/storage/*', async (req: Request, res: Response) => {
    // Support both formats:
    // 1. /api/storage/comments/userid/filename (path param)
    // 2. /api/storage?path=comments/userid/filename (query param, URL encoded)
    let objectName = req.params[0];
    
    // If query param provided, use that instead
    if (req.query.path) {
        objectName = req.query.path as string;
    }

    if (!objectName) {
        return res.status(400).send('File path is required.');
    }

    try {
        // 1. Try to get file metadata from database (for uploaded_files table)
        // Note: Comment files are NOT in uploaded_files, they're in comments JSON
        // So we skip strict DB requirement and go directly to MinIO
        let fileInfo = null;
        try {
            fileInfo = await getFileInfoByObjectName(objectName);
        } catch (dbError) {
            // File not in uploaded_files table - this is OK for comment files
            // Continue to retrieve from MinIO (no error log needed)
        }

        // 2. Get the file stream from MinIO
        let fileStream: any;
        try {
            fileStream = await getFileByObjectName(objectName);
        } catch (minioError: any) {
            console.error(`File '${objectName}' not found in MinIO:`, minioError);
            return res.status(404).send('File not found in storage.');
        }
        
        // 3. Set response headers
        let mimeType = fileInfo?.mime_type || 'application/octet-stream';
        let fileName = fileInfo?.file_name || objectName.split('/').pop() || 'download';
        
        // If no DB record, try to infer MIME type from extension
        if (!fileInfo) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            const mimeTypeMap: {[key: string]: string} = {
                'pdf': 'application/pdf',
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'txt': 'text/plain',
                'csv': 'text/csv',
                'zip': 'application/zip'
            };
            if (ext && ext in mimeTypeMap) {
                mimeType = mimeTypeMap[ext];
            }
        }

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        
        // 4. Pipe the stream from MinIO directly to the response
        fileStream.pipe(res);

    } catch (error) {
        console.error(`Failed to retrieve file '${objectName}':`, error);
        // Check for MinIO's specific 'NoSuchKey' error
        if ((error as any).code === 'NoSuchKey') {
             return res.status(404).send('File not found in storage.');
        }
        res.status(500).send('Internal server error while retrieving file.');
    }
});

// =================================================================================
// FILE PROCESSING HELPER FUNCTIONS
// =================================================================================

// Helper function to determine file type from MIME type
function getFileTypeFromMime(mimeType: string | undefined): string {
    if (!mimeType) return 'file';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mimeType)) return 'table';
    if (['application/pdf', 'application/msword', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) return 'document';
    
    return 'file';
}

// =================================================================================
// UPDATED /upload ENDPOINT TO USE MINIO
// =================================================================================
router.post('/upload', upload.array('files'), async (req, res) => {
    const text = req.body.text;
    const files = req.files as Express.Multer.File[];
    const userId = req.session.user?.id;
    const chatId = req.session.user?.currentChatId;

    if (!userId || !chatId) {
        return res.status(401).send("User session not found or no active chat.");
    }

    try {
        // 0. Analyze and cleanup files
        console.log(`\n📁 Processing ${files.length} files...`);
        const fileMetadata = files.map(file => ({
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            fileType: getFileTypeFromMime(file.mimetype),
            isImage: file.mimetype?.startsWith('image/'),
            isTable: ['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype),
            isDocument: ['application/pdf', 'application/msword', 'text/plain', 'text/markdown'].includes(file.mimetype)
        }));

        console.log('📊 File Analysis:');
        console.log(JSON.stringify(fileMetadata, null, 2));

        // 1. Upload files to MinIO and store records in PostgreSQL
        // for (const file of files) {
        //     console.log(`Uploading ${file.originalname} to MinIO...`);
        //     await uploadFile(
        //         userId,
        //         chatId,
        //         file.originalname,
        //         file.buffer,
        //         file.mimetype,
        //         file.size
        //     );
        // }
        // console.log("All files successfully uploaded to MinIO.");

        // 2. Forward files to the Python processing server with organized structure
        const form = new FormData();
        form.append('user_id', userId);
        form.append('chat_history_id', chatId);
        form.append('text', text);
        form.append('processing_mode', 'legacy_text') //legacy_text or new_page_image
        form.append('file_metadata', JSON.stringify(fileMetadata));

        // Organize files by type
        const organizedFiles = {
            images: [] as Express.Multer.File[],
            tables: [] as Express.Multer.File[],
            documents: [] as Express.Multer.File[],
            other: [] as Express.Multer.File[]
        };

        for (const file of files) {
            if (file.mimetype?.startsWith('image/')) {
                organizedFiles.images.push(file);
            } else if (['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype)) {
                organizedFiles.tables.push(file);
            } else if (['application/pdf', 'application/msword', 'text/plain', 'text/markdown'].includes(file.mimetype)) {
                organizedFiles.documents.push(file);
            } else {
                organizedFiles.other.push(file);
            }
        }

        // Add organized files to form
        organizedFiles.images.forEach((file, idx) => {
            form.append(`image_${idx}`, file.buffer, file.originalname);
        });

        organizedFiles.tables.forEach((file, idx) => {
            form.append(`table_${idx}`, file.buffer, file.originalname);
        });

        organizedFiles.documents.forEach((file, idx) => {
            form.append(`document_${idx}`, file.buffer, file.originalname);
        });

        organizedFiles.other.forEach((file, idx) => {
            form.append(`file_${idx}`, file.buffer, file.originalname);
        });

        // Add all files for backward compatibility
        for (const file of files) {
            form.append('files', file.buffer, file.originalname);
        }

        const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
        console.log(`\n🚀 Forwarding to Python server at ${API_SERVER_URL}/process...`);
        const flaskRes = await axios.post(`${API_SERVER_URL}/process`, form, {
            headers: form.getHeaders()
        });
        
        res.json(flaskRes.data.reply);

    } catch (err) {
        console.error("Error during the upload process:", err);
        return res.status(500).send("Failed to process message and upload files.");
    }
});


router.post('/processDocument', upload.array('files'), async (req: Request, res: Response) => {
  const { text, method } = req.body;
  const files = req.files as Express.Multer.File[];
  
  // 1. Validate Session
  const userId = req.session.user?.id;
  if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User session not found." });
  }

  try {
      // 2. Prepare FormData for Python Server
      const form = new FormData();
      
      // Pass the session user_id to Python
      form.append('user_id', userId.toString());
      
      // Pass other fields
      if (text) form.append('text', text);
      form.append('method', method || 'text'); // Default to text if missing

      // Append files
      if (files && files.length > 0) {
          for (const file of files) {
              // Append buffer with filename and known length
              form.append('files', file.buffer, {
                  filename: file.originalname,
                  contentType: file.mimetype,
                  knownLength: file.size
              });
          }
      }

      // 3. Forward to Python Server
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      console.log(`Forwarding /processDocument to ${API_SERVER_URL}/processDocument...`);

      const flaskRes = await axios.post(`${API_SERVER_URL}/processDocument`, form, {
          headers: {
              ...form.getHeaders(),
              // Optional: Increase timeout for large file processing
              'Content-Type': form.getHeaders()['content-type'] 
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
      });
      // Check if the Python server returned a "success" status and update file process status
      if (flaskRes.data && flaskRes.data.status === "success") {
        await setFileProcessStatus(flaskRes.data.FileID, "finish");
      }
      // 5. Return Python response to Client
      res.json(flaskRes.data);

  } catch (err: any) {
      console.error("Error forwarding to Python model:", err.message);
      if (err.response) {
          // Pass through the error from Python
          return res.status(err.response.status).json(err.response.data);
      }
      return res.status(500).json({ error: "Internal server error processing document." });
  }
});


router.post('/create_record', async (req : Request, res : Response) => {
  const { message: userMessage, model: selectedModel, mode: selectedMode, docSearchMethod: selectedDocSearchMethod, role: selectedRole, socket: socketId } = req.body;
  const initialMode = selectedMode ?? 'ask';
  const initialModel = selectedModel ?? 'gemma3:1b';
  try {
    if (req.session.user){
      if (!req.session.user.currentChatId){
        const chat_history_id = await newChatHistory(req.session.user.id, selectedDocSearchMethod ?? "none");
        // REMOVED: createChatFolder(req.session.user.id, chat_history_id);
        req.session.user.currentChatId = chat_history_id;
        req.session.user.currentDocSearchMethod = selectedDocSearchMethod ?? "none";
        const chatHistories = await listChatHistory(req.session.user.id);
        req.session.user!.chatIds = chatHistories.map((chat: any) => chat.id);
        await setChatMode(chat_history_id, initialMode);
        await setChatModel(chat_history_id, initialModel);
        await setCurrentChatId(req.session.user.id, chat_history_id);
      }
    }
    else{
      const guestName = `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      try {
        const guestUser = await createGuestUser(guestName);
        req.session.user = {
          id: guestUser.id,
          username: guestUser.username,
          isGuest: true,
          chatIds: [],
          currentChatId: null,
          currentChatMode: null,
          currentChatModel: null,
          socketId: socketId
        };
        await setUserActiveStatus(guestUser.id, true);
        // REMOVED: createUserFolder(guestUser.id);
        const chat_history_id = await newChatHistory(req.session.user.id, selectedDocSearchMethod ?? "none");
        // REMOVED: createChatFolder(req.session.user.id, chat_history_id);
        req.session.user.currentChatId = chat_history_id;
        req.session.user.currentDocSearchMethod = selectedDocSearchMethod ?? "none";
        const chatHistories = await listChatHistory(req.session.user.id);
        req.session.user!.chatIds = chatHistories.map((chat: any) => chat.id);
        console.log("update and create session")
        await setChatMode(chat_history_id, initialMode);
        await setChatModel(chat_history_id, initialModel);
        await setCurrentChatId(req.session.user.id, chat_history_id);
      } catch (err) {
        console.error('Error creating guest user/session:', err);
        return res.status(500).json({ error: 'Failed to create guest session' });
      }
    }
    req.session.user.currentChatMode = initialMode;
    req.session.user.currentChatModel = initialModel;
    return res.status(200).json({ ok: "ok" });
  }
  catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runningRequests = new Map<string, AbortController>();
let requestId:string = ""
router.post('/message', async (req : Request, res : Response) => {
  try {
    const { message: userMessage, model: selectedModel, mode: selectedMode, role: selectedRole, socket: socketId ,work_dir: work_dir, requestId: requestId_, docSearchMethod: docSearchMethod } = req.body;
    requestId = typeof requestId_ == "string" ? requestId_ : "";
    const controller = new AbortController();
    runningRequests.set(requestId, controller);
    const socket = io.sockets.sockets.get(socketId);
    
    // Get system information with timeout and fallback
    let systemInformation : resultsT = { content: [{ type: 'text', text: '{"os":"Unknown","system_hardware":"Unknown","current_directory":"Unknown","time":"' + new Date().toISOString() + '"}' }] };
    try {
      // Set a timeout for system information call
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('System information call timed out')), 5000)
      );
      systemInformation = await Promise.race([
        callToolFunction('GetSystemInformation', {}, socketId),
        timeoutPromise
      ]) as resultsT;
    } catch (e) {
      console.warn('Could not get system information, using defaults:', e);
      // Continue with default system information
    }
    
    // Safe parsing with fallback
    let systemInformationJSON: any = { os: 'Unknown', system_hardware: 'Unknown', current_directory: 'Unknown', time: new Date().toISOString() };
    try {
        if (systemInformation?.content?.[0]?.text) {
            systemInformationJSON = JSON.parse(systemInformation.content[0].text);
        }
    } catch (e) {
        console.warn('Could not parse system information, using defaults');
    }
    
    let setting_prompt;
    setting_prompt = setting_prompts + "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n----------------------- **END** -----------------------\n\n`
    
    const initialMode = selectedMode ?? 'code';
    const initialModel = selectedModel ?? 'gemini-2.0-flash-001';

    let userId = req.session.user?.id;
    let currentChatId = req.session.user?.currentChatId ?? null;
    let currentChatMode = req.session.user?.currentChatMode ?? null;
    let currentChatModel = req.session.user?.currentChatModel ?? null;
    let documentSearchMethod = req.session.user?.currentDocSearchMethod ?? 'none';
    let serch_doc = ""
    // const documentSearchMethod = docSearchMethod || "none";

    if (currentChatId){
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      const response_similar_TopK = await fetch(`${API_SERVER_URL}/search_similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage,
          user_id: userId,
          chat_history_id: currentChatId,
          top_k: 20,
          top_k_pages: 5,
          top_k_text: 5,
          threshold_page: 0.8,
          threshold_text: 0.3,
          documentSearchMethod: documentSearchMethod,
        }),
        signal: controller.signal,
      });

      const result_similar_TopK = await response_similar_TopK.json() as SearchSimilarResponse;
      console.log("----- Search Similar Documents Results -----")
      console.log(result_similar_TopK)
      if (result_similar_TopK && result_similar_TopK.results){
        result_similar_TopK.results.forEach(doc => {
          try {
            console.log("type : ")
            console.log(typeof doc)
            if (typeof doc != "string"){
              console.log(`📄 ${doc.file_name} — score: ${doc.distance.toFixed(3)}`);
              serch_doc += doc.text + "\n\n";
            }
            else if (typeof doc == "string"){
              serch_doc += doc + "\n\n";
            }
          } catch (error) {
            console.error(`Error processing document ${doc.file_name}:`, error);
            serch_doc += doc + "\n\n";
          }
        });
      }
    }
    console.log(serch_doc);
    console.log("*-*--*--*-*-*--*-*--*-*-*-*--**--")

    let chatContent = "";
    if (currentChatId) {
      const rows = await readChatHistory(currentChatId);
      // REMOVED: await createChatFolder(userId, currentChatId);
      if (rows.length > 0) {
        chatContent = rows[0].message;
        if (!currentChatMode) {
           currentChatMode = rows[0].chat_mode ?? initialMode;
           req.session.user!.currentChatMode = currentChatMode;
        }
        if (!currentChatModel) {
           currentChatModel = rows[0].chat_model ?? initialModel;
           req.session.user!.currentChatModel = currentChatModel;
        }
      }
      req.session.user!.socketId = socketId;
    }

    if (selectedRole == "user"){
      chatContent += (chatContent ? "\n<DATA_SECTION>\n" : "") + "user" + ": " + userMessage + "\n";
    }

    let question : string = "";
    let question_backup
    if ((currentChatMode) && (serch_doc != "")){
      question = chatContent.replace(/\n<DATA_SECTION>\n/g, "\n") + "\n\ndocument" + ": " + serch_doc;
      question_backup = chatContent + "\n\n" + "document" + ": " + serch_doc
    }
    else{
      console.log("No document")
      question = chatContent.replace(/\n<DATA_SECTION>\n/g, "\n");
      question_backup = chatContent
    }

    const modelToUse = currentChatModel || initialModel;
    console.log(`Using AI model: ${modelToUse}`);
    const modeToUse = currentChatMode || initialMode;
    console.log(`Using AI mode: ${modeToUse}`);
    const regexM = /\{.*?\}\s*(.*)/;
    question = "Model name: " + modelToUse.match(regexM)![1] + "\n\n" + "--------------** Start Conversation Section** --------------\n\n" + question;

    try{
      if (modeToUse === 'code') {
        question = setting_prompt + "## **If user do not mation to user system information do not talk about that"+ "\n\n" + question ;
        // console.log(question);
      }
      else{
        question = "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n---\n\n` + `----------------------- **END USER SYSTEM INFORMATION** -----------------------\n\n` + 
                   "\n\n\n\n------------------------- **SYSTEM INSTRUCTION**---------------------------\n\n" + `## **If user do not mation to user system information do not talk about that\n\n` + `## **You are assistance\n\n` + `## **You must answer user question\n\n` + `## **If in normal conversation do not use any markdown Code Block in three backticks\n\n` + `## **Use Markdown Code Block in three backticks only in code\n\n` 
                   + `----------------------------------- **END SYSTEM INSTRUCTION** -----------------------------------\n\n` +
                    question;
        console.log(question)
      }
    }
    catch(err) {
      console.error('Error setting chat mode:', err);
      return res.status(500).json({ error: `${err}` });
    }

    let response: { text: string } | null = null;
    
    // ===== AI SUGGESTS MODE - Use LLM + Verified Knowledge Base =====
    if (modeToUse === 'ai_suggests') {
      console.log('AI Suggests Mode: Using LLM + Verified Knowledge Base...');
      
      try {
        const userQuestion = userMessage || '';
        const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
        
        // 1. Generate embedding for the question
        let embedding: number[] = [];
        try {
          const userQuestion = userMessage || '';
          
          console.log('⏳ Requesting embedding from Python API...');
          socket?.emit('StreamText', '⏳ กำลังประมวลผลคำถาม (loading embeddings)...\n');
          
          const embeddingRes = await axios.post(
            `${API_SERVER_URL}/encode_embedding`,
            { text: userQuestion, dimensions: 1024 },
            { timeout: 120000 }  // ⬅️ INCREASED from 30s to 120s (2 minutes)
          );
          
          if (embeddingRes.data && embeddingRes.data.embedding) {
            embedding = embeddingRes.data.embedding;
            console.log(`✅ AI Suggests: Got embedding with ${embedding.length} dimensions`);
            socket?.emit('StreamText', '✅ Embedding ready. Searching knowledge base...\n');
          } else {
            throw new Error('No embedding in response');
          }
        } catch (apiError: any) {
          console.error('❌ AI Suggests: Failed to get embedding:', apiError.message);
          socket?.emit('StreamText', '❌ Failed to generate embeddings. Please try again.');
          return res.json({ response: '❌ Embedding service unavailable' });
        }
        
        // 2. Search verified answers from knowledge base
        if (embedding.length === 0) {
          console.warn('⚠️ AI Suggests: Embedding is empty, cannot search knowledge base');
          socket?.emit('StreamText', '❌ Could not generate embedding for query');
          return res.json({ response: '❌ Embedding generation failed' });
        }
        
        // Use threshold 0.6 (60%) to find relevant matches only
        // Higher threshold prevents irrelevant answers from being used
        const SIMILARITY_THRESHOLD = 0.6;
        console.log(`🔍 AI Suggests: Searching with embedding length=${embedding.length}, threshold=${SIMILARITY_THRESHOLD}`);
        const results = await searchVerifiedAnswers(embedding, SIMILARITY_THRESHOLD, 5);
        console.log(`🔍 AI Suggests: Search returned ${results?.length || 0} results`);
        
        let context = '';
        let sourcesUsed: any[] = [];
        let totalSources = 0;
        
        if (results && results.length > 0) {
          // Filter out results with low similarity even if they passed threshold
          const relevantResults = results.filter((r: any) => r.similarity >= SIMILARITY_THRESHOLD);
          
          if (relevantResults.length > 0) {
            console.log(`✅ AI Suggests: Found ${relevantResults.length} relevant verified answers`);
            relevantResults.forEach((r: any, i: number) => {
              console.log(`   ${i+1}. Q${r.id} (${r.verification_type}): similarity=${r.similarity?.toFixed(3)} - "${r.question?.substring(0, 60)}..."`);
            });
            context += 'ข้อมูลจากฐานความรู้ที่ยืนยันแล้ว:\n\n';
            relevantResults.forEach((result: any, idx: number) => {
              const similarity = result.similarity ? Math.round(result.similarity * 100) : 0;
              context += `[คำถาม ${idx + 1}]: ${result.question}\n`;
              context += `[คำตอบ]: ${result.answer}\n`;
              if (result.tags && result.tags.length > 0) {
                context += `[แท็ก]: ${result.tags.join(', ')}\n`;
              }
              context += `[ความคล้ายคลึง]: ${similarity}%\n\n`;
              
              sourcesUsed.push({
                type: 'verified_answer',
                question: result.question,
                similarity: result.similarity
              });
              totalSources++;
            });
          } else {
            console.log(`⚠️ AI Suggests: No relevant answers found (all below ${SIMILARITY_THRESHOLD * 100}% threshold)`);
          }
        } else {
          console.log(`📚 AI Suggests: No verified answers found in knowledge base`);
        }
        
        console.log(`📚 Total verified sources found: ${totalSources}`);
        
        // 3. Build prompt for LLM
        const hasKnowledgeData = totalSources > 0 && context.trim().length > 0;
        
        let systemPrompt = '';
        if (hasKnowledgeData) {
          systemPrompt = `คุณคือ AI Assistant ที่ตอบคำถามโดยใช้ข้อมูลจากฐานความรู้ที่ยืนยันแล้ว

กฎสำคัญ:
1. ใช้ข้อมูลจากฐานความรู้เป็นแหล่งข้อมูลหลัก
2. สรุปและเรียบเรียงข้อมูลให้ชัดเจน - อย่าคัดลอกทั้งหมด
3. รวมข้อมูลสำคัญ ตัวเลข และรายละเอียดที่เกี่ยวข้อง
4. ตอบเป็นภาษาไทย
5. ใช้ **ตัวหนา** สำหรับคำสำคัญ
6. ถ้ามีหลายคำตอบที่เกี่ยวข้อง ให้สังเคราะห์รวมกัน

========== ข้อมูลจากฐานความรู้ ==========
${context}
==========================================
`;
        } else {
          systemPrompt = `คุณคือ AI Assistant ที่ช่วยตอบคำถาม

หมายเหตุ: ไม่พบข้อมูลที่ยืนยันแล้วในฐานความรู้สำหรับคำถามนี้
กรุณาตอบตามความรู้ทั่วไป และระบุว่านี่เป็นคำตอบจาก AI โดยยังไม่ได้รับการยืนยันจากผู้เชี่ยวชาญ`;
        }
        
        const userPrompt = `คำถาม: ${userQuestion}

${hasKnowledgeData ? 'สร้างคำตอบสรุปจากข้อมูลในฐานความรู้:' : 'กรุณาตอบคำถาม:'}
- เขียนเป็นย่อหน้าที่กระชับ ชัดเจน
- รวมข้อมูลสำคัญและตัวเลขที่เกี่ยวข้อง
- ตอบเป็นภาษาไทย`;

        let aiGeneratedAnswer = '';
        let aiModelUsed = modelToUse || 'gemma-3-4b-it';
        
        // 4. Call LLM to synthesize answer
        try {
          console.log('🤖 AI Suggests: Calling LLM to synthesize answer...');
          
          const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
          
          // Use Google AI API
          const aiResponse = await ai.models.generateContent({
            model: aiModelUsed.replace('{_Google_API_}', '') || 'gemma-3-4b-it',
            contents: fullPrompt
          });
          
          if (aiResponse && aiResponse.text) {
            aiGeneratedAnswer = aiResponse.text
              .replace(/\r\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            console.log('✅ AI Suggests: LLM generated answer successfully');
          }
        } catch (llmError: any) {
          console.error('⚠️ AI Suggests: Google AI failed:', llmError.message);
          
          // Fallback to Ollama
          try {
            console.log('🔄 AI Suggests: Trying Ollama as fallback...');
            const ollamaResponse = await fetch(`${process.env.API_OLLAMA}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gemma3:4b',
                prompt: `${systemPrompt}\n\n${userPrompt}`,
                stream: false
              })
            });
            
            if (ollamaResponse.ok) {
              const ollamaData = await ollamaResponse.json() as { response: string };
              aiGeneratedAnswer = (ollamaData.response || '')
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
              aiModelUsed = 'gemma3:4b (Ollama)';
              console.log('✅ AI Suggests: Ollama generated answer');
            }
          } catch (ollamaError) {
            console.error('⚠️ AI Suggests: Ollama also failed');
          }
        }
        
        // 5. Build final response
        let finalResponse = '';
        
        if (aiGeneratedAnswer) {
          finalResponse = aiGeneratedAnswer;
          
          // Add sources reference (without model name for chat page)
          if (totalSources > 0) {
            finalResponse += `\n\n---\n📚 *อ้างอิงจาก ${totalSources} คำตอบที่ยืนยันแล้ว*`;
          } else {
            finalResponse += `\n\n---\n⚠️ *ไม่พบข้อมูลในฐานความรู้ - คำตอบจาก AI ยังไม่ได้รับการยืนยัน*`;
          }
        } else {
          // Fallback if LLM fails completely
          if (totalSources > 0) {
            finalResponse = '## 🔍 ผลลัพธ์จากฐานความรู้\n\n';
            results.forEach((result: any, idx: number) => {
              const similarity = result.similarity ? Math.round(result.similarity * 100) : 0;
              finalResponse += `### ${idx + 1}. ${result.question}\n`;
              finalResponse += `**ความคล้าย:** ${similarity}%\n\n`;
              finalResponse += `${result.answer}\n\n---\n\n`;
            });
          } else {
            finalResponse = '## ℹ️ ไม่พบคำตอบที่ตรงกัน\n\n';
            finalResponse += 'ยังไม่มีคำตอบที่ยืนยันแล้วในฐานความรู้\n\n';
            finalResponse += '**คำแนะนำ:** ลองใช้โหมด **Ask** เพื่อให้ AI ตอบโดยตรง';
          }
        }
        
        response = { text: finalResponse };
        socket?.emit('StreamText', finalResponse);
        
        // Save to chat history
        chatContent += "\n<DATA_SECTION>\n" + "assistance: " + finalResponse + "\n";
        await storeChatHistory(currentChatId, chatContent);
        
        return res.json({ response: finalResponse });
        
      } catch (aiSuggestError: any) {
        console.error('AI Suggests Error:', aiSuggestError);
        const errorMsg = '❌ เกิดข้อผิดพลาดในการค้นหาฐานความรู้: ' + aiSuggestError.message;
        socket?.emit('StreamText', errorMsg);
        return res.status(500).json({ error: errorMsg });
      }
    }
    // ===== END AI SUGGESTS MODE =====
    
    // AI Model calling logic (Google, Ollama, OpenRouter, MyModel) remains the same...
    // ... [ The large block of code for calling different AI APIs is omitted for brevity but should be kept as is ] ...
    // --- Assume one of the blocks below runs and populates `response` ---

    // Example for Google Gemini API
    if (
        // modelToUse.startsWith("gemini") || 
        // modelToUse.startsWith("gemma-3") || 
        modelToUse.startsWith("{_Google_API_}")){

      // const Geminiresponse = await ai.models.generateContent({
      //   model: modelToUse, // Use the determined model
      //   contents: question,
      // });
      // if (Geminiresponse && typeof(Geminiresponse.text) === 'string'){
      //   response = { text: Geminiresponse.text };
      // }


      let retries = 0;
          
      while (retries < 3) {
        try {
          console.log(`Streaming response for prompt: "${question}"`);
        

          const result = await ai.models.generateContentStream({
            model: modelToUse.replace("{_Google_API_}",""),
            contents: question,
            config: {
              maxOutputTokens: 1_000_000,
            },
          });

        
          let out_res = '';
          let assistancePrefixRemoved = false;
        
          for await (const chunk of result) {
            if (controller.signal.aborted){
              return res.status(500).json({ error:'Error streaming Aborted'});
            }
            let chunkText = chunk.text;
            if (chunkText !== undefined) {
              out_res += chunkText;
              out_res = out_res.replace("&lt;","<").replace("&gt;", ">").replace("&amp;","&")
            }
          
            if (!assistancePrefixRemoved) {
              if (out_res.startsWith('assistance:')) {
                out_res = out_res.slice('assistance:'.length).trimStart();
                assistancePrefixRemoved = true;
              }
            }
          
            socket?.emit('StreamText', out_res);
          }
        
          console.log('Streaming finished.');
          console.log(out_res);
          response = { text: out_res };
        
          retries = 0; // reset retries after success
          break
        } catch (error) {
          console.error('Error streaming from Gemini API:', error);
          retries++;
          await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
          if (retries >= 3) {
            console.error(`Max retries (${retries}) reached for this attempt.`);
          }
           else {
            // res.end();
            return res.status(500).json({ error:'Error streaming response from AI'});
          }
        }
      }



    } else if ( 
                // modelToUse.startsWith("qwen") || 
                // modelToUse.startsWith("gemma3") || 
                // modelToUse.startsWith("deepseek") || 
                // modelToUse.startsWith("qwq") || 
                // modelToUse.startsWith("deepcoder") || 
                // modelToUse.startsWith("phi4") || 
                // modelToUse.startsWith("llama3.2") || 
                // modelToUse.startsWith("wizardlm") || 
                // modelToUse.startsWith("hhao") || 
                // modelToUse.startsWith("gpt-oss") || 
                modelToUse.startsWith("{_Ollama_API_}")){
    try {
        console.log("Calling Ollama API...");
        console.log(process.env.API_OLLAMA!);

        const ollamaFetchResponse = await fetch(process.env.API_OLLAMA!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelToUse.replace("{_Ollama_API_}",""),
            prompt: question,
            stream: true
          }),
          signal: controller.signal, // 👈 important
        });
        let out_res = '';
        let assistancePrefixRemoved = false;

        const stream = ollamaFetchResponse.body as Readable;

        const result = await new Promise<string>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            const lines: string[] = text.split('\n').filter((line: string) => line.trim() !== '');
          
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                let chunkText = json.response;
                out_res += chunkText;
              
                if (!assistancePrefixRemoved) {
                  if (out_res.startsWith('assistance:')) {
                    out_res = out_res.slice('assistance:'.length).trimStart();
                    assistancePrefixRemoved = true;
                  }
                }
              
                
                socket?.emit('StreamText', out_res);
              } catch (e) {
                console.error('Invalid JSON:', line);
              }
            }
          });
        
          stream.on('end', () => resolve(out_res));
          stream.on('error', reject);
        });


        response = { text: result };


    } catch (err) {
        console.error('Error calling Ollama API or processing response:', err);
        // Send error response immediately if fetch or JSON parsing fails
        return res.status(500).json({ error: `Failed to communicate with Ollama model: ${err instanceof Error ? err.message : String(err)}` });
    }
    }

    else if (
      // modelToUse.startsWith("qwen") ||
      // modelToUse.startsWith("gemma3") ||
      // modelToUse.startsWith("deepseek") ||
      // modelToUse.startsWith("qwq") ||
      // modelToUse.startsWith("deepcoder") ||
      // modelToUse.startsWith("phi4") ||
      // modelToUse.startsWith("llama3.2") ||
      // modelToUse.startsWith("wizardlm") ||
      // modelToUse.startsWith("hhao") ||
      // modelToUse.startsWith("gpt-oss") ||
      modelToUse.startsWith("{_OpenRouter_API_}")
    ) {
      const regexM = /\{.*?\}\s*(.*)/;
      let message
      if (modeToUse == "code"){
        message = buildMessages(  setting_prompt + 
                                  "\n\nModel name : " + 
                                  modelToUse.match(regexM)[1] + 
                                  "\n\n", 
                                  question_backup);
      }
      else{
        message = buildMessages("You are assistance" + 
                                "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory (current working dir)**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n----------------------- **END** -----------------------\n\n` + 
                                "## **If user do not mation to user system information do not talk about that"+
                                "\n\nModel name : " + 
                                modelToUse.match(regexM)[1] + 
                                "\n\n",
                                question_backup 
                                // + `\n\n## **Current Directory (current working dir)**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n`
                              );
      }

      // console.log(message);
      // let sys_prompt = ""
      // if (modeToUse == 'code'){
      //   sys_prompt = "system:\nYour are agent \n\n If user give instruction tool and task you must be complete the task by use the tool \n\n # **you can call only one to per round**"
      // }
      // else{
      //   sys_prompt = "Your are assistance \n\n If user ask question you must answer the question"
      // }
      try {
        console.log("Calling OpenRouter API (streaming)...");
        // console.log("\nquestion: ");
        // console.log(question);
      
        const openRouterFetchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY!}`,
            "HTTP-Referer": process.env.SITE_URL || "",
            "X-Title": process.env.SITE_NAME || "",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelToUse.replace("{_OpenRouter_API_}", ""),
            ...(modelToUse.startsWith("{_OpenRouter_API_}google")
                ? { prompt: question }
                : { messages: message }
            ),
            ...(modelToUse.startsWith("{_OpenRouter_API_}google")
                ? { 'provider': {
                      'order': [
                        'deepinfra/bf16',
                        'chutes',
                        'together',
                        'google-vertex',
                        'google-ai-studio',

                      ],
                    } }
                : { 'provider': {
                      'order': [
                        'deepinfra/fp4',
                        'chutes/bf4',
                        'deepinfra/fp8',
                        'chutes/bf8',
                        'deepinfra/fp16',
                        'chutes/bf16',
                        'deepinfra',
                        'chutes',
                        'together',
                        'xai',
                        'google-vertex',
                        'google-ai-studio',
                        'inference-net'
                      ],
                    } }
            ),
            // [
            //   {
            //     "role": "system",
            //     "content": setting_prompt,
            //   },
            //   {
            //     "role": "user",
            //     "content": question_backup,
            //     // [
            //       // {
            //       //   "type": "text",
            //       //   "text": question
            //       // },
            //       // {
            //       //   "type": "image_url",
            //       //   "image_url": {
            //       //     "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
            //       //   }
            //       // }
            //     // ]
            //   },
            // ],
            stream: modeToUse == "ask" ? true : false,
            // stream: false,
            "reasoning": {

              // One of the following (not both):

              // "effort": "high", // Can be "high", "medium", or "low" (OpenAI-style)

              "max_tokens": 20000, // Specific token limit (Anthropic-style)

              // Optional: Default is false. All models support this.

              "exclude": false, // Set to true to exclude reasoning tokens from response

              // Or enable reasoning with the default parameters:

              "enabled": true // Default: inferred from `effort` or `max_tokens`

            },
            temperature: 0.0, // ไม่สุ่มเลย
            // max_tokens: 1_000_000,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
          }),
          signal: controller.signal, // 👈 important
        });

      let result = "";
      
      if (modeToUse == "code"){
      // if (modeToUse == "code" || modeToUse == "ask"){
        const openRouterData = await openRouterFetchResponse.json() as OpenRouterChatResponse;
        if (openRouterData.choices && openRouterData.choices[0]?.message?.content) {
          result = openRouterData.choices[0].message.content;
          socket?.emit("StreamText", result);
        }
      }
      else{
      const stream = openRouterFetchResponse.body as unknown as NodeJS.ReadableStream;

        result = await new Promise<string>((resolve, reject) => {
        let out_res = "";
        let assistancePrefixRemoved = false;
              
        stream.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          // console.log(text);

          // Check for context length error
          if (text.includes('{"error":{"message":"')) {
            try {
              const errorObj = JSON.parse(text);
              if (
                errorObj.error &&
                errorObj.error.message &&
                errorObj.error.message.includes("maximum context length is")
              ) {
                reject(new Error(errorObj.error.message));
                return;
              }
            } catch (e) {
              // If not JSON, just continue
            }
          }

          const lines = text.split("\n").filter(
            (line) => line.trim() !== "" && line.startsWith("data:")
          );

          for (const line of lines) {
            const data = line.slice(5).trim(); // remove "data: "
            if (data === "[DONE]") {
              // Stream finished
              console.log("streaming DONE");
              resolve(out_res); // resolve the promise immediately
              return;
            }

            try {
              const json = JSON.parse(data);
              // Check for context length error in streamed data
              if (
                json.error &&
                json.error.message &&
                json.error.message.includes('{"error":{"message":"')
              ) {
                reject(new Error(json.error.message));
                return;
              }
              const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
              // const delta = json.choices?.[0]?.text;
              out_res += delta;

              // Optional: strip unwanted prefix
              if (!assistancePrefixRemoved && out_res.startsWith("assistance:")) {
                out_res = out_res.slice("assistance:".length).trimStart();
                assistancePrefixRemoved = true;
              }

              socket?.emit("StreamText", out_res);
            } catch (e) {
              console.error("Invalid JSON:", data, e);
            }
          }
        });
      
        stream.on("end", () => resolve(out_res));
        stream.on("error", reject);
      });
      }

      
        response = { text: result };
      
      } catch (err) {
        console.error("Error calling OpenRouter API or processing response:", err);
        return res.status(500).json({
          error: `Failed to communicate with model: ${
            err instanceof Error ? err.message : String(err)
          }`
        });
      }
    }



    else if(modelToUse.startsWith('01')){
      try{
        console.log("Calling MyModel API...");
        const MyModelFetchResponse = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: userMessage,
            }),
            signal: controller.signal, // 👈 important
        });


        if (!MyModelFetchResponse.ok) {
          const errorText = await MyModelFetchResponse.text();
          console.error(`MyModel API error! status: ${MyModelFetchResponse.status}`, errorText);
          // Send error response immediately if API call fails
          return res.status(500).json({ error: `MyModel API error (${MyModelFetchResponse.status}): ${errorText}` });
      }

      // Use the OllamaResponse interface defined earlier (lines 81-87)
      const MyModelData = await MyModelFetchResponse.json() as MyModel; // Explicitly cast to OllamaResponse
      console.log("Raw MyModel Response:", MyModelData);

      if (MyModelData && typeof MyModelData.answer === 'string') {
          // Store the response text in the 'response' variable for later processing
          response = { text: MyModelData.answer };
          console.log("Extracted MyModel Response Text:", response.text);
      } else {
          console.error("Invalid response format from MyModel:", MyModelData);
          // Send error response immediately if format is invalid
          return res.status(500).json({ error: "Invalid response format received from MyModel model" });
      }


      } catch (err){
        console.error('Error calling MyModel API or processing response:', err);
        // Send error response immediately if fetch or JSON parsing fails
        return res.status(500).json({ error: `Failed to communicate with MyModel model: ${err instanceof Error ? err.message : String(err)}` });
      }
    }


    if (!response){
      console.error("No response received from AI model");
      return res.status(500).json({ error: "No response received from AI model" });
    }
    console.log("************************************\n", response.text, "\n************************************");

    let responsetext = "";
    let tool_u = null;
    let img_url = null;
    if (response && response.text){
      responsetext = (response.text).replace("```xml","\n```xml").replace("assistance: assistance:","assistance:");
      responsetext = wrapUseToolWithXml(responsetext);
      let rrs;
      const regex = /<use_tool>([\s\S]*?)<\/use_tool>/g;
      rrs = [...responsetext.matchAll(regex)].map(m => m[1].trim());
          
      // if (rrs.length > 0) {
      //   rrs = rrs.map(xml =>
      //     xml.replace(/<text>([\s\S]*?)<\/text>/g, (match, p1) => `<text><![CDATA[\n${p1}\n]]></text>`)
      //        .replace(/<result>([\s\S]*?)<\/result>/g, (match, p1) => `<result><![CDATA[\n${p1}\n]]></result>`)
      //   );
      // }
      
      console.log(rrs);
      
      if (rrs.length > 0 && modeToUse === 'code') {
        const xmloutput = await Promise.all(rrs.map(xml => xmlToJson(xml)));
        console.log("/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*\n", xmloutput);
        tool_u = xmloutput;
      }
    }

    let resultText = null;
    let all_response = "";
    let lastToolName: string | null = null;
    let new_img_url: string | null = null;
      
    const list_toolname = [
      'IMG_Generate', 'GetPage', 'ClickElement', 'GetSourcePage', 'GetTextPage',
      'GetData', 'SearchByID', 'SearchByDuckDuckGo', 'ProcessFiles', 'SearchSimilar',
      'attempt_completion', 'ask_followup_question', 'ListFiles', 'ReadFile',
      'EditFile', 'CreateFile', 'DeleteFile', 'DownloadFile', 'CreateFolder',
      'ChangeDirectory','ExecuteCommand','CurrentDirectory', 'GetSystemInformation', 'RequestScreenshot',
    ];
    
    let toolList = Array.isArray(tool_u) ? tool_u : (tool_u ? [tool_u] : []);
    
    if (toolList.length > 0) {
      try {
        for (let i = 0; i < toolList.length; i++) {
          const tool = toolList[i];
          if (tool?.toolName != null && list_toolname.includes(tool.toolName)) {
            lastToolName = tool.toolName;
          
            if (tool.toolName === "IMG_Generate") {
              // The save path is handled by minioClient.putObject in /save_img now,
              // but we can construct the expected final object name if needed.
              tool.arguments.img_url = `user_${userId}/chat_${currentChatId}/gen_${i}/`;
              img_url = tool.arguments.img_url; // For reference
            }
          
            const response = await callToolFunction(tool.toolName, tool.arguments, socketId) as resultsT;

            console.log("Tool Response:\n", response, "\n================================================");
          
            if (tool.toolName === "attempt_completion" && tool.arguments.results) {
              responsetext += `\n\nattempt_completion : ${tool.arguments.results}`;
            } else if (tool.toolName === "ask_followup_question") {
                responsetext += `\n\n**ask_followup_question :** ${tool.arguments.question} \n\n ${
                tool.arguments.follow_up.suggest.map(
                  (item: string) => `* **suggest** ${tool.arguments.follow_up.suggest.indexOf(item) + 1}: ${item}`
                ).join('\n')
              } \n\nselect suggestion and send it back to me.`;
            }
          
            console.log("RESPONSE:\n", response.content[0].text, "\n================================================");
          
            const imageUrlContent = response.content.find(item => item.type === 'resource_link');
            if (imageUrlContent) img_url = imageUrlContent.text;

            // =================================================================
            // ⭐ UPDATED LOGIC USING THE `uploadFile` HELPER FUNCTION ⭐
            // =================================================================
            const base64Content = response.content.find(item => item.type === 'resource_data');

            if (base64Content && base64Content.text) {
                console.log("Found base64 image data, preparing to save...");
                const base64Data = base64Content.text.split(';base64,').pop();

                if (base64Data) {
                    const imageBuffer = Buffer.from(base64Data, 'base64');
                    const timestamp = Date.now();
                    
                    // Prepare the data for the uploadFile function
                    const fileName = `tool_screenshot_${timestamp}.png`;
                    const mimeType = 'image/png';
                    const fileSize = imageBuffer.length;

                    // Call the single helper function to handle both upload and DB insert
                    const uploadResult = await uploadFile(
                        userId,
                        currentChatId,
                        fileName,
                        imageBuffer,
                        mimeType,
                        fileSize
                    );
                    
                    // Use the objectName returned from the function
                    const publicUrl = uploadResult.objectName;
                    console.log(`✅ Image saved and record created. Object Name: ${publicUrl}`);

                    new_img_url = publicUrl;
                    img_url = publicUrl;

                    response.content[0].text += `\n\nImage captured and saved at: ${publicUrl}`;
                } else {
                    response.content[0].text += `\n\nWarning: Could not decode base64 image data for saving.`;
                }
            }
            // =================================================================
          
            resultText = `Result:\n${response.content[0].text}\n user: current step using ${tool.toolName} is complete move to next step, If this task is completed, use tool <attempt_completion>`;
            all_response += `\n\n[Tool:${tool.toolName}]\n${resultText}`;
          }
        }
      } catch (toolError) {
        console.error("Error during call Tool:", toolError);
        return res.status(500).json({ error: `Error during call Tool: ${toolError}` });
      }
    }
    
    if (all_response) {
      chatContent += "\n<DATA_SECTION>\n" + "assistance: " + responsetext + "\n<DATA_SECTION>\n" + "user: \n" + all_response + "\n";
    } else {
      chatContent += "\n<DATA_SECTION>\n" + "assistance: " + responsetext + "\n";
      all_response = responsetext;
    }
    
    if (img_url) chatContent += "\n<DATA_SECTION>\n" + "img_url:" + img_url + "\n";
    
    chatContent = chatContent.replace("assistance: assistance:", "assistance:");
    all_response = all_response.replace("assistance:", "");
    
    if (userId) {
      await storeChatHistory(currentChatId, chatContent);
    }
    
    if (lastToolName === "attempt_completion") {
      return res.json({ response: all_response, attempt_completion: true, followup_question: false, img_url: img_url });
    }
    if (lastToolName === "ask_followup_question") {
      return res.json({ response: responsetext, attempt_completion: false, followup_question: true, img_url: img_url });
    }
    return res.json({ response: all_response, attempt_completion: false, followup_question: false, img_url: img_url });

  } catch (error) {
    console.error('Error handling message:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    runningRequests.delete(requestId);
  }
});


router.post('/edit-message', async (req, res) => {
  const { chatId, messageIndex, newMessage, socketId, requestId ,documentSearchMethod} = req.body;
  const userId = req.session.user?.id;
  const documentSearchMethodValue = documentSearchMethod || "none";
  const controller = new AbortController();
  runningRequests.set(requestId, controller);
  const socket = io.sockets.sockets.get(socketId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  // Read current history
  const rows = await readChatHistory(chatId);
  if (rows.length === 0) return res.status(404).json({ error: 'Chat not found' });
  let chatContent = rows[0].message;
  const messages = chatContent.split('\n<DATA_SECTION>\n');
  if (messageIndex >= messages.length) return res.status(400).json({ error: 'Invalid message index' });
  const message = messages[messageIndex];
  if (!message.startsWith('user:')) return res.status(400).json({ error: 'Can only edit user messages' });
  // Truncate after this message
  const truncatedMessages = messages.slice(0, messageIndex + 1);
  // Update the message
  truncatedMessages[messageIndex] = 'user: ' + newMessage;
  // Rebuild chatContent
  let newChatContent = truncatedMessages.join('\n<DATA_SECTION>\n');
  // Save truncated
  console.log("New Chat Content after edit:\n", newChatContent);
  await storeChatHistory(chatId, newChatContent);

  // Now regenerate the response
  const systemInformation : resultsT = await callToolFunction('GetSystemInformation', {}, socketId);
  
  // Safe parsing with fallback
  let systemInformationJSON: any = { os: 'Unknown', system_hardware: 'Unknown', current_directory: 'Unknown', time: new Date().toISOString() };
  try {
      if (systemInformation?.content?.[0]?.text) {
          systemInformationJSON = JSON.parse(systemInformation.content[0].text);
      }
  } catch (e) {
      console.warn('Could not parse system information, using defaults');
  }
  
  let setting_prompt;
  setting_prompt = setting_prompts + "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n----------------------- **END** -----------------------\n\n`;

  let question : string = "";
    let question_backup
    const modelToUse = rows[0].chat_model || 'gemini-2.0-flash-001';
    const modeToUse = rows[0].chat_mode || 'code';
    const regexM = /\{.*?\}\s*(.*)/;
    let serch_doc = ""

    if (chatId){
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      const response_similar_TopK = await fetch(`${API_SERVER_URL}/search_similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: newMessage,
          user_id: userId,
          chat_history_id: chatId,
          top_k: 20,
          top_k_pages: 5,
          top_k_text: 5,
          threshold_page: 0.8,
          threshold_text: 0.3,
          documentSearchMethod: documentSearchMethod,
        }),
        signal: controller.signal,
      });

      const result_similar_TopK = await response_similar_TopK.json() as SearchSimilarResponse;
      if (result_similar_TopK && result_similar_TopK.results){
        result_similar_TopK.results.forEach(doc => {
          try {
            console.log(`📄 ${doc.file_name} — score: ${doc.distance.toFixed(3)}`);
            serch_doc += doc.text + "\n\n";
          } catch (error) {
            console.error(`Error processing document ${doc.file_name}:`, error);
            serch_doc += doc + "\n\n";
          }
        });
      }
    }
    console.log(serch_doc);
    console.log("*-*--*--*-*-*--*-*--*-*-*-*--**--")
    if ((modeToUse) && (serch_doc != '')){
      question = newChatContent.replace(/\n<DATA_SECTION>\n/g, "\n") + "\n\ndocument" + ": " + serch_doc;
      question_backup = newChatContent + "\n\n" + "document" + ": " + serch_doc
    }
    else{
      question = newChatContent.replace(/\n<DATA_SECTION>\n/g, "\n");
      question_backup = newChatContent
    }

    question = "Model name: " + modelToUse.match(regexM)![1] + "\n\n" + "--------------** Start Conversation Section** --------------\n\n" + question;

    try{
      if (modeToUse === 'code') {
        question = setting_prompt + "## **If user do not mation to user system information do not talk about that"+ "\n\n" + question ;
        // console.log(question);
      }
      else{
        question = "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n---\n\n` + `----------------------- **END USER SYSTEM INFORMATION** -----------------------\n\n` + 
                   "\n\n\n\n------------------------- **SYSTEM INSTRUCTION**---------------------------\n\n" + `## **If user do not mation to user system information do not talk about that\n\n` + `## **You are assistance\n\n` + `## **You must answer user question\n\n` + `## **If in normal conversation do not use any markdown Code Block in three backticks\n\n` + `## **Use Markdown Code Block in three backticks only in code\n\n` 
                   + `----------------------------------- **END SYSTEM INSTRUCTION** -----------------------------------\n\n` +
                    question;
        // console.log(question)
      }
    }
    catch(err) {
      console.error('Error setting chat mode:', err);
      return res.status(500).json({ error: `${err}` });
    }

    let response: { text: string } | null = null;

  // ===== AI SUGGESTS MODE for edit-message - Use LLM + Knowledge Base =====
  if (modeToUse === 'ai_suggests') {
    console.log('AI Suggests Mode (edit-message): Using LLM + Verified Knowledge Base...');
    
    try {
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      let embedding: number[] = [];
      
      try {
        const embeddingRes = await axios.post(
          `${API_SERVER_URL}/encode_embedding`,
          { text: newMessage, dimensions: 1024 },
          { timeout: 30000 }
        );
        
        if (embeddingRes.data && embeddingRes.data.embedding) {
          embedding = embeddingRes.data.embedding;
        }
      } catch (apiError: any) {
        console.error('AI Suggests: Failed to get embedding:', apiError.message);
        socket?.emit('StreamText', '❌ ไม่สามารถเชื่อมต่อกับ Python API Server ได้');
        return res.json({ response: '❌ ไม่สามารถเชื่อมต่อกับ Python API Server ได้' });
      }
      
      // Search verified answers
      const results = await searchVerifiedAnswers(embedding, 0.5, 5);
      
      let context = '';
      let sourcesUsed: any[] = [];
      let totalSources = 0;
      
      if (results && results.length > 0) {
        context += 'ข้อมูลจากฐานความรู้ที่ยืนยันแล้ว:\n\n';
        results.forEach((result: any, idx: number) => {
          const similarity = result.similarity ? Math.round(result.similarity * 100) : 0;
          context += `[คำถาม ${idx + 1}]: ${result.question}\n`;
          context += `[คำตอบ]: ${result.answer}\n`;
          context += `[ความคล้ายคลึง]: ${similarity}%\n\n`;
          sourcesUsed.push({ type: 'verified_answer', question: result.question, similarity: result.similarity });
          totalSources++;
        });
      }
      
      // Build prompt for LLM
      const hasKnowledgeData = totalSources > 0;
      let systemPrompt = hasKnowledgeData 
        ? `คุณคือ AI Assistant ที่ตอบคำถามโดยใช้ข้อมูลจากฐานความรู้ที่ยืนยันแล้ว

กฎ: ใช้ข้อมูลจากฐานความรู้เป็นหลัก, สรุปให้ชัดเจน, ตอบเป็นภาษาไทย

========== ข้อมูลจากฐานความรู้ ==========
${context}
==========================================`
        : `คุณคือ AI Assistant ไม่พบข้อมูลในฐานความรู้ ตอบตามความรู้ทั่วไปและระบุว่ายังไม่ได้รับการยืนยัน`;
      
      const userPrompt = `คำถาม: ${newMessage}\n\nสร้างคำตอบ:`;
      
      let aiGeneratedAnswer = '';
      let aiModelUsed = modelToUse || 'gemma-3-4b-it';
      
      // Call LLM
      try {
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const aiResponse = await ai.models.generateContent({
          model: aiModelUsed.replace('{_Google_API_}', '') || 'gemma-3-4b-it',
          contents: fullPrompt
        });
        
        if (aiResponse && aiResponse.text) {
          aiGeneratedAnswer = aiResponse.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        }
      } catch (llmError: any) {
        console.error('⚠️ AI Suggests: LLM failed:', llmError.message);
        // Fallback to Ollama
        try {
          const ollamaResponse = await fetch(`${process.env.API_OLLAMA}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemma3:4b', prompt: `${systemPrompt}\n\n${userPrompt}`, stream: false })
          });
          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json() as { response: string };
            aiGeneratedAnswer = (ollamaData.response || '').replace(/\n{3,}/g, '\n\n').trim();
            aiModelUsed = 'gemma3:4b (Ollama)';
          }
        } catch (e) { /* ignore */ }
      }
      
      // Build final response
      let finalResponse = aiGeneratedAnswer || (totalSources > 0 
        ? results.map((r: any, i: number) => `### ${i+1}. ${r.question}\n${r.answer}`).join('\n\n---\n\n')
        : 'ไม่พบคำตอบในฐานความรู้ ลองใช้โหมด Ask');
      
      if (aiGeneratedAnswer && totalSources > 0) {
        finalResponse += `\n\n---\n📚 *อ้างอิงจาก ${totalSources} คำตอบที่ยืนยันแล้ว* | 🤖 *${aiModelUsed.replace('{_Google_API_}', '')}*`;
      }
      
      response = { text: finalResponse };
      socket?.emit('StreamText', finalResponse);
      
      newChatContent += "\n<DATA_SECTION>\n" + "assistance: " + finalResponse + "\n";
      await storeChatHistory(chatId, newChatContent);
      
      return res.json({ response: finalResponse });
      
    } catch (aiSuggestError: any) {
      console.error('AI Suggests Error:', aiSuggestError);
      const errorMsg = '❌ เกิดข้อผิดพลาด: ' + aiSuggestError.message;
      socket?.emit('StreamText', errorMsg);
      return res.status(500).json({ error: errorMsg });
    }
  }
  // ===== END AI SUGGESTS MODE =====

  if (
        // modelToUse.startsWith("gemini") || 
        // modelToUse.startsWith("gemma-3") || 
        modelToUse.startsWith("{_Google_API_}")){

      // const Geminiresponse = await ai.models.generateContent({
      //   model: modelToUse, // Use the determined model
      //   contents: question,
      // });
      // if (Geminiresponse && typeof(Geminiresponse.text) === 'string'){
      //   response = { text: Geminiresponse.text };
      // }


      let retries = 0;
          
      while (retries < 3) {
        try {
          console.log(`Streaming response for prompt: "${question}"`);
        

          const result = await ai.models.generateContentStream({
            model: modelToUse.replace("{_Google_API_}",""),
            contents: question,
            config: {
              maxOutputTokens: 1_000_000,
            },
          });

        
          let out_res = '';
          let assistancePrefixRemoved = false;
        
          for await (const chunk of result) {
            if (controller.signal.aborted){
              return res.status(500).json({ error:'Error streaming Aborted'});
            }
            let chunkText = chunk.text;
            if (chunkText !== undefined) {
              out_res += chunkText;
              out_res = out_res.replace("&lt;","<").replace("&gt;", ">").replace("&amp;","&")
            }
          
            if (!assistancePrefixRemoved) {
              if (out_res.startsWith('assistance:')) {
                out_res = out_res.slice('assistance:'.length).trimStart();
                assistancePrefixRemoved = true;
              }
            }
          
            socket?.emit('StreamText', out_res);
          }
        
          console.log('Streaming finished.');
          console.log(out_res);
          response = { text: out_res };
        
          retries = 0; // reset retries after success
          break
        } catch (error) {
          console.error('Error streaming from Gemini API:', error);
          retries++;
          await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
          if (retries >= 3) {
            console.error(`Max retries (${retries}) reached for this attempt.`);
          }
           else {
            // res.end();
            return res.status(500).json({ error:'Error streaming response from AI'});
          }
        }
      }



    } else if ( 
                // modelToUse.startsWith("qwen") || 
                // modelToUse.startsWith("gemma3") || 
                // modelToUse.startsWith("deepseek") || 
                // modelToUse.startsWith("qwq") || 
                // modelToUse.startsWith("deepcoder") || 
                // modelToUse.startsWith("phi4") || 
                // modelToUse.startsWith("llama3.2") || 
                // modelToUse.startsWith("wizardlm") || 
                // modelToUse.startsWith("hhao") || 
                // modelToUse.startsWith("gpt-oss") || 
                modelToUse.startsWith("{_Ollama_API_}")){
    try {
        console.log("Calling Ollama API...");
        console.log(process.env.API_OLLAMA!);

        const ollamaFetchResponse = await fetch(process.env.API_OLLAMA!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelToUse.replace("{_Ollama_API_}",""),
            prompt: question,
            stream: true
          }),
          signal: controller.signal, // 👈 important
        });
        let out_res = '';
        let assistancePrefixRemoved = false;

        const stream = ollamaFetchResponse.body as Readable;

        const result = await new Promise<string>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            const lines: string[] = text.split('\n').filter((line: string) => line.trim() !== '');
          
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                let chunkText = json.response;
                out_res += chunkText;
              
                if (!assistancePrefixRemoved) {
                  if (out_res.startsWith('assistance:')) {
                    out_res = out_res.slice('assistance:'.length).trimStart();
                    assistancePrefixRemoved = true;
                  }
                }
              
                
                socket?.emit('StreamText', out_res);
              } catch (e) {
                console.error('Invalid JSON:', line);
              }
            }
          });
        
          stream.on('end', () => resolve(out_res));
          stream.on('error', reject);
        });


        response = { text: result };


    } catch (err) {
        console.error('Error calling Ollama API or processing response:', err);
        // Send error response immediately if fetch or JSON parsing fails
        return res.status(500).json({ error: `Failed to communicate with Ollama model: ${err instanceof Error ? err.message : String(err)}` });
    }
    }

    else if (
      // modelToUse.startsWith("qwen") ||
      // modelToUse.startsWith("gemma3") ||
      // modelToUse.startsWith("deepseek") ||
      // modelToUse.startsWith("qwq") ||
      // modelToUse.startsWith("deepcoder") ||
      // modelToUse.startsWith("phi4") ||
      // modelToUse.startsWith("llama3.2") ||
      // modelToUse.startsWith("wizardlm") ||
      // modelToUse.startsWith("hhao") ||
      // modelToUse.startsWith("gpt-oss") ||
      modelToUse.startsWith("{_OpenRouter_API_}")
    ) {
      const regexM = /\{.*?\}\s*(.*)/;
      let message
      if (modeToUse == "code"){
        message = buildMessages(  setting_prompt + 
                                  "\n\nModel name : " + 
                                  modelToUse.match(regexM)[1] + 
                                  "\n\n", 
                                  question_backup);
      }
      else{
        message = buildMessages("You are assistance" + 
                                "\n\n\n\n----------------------- **USER SYSTEM INFORMATION** -----------------------\n\n" + `## **Operation System**\n${JSON.stringify(systemInformationJSON.os)}\n\n---\n\n` + `## **System Hardware**\n${JSON.stringify(systemInformationJSON.system_hardware)}\n\n---\n\n` + `## **Current Directory (current working dir)**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n` + `## **System Time**\n${JSON.stringify(systemInformationJSON.time)}\n\n----------------------- **END** -----------------------\n\n` + 
                                "## **If user do not mation to user system information do not talk about that"+
                                "\n\nModel name : " + 
                                modelToUse.match(regexM)[1] + 
                                "\n\n",
                                question_backup 
                                // + `\n\n## **Current Directory (current working dir)**\n${JSON.stringify(systemInformationJSON.current_directory)}\n\n---\n\n`
                              );
      }

      // console.log(message);
      // let sys_prompt = ""
      // if (modeToUse == 'code'){
      //   sys_prompt = "system:\nYour are agent \n\n If user give instruction tool and task you must be complete the task by use the tool \n\n # **you can call only one to per round**"
      // }
      // else{
      //   sys_prompt = "Your are assistance \n\n If user ask question you must answer the question"
      // }
      try {
        console.log("Calling OpenRouter API (streaming)...");
        // console.log("\nquestion: ");
        // console.log(question);
      
        const openRouterFetchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY!}`,
            "HTTP-Referer": process.env.SITE_URL || "",
            "X-Title": process.env.SITE_NAME || "",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelToUse.replace("{_OpenRouter_API_}", ""),
            ...(modelToUse.startsWith("{_OpenRouter_API_}google")
                ? { prompt: question }
                : { messages: message }
            ),
            ...(modelToUse.startsWith("{_OpenRouter_API_}google")
                ? { 'provider': {
                      'order': [
                        'deepinfra/bf16',
                        'chutes',
                        'together',
                        'google-vertex',
                        'google-ai-studio',

                      ],
                    } }
                : { 'provider': {
                      'order': [
                        'deepinfra/fp4',
                        'chutes/bf4',
                        'deepinfra/fp8',
                        'chutes/bf8',
                        'deepinfra/fp16',
                        'chutes/bf16',
                        'deepinfra',
                        'chutes',
                        'together',
                        'xai',
                        'google-vertex',
                        'google-ai-studio',
                        'inference-net'
                      ],
                    } }
            ),
            // [
            //   {
            //     "role": "system",
            //     "content": setting_prompt,
            //   },
            //   {
            //     "role": "user",
            //     "content": question_backup,
            //     // [
            //       // {
            //       //   "type": "text",
            //       //   "text": question
            //       // },
            //       // {
            //       //   "type": "image_url",
            //       //   "image_url": {
            //       //     "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
            //       //   }
            //       // }
            //     // ]
            //   },
            // ],
            stream: modeToUse == "ask" ? true : false,
            "reasoning": {

              // One of the following (not both):

              // "effort": "high", // Can be "high", "medium", or "low" (OpenAI-style)

              "max_tokens": 20000, // Specific token limit (Anthropic-style)

              // Optional: Default is false. All models support this.

              "exclude": false, // Set to true to exclude reasoning tokens from response

              // Or enable reasoning with the default parameters:

              "enabled": true // Default: inferred from `effort` or `max_tokens`

            },
            temperature: 0.0, // ไม่สุ่มเลย
            // max_tokens: 1_000_000,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
          }),
          signal: controller.signal, // 👈 important
        });

      let result = "";

      if (modeToUse == "code"){
        const openRouterData = await openRouterFetchResponse.json() as OpenRouterChatResponse;
        if (openRouterData.choices && openRouterData.choices[0]?.message?.content) {
          result = openRouterData.choices[0].message.content;
          socket?.emit("StreamText", result);
        }
      }
      else{
      const stream = openRouterFetchResponse.body as unknown as NodeJS.ReadableStream;

        result = await new Promise<string>((resolve, reject) => {
        let out_res = "";
        let assistancePrefixRemoved = false;
              
        stream.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          // console.log(text);

          // Check for context length error
          if (text.includes('{"error":{"message":"')) {
            try {
              const errorObj = JSON.parse(text);
              if (
                errorObj.error &&
                errorObj.error.message &&
                errorObj.error.message.includes("maximum context length is")
              ) {
                reject(new Error(errorObj.error.message));
                return;
              }
            } catch (e) {
              // If not JSON, just continue
            }
          }

          const lines = text.split("\n").filter(
            (line) => line.trim() !== "" && line.startsWith("data:")
          );

          for (const line of lines) {
            const data = line.slice(5).trim(); // remove "data: "
            if (data === "[DONE]") {
              // Stream finished
              console.log("streaming DONE");
              resolve(out_res); // resolve the promise immediately
              return;
            }

            try {
              const json = JSON.parse(data);
              // Check for context length error in streamed data
              if (
                json.error &&
                json.error.message &&
                json.error.message.includes('{"error":{"message":"')
              ) {
                reject(new Error(json.error.message));
                return;
              }
              const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
              // const delta = json.choices?.[0]?.text;
              out_res += delta;

              // Optional: strip unwanted prefix
              if (!assistancePrefixRemoved && out_res.startsWith("assistance:")) {
                out_res = out_res.slice("assistance:".length).trimStart();
                assistancePrefixRemoved = true;
              }

              socket?.emit("StreamText", out_res);
            } catch (e) {
              console.error("Invalid JSON:", data, e);
            }
          }
        });
      
        stream.on("end", () => resolve(out_res));
        stream.on("error", reject);
      });
      }

      
        response = { text: result };
      
      } catch (err) {
        console.error("Error calling OpenRouter API or processing response:", err);
        return res.status(500).json({
          error: `Failed to communicate with model: ${
            err instanceof Error ? err.message : String(err)
          }`
        });
      }
    }



    else if(modelToUse.startsWith('01')){
      try{
        console.log("Calling MyModel API...");
        const MyModelFetchResponse = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: newMessage,
            }),
            signal: controller.signal, // 👈 important
        });


        if (!MyModelFetchResponse.ok) {
          const errorText = await MyModelFetchResponse.text();
          console.error(`MyModel API error! status: ${MyModelFetchResponse.status}`, errorText);
          // Send error response immediately if API call fails
          return res.status(500).json({ error: `MyModel API error (${MyModelFetchResponse.status}): ${errorText}` });
      }

      // Use the OllamaResponse interface defined earlier (lines 81-87)
      const MyModelData = await MyModelFetchResponse.json() as MyModel; // Explicitly cast to OllamaResponse
      console.log("Raw MyModel Response:", MyModelData);

      if (MyModelData && typeof MyModelData.answer === 'string') {
          // Store the response text in the 'response' variable for later processing
          response = { text: MyModelData.answer };
          console.log("Extracted MyModel Response Text:", response.text);
      } else {
          console.error("Invalid response format from MyModel:", MyModelData);
          // Send error response immediately if format is invalid
          return res.status(500).json({ error: "Invalid response format received from MyModel model" });
      }


      } catch (err){
        console.error('Error calling MyModel API or processing response:', err);
        // Send error response immediately if fetch or JSON parsing fails
        return res.status(500).json({ error: `Failed to communicate with MyModel model: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

  if (response) {
    newChatContent += "\n<DATA_SECTION>\n" + "assistance: " + response.text + "\n";
    await storeChatHistory(chatId, newChatContent);
  }

  res.json({ success: true });
});


router.post('/stop',async (req : Request, res : Response) => {

  const { requestId } = req.body;
  const controller = runningRequests.get(requestId);
  if (controller) {
    controller.abort();
    runningRequests.delete(requestId);
    return res.json({ success: true, message: 'Process stopped' });
  }
  return res.status(404).json({ success: false, message: 'No running request found' });
});

router.get('/chat-history', async (req: express.Request, res: express.Response) => {
  try {
    const chatId = req.query.chatId as string;
    const userId = req.session?.user?.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!chatId) return res.status(400).json({ error: 'ChatId is required' });
    
    req.session.user!.currentChatId = parseInt(chatId);
    await setCurrentChatId(userId, parseInt(chatId));

    const rows = await readChatHistory(parseInt(chatId));
    let chatContent = "";
    let chatMode = null;
    let chatModel = null;
    let docSearchMethod = null;

    if (rows.length > 0) {
      chatContent = rows[0].message;
      chatMode = rows[0].chat_mode ?? 'code';
      chatModel = rows[0].chat_model ?? 'gemini-2.0-flash-001';
      docSearchMethod = rows[0].doc_search_method ?? 'none';

      // Ensure session is up-to-date
      req.session.user!.currentChatMode = chatMode;
      req.session.user!.currentChatModel = chatModel;
      req.session.user!.currentDocSearchMethod = docSearchMethod;
    } else {
      req.session.user!.currentChatMode = null;
      req.session.user!.currentChatModel = null;
      req.session.user!.currentDocSearchMethod = null;
    }
    const chatHistoryArray = (chatContent ? chatContent.split('\n<DATA_SECTION>\n') : []);
    res.json({ chatHistory: chatHistoryArray, chatMode: chatMode, chatModel: chatModel, docSearchMethod: docSearchMethod });
  } catch (error) {
    console.error('Error getting chat history:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =================================================================================
// UPDATED /chat-history/:chatId ENDPOINT
// =================================================================================
router.delete('/chat-history/:chatId', async (req, res) => {
  const chatIdParam = req.params.chatId;
  const chatId = parseInt(chatIdParam, 10);

  if (isNaN(chatId)) {
    return res.status(400).json({ error: 'Invalid chatId' });
  }

  try {
    // This single call now handles DB records AND MinIO file cleanup
    await deleteChatHistory(chatId);
    // REMOVED: await deleteChatFolder(req.session.user.id, chatId);

    if (req.session.user) {
      req.session.user.chatIds = req.session.user.chatIds.filter((id: any) => id !== chatId);
      req.session.user.currentChatId = null;
      req.session.user.currentChatMode = null;
      req.session.user.currentChatModel = null;
      req.session.user.currentDocSearchMethod = null;
    };
    res.status(200).json({ message: `Chat history ${chatId} deleted successfully` });
  } catch (error) {
    console.error('Error deleting chat history:', error);
    return res.status(500).json({ error: 'Failed to delete chat history' });
  }
});

router.get('/ClearChat', async (req, res) => {
  const userId = req.session.user?.id;
  if (userId) {
    await setCurrentChatId(userId, null);
    if (req.session.user) {
      req.session.user.currentChatId = null;
      req.session.user.currentChatMode = null;
      req.session.user.currentChatModel = null;
    }
  }
  res.status(200).json({ message: 'Chat cleared successfully' });
});

router.get('/get_current_user', async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ userId: userId });
  } catch (error) {
    console.error('Error getting current user:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/isGuest', async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    else {
      const isGuest = req.session?.user?.isGuest;
      if (isGuest) {
        return res.status(401).json({error : 'Unauthorized' })
      }
      else {
        res.json({ userId: userId });
      }
    }
    
  } catch (error) {
    console.error('Error getting current user:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/reload-page', async (req, res) => {
  try {
    const chatId = (req.session?.user as any)?.currentChatId;
    const userId = req.session?.user?.id;

    if (chatId === "bypass"){
      return res.status(400).json({ error: 'Bypass mode not supported anymore' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!chatId) {
      return res.status(400).json({ error: 'ChatId is required' });
    }

    const rows = await readChatHistory(parseInt(chatId.toString())); // Fetches message, mode, model
    let chatContent = "";
    let chatMode = null;
    let chatModel = null;

    if (rows.length > 0) {
      chatContent = rows[0].message;
      chatMode = rows[0].chat_mode ?? 'code'; // Default if null
      chatModel = rows[0].chat_model ?? 'gemini-2.0-flash-001'; // Default if null

      // Ensure session is up-to-date
      req.session.user!.currentChatMode = chatMode;
      req.session.user!.currentChatModel = chatModel;
    }
    // If rows.length is 0, mode/model remain null, session is not updated here

    const chatHistoryArray = (chatContent ? chatContent.split('\n<DATA_SECTION>\n') : []).map((item) => item.replace("</thinking>","</thinking>\n")
                                                                                                            .replace("```xml","\n```xml")
                                                                                                            .replace("TOOL USE\n```xml", "TOOL USE")
                                                                                                            .replace("TOOL USE", "TOOL USE\n```xml")
                                                                                                            .replace("</use_mcp_tool>\n```","</use_mcp_tool>")
                                                                                                            .replace("</use_mcp_tool>","</use_mcp_tool>\n```"));

    res.json({
      chatHistory: chatHistoryArray,
      userId: userId,
      chatMode: chatMode, // Return mode
      chatModel: chatModel // Return model
    });
  } catch (error) {
    console.error('Error getting chat history:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to load chat data using chatId from session
router.get('/load-chat-data', async (req, res) => {
  try {
    const chatId = (req.session?.user as any)?.currentChatId;
    const userId = req.session?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!chatId) {
      return res.status(400).json({ error: 'No active chat found' });
    }

    // Load data from database using chatId
    const rows = await readChatHistory(parseInt(chatId.toString()));

    // Check if data exists
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Chat data not found' });
    }

    // Get chat content and timestamp
    const chatData = {
      id: chatId,
      message: rows[0].message,
      timestamp: rows[0].timestamp,
      formattedMessages: rows[0].message ? rows[0].message.split('\n<DATA_SECTION>\n') : []
    };

    res.json({ success: true, chatData });
  } catch (error) {
    console.error('Error loading chat data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function getMiddlewares() {
  return true
}

//API get middlewaire
router.get('/get-middlewares', async (req, res) => {
  try {
    const middlewares = await getMiddlewares();
    res.json({ exp: false });
  } catch (error) {
    console.error('Error loading middlewares:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to set the chat model for the current chat
router.post('/set-model', async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const currentChatId = (req.session.user as any)?.currentChatId;
    const { model } = req.body; // Expect 'model' in the body

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!currentChatId) {
      return res.status(400).json({ error: 'No active chat selected' });
    }
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Invalid model provided' });
    }

    // Update database
    await setChatModel(currentChatId, model);

    // Update session
    (req.session.user as any).currentChatModel = model;

    res.json({ success: true, message: `Model set to ${model}` });

  } catch (error) {
    console.error('Error setting chat model:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// export default router;

// API endpoint to set the chat mode for the current chat
router.post('/set-mode', async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const currentChatId = (req.session.user as any)?.currentChatId;
    const { mode } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!currentChatId) {
      return res.status(400).json({ error: 'No active chat selected' });
    }
    if (!mode || typeof mode !== 'string') {
      return res.status(400).json({ error: 'Invalid mode provided' });
    }

    // Update database
    await setChatMode(currentChatId, mode);

    // Update session
    (req.session.user as any).currentChatMode = mode;

    res.json({ success: true, message: `Mode set to ${mode}` });

  } catch (error) {
    console.error('Error setting chat mode:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/detect-platform
router.post('/detect-platform', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  let file = 'entrypoint.sh';

  if (/windows/i.test(ua)) {
    file = 'entrypoint.bat';
  }

  res.json({ script: file });
});

// GET /api/download-script/:filename
router.get('/download-script/:filename', (req, res) => {
  const file = req.params.filename;
  const filePath = path.join(__dirname, '..', 'scripts', file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Script not found');
  }

  res.download(filePath, file);
});


// =================================================================================
// UPDATED /save_img ENDPOINT TO USE MINIO
// =================================================================================
router.post("/save_img", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    // The `save_path` is now treated as the desired object name in MinIO.
    // e.g., 'user_files/user_123/chat_456/gen_0/image.png'
    const objectName = req.body.save_path;

    if (!file || !objectName) {
      return res.status(400).json({ error: "Missing file or save_path (objectName)" });
    }

    // Use the MinIO client to upload the file buffer.
    // Provide the numeric size argument before metadata to match MinIO signature.
    const objectSize = (file.buffer as Buffer).length;
    await minioClient.putObject(minioBucketName, objectName, file.buffer, objectSize, {
      'Content-Type': file.mimetype,
    });

    console.log("✅ Image saved to MinIO:", objectName);
    // Note: This does NOT create a record in the `uploaded_files` table.
    // This is for direct storage, separate from the chat upload flow.
    res.status(200).json({ status: "success", path: objectName });

  } catch (err) {
    console.error("❌ Error saving file to MinIO:", err);
    return res.status(500).json({ error: "Failed to save file to object storage" });
  }
});

// Configure multer for file uploads
const uploadFiles = multer({
  storage: multer.memoryStorage(), // Store files in memory for direct DB insertion
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Accept specific file types
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  }
});

// POST /api/verify-answer - Save verified answer with comment and file attachments
router.post('/verify-answer', uploadFiles.array('files', 10), async (req: Request, res: Response) => {
  try {
    // Handle both FormData (with files) and JSON
    let question, answer, comment, userName, verificationType, requestedDepartments, notifyMe, tags;
    let files: Express.Multer.File[] = [];

    console.log('📨 /api/verify-answer received');
    console.log('📨 Content-Type:', req.headers['content-type']);
    console.log('📨 Body keys:', Object.keys(req.body));
    console.log('📨 Raw body.tags:', req.body.tags);

    // Check if request has multipart form data
    if (req.is('multipart/form-data') && (req as any).files) {
      // File upload case
      files = (req as any).files;
      question = req.body.question;
      answer = req.body.answer;
      comment = req.body.comment || '';
      userName = req.body.userName || 'Anonymous';
      verificationType = req.body.verificationType || 'self';
      requestedDepartments = req.body.requestedDepartments ? JSON.parse(req.body.requestedDepartments) : [];
      notifyMe = req.body.notify_me === 'true' || req.body.notify_me === true;
      tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      console.log('📨 FormData tags parsed:', tags);
    } else {
      // JSON case (no files)
      ({ question, answer, comment, userName, verificationType = 'self', requestedDepartments = [], notify_me: notifyMe = false, tags = [] } = req.body);
      console.log('📨 JSON tags:', tags);
    }

    // Ensure tags is always an array
    if (!Array.isArray(tags)) {
      console.log('⚠️ Tags is not an array, converting:', tags);
      tags = tags ? [tags] : [];
    }
    console.log('📨 Final tags:', tags);

    const userId = req.session.user?.id;

    if (!question || !answer) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get embeddings from Python API
    let questionEmbedding: number[] = [];
    let answerEmbedding: number[] = [];
    try {
      const apiUrl = process.env.API_SERVER_URL;
      if (apiUrl) {
        // Get question embedding
        const questionEmbedRes = await fetch(`${apiUrl}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: question, dimensions: 1024 })
        });
        if (questionEmbedRes.ok) {
          const embedData: any = await questionEmbedRes.json();
          questionEmbedding = embedData.embedding || [];
        }

        // Get answer embedding
        const answerEmbedRes = await fetch(`${apiUrl}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: answer, dimensions: 1024 })
        });
        if (answerEmbedRes.ok) {
          const embedData: any = await answerEmbedRes.json();
          answerEmbedding = embedData.embedding || [];
        }
      }
    } catch (e) {
      console.warn('Could not get embeddings:', e);
      // Continue without embeddings
    }

    // Save verified answer to database
    let result;
    try {
      result = await saveVerifiedAnswer(
        question, 
        answer, 
        questionEmbedding,
        answerEmbedding,
        userId, 
        userName || 'Anonymous', 
        comment || '',
        verificationType,
        requestedDepartments,
        notifyMe,
        tags,
        userName || 'Anonymous'
      );
    } catch (dbError) {
      console.error('Database error in saveVerifiedAnswer:', dbError);
      return res.status(500).json({ success: false, error: `Database error: ${String(dbError)}` });
    }
    
    console.log(`📊 saveVerifiedAnswer result:`, result);
    
    if (result && result.answerId) {
      // Handle file attachments - Upload to MinIO and save to question_attachments table
      if (files && files.length > 0) {
        try {
          for (const file of files) {
            // Generate unique filename for MinIO
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(7);
            const fileExtension = file.originalname.split('.').pop();
            const uniqueFilename = `question_${result.answerId}_${timestamp}_${randomString}.${fileExtension}`;
            const objectName = `questions/${result.answerId}/${uniqueFilename}`;

            // Upload to MinIO
            await minioClient.putObject(
              minioBucketName,
              objectName,
              file.buffer,
              file.size,
              { 'Content-Type': file.mimetype }
            );

            console.log(`✅ Question attachment uploaded to MinIO: ${objectName}`);

            // Save to question_attachments table
            // Parameters: questionId, fileName, fileData, mimeType, fileSizeBytes, uploadedBy
            await saveQuestionAttachment(
              result.answerId,
              file.originalname,
              file.buffer,
              file.mimetype,
              file.size,
              userName || 'Anonymous'
            );
            console.log(`✅ Question attachment saved to database: ${file.originalname}`);
          }
        } catch (fileError) {
          console.error('Error saving file attachments:', fileError);
          // Don't fail the entire request, just log the warning
          console.warn('File attachments could not be saved, but question was created successfully');
        }
      }
      
      if (comment) {
        console.log('Verification saved with comment:', comment);
      }
      
      console.log(`Verification type: ${verificationType}, Requested departments: ${requestedDepartments.join(', ')}, Notify: ${notifyMe}`);

      // Trigger notifications for users who enabled notifications for this question
      console.log(`🔔 About to trigger notifications for question ${result.answerId}`);
      try {
        await triggerNotificationsForQuestion(
          result.answerId,
          userName || 'Anonymous',
          requestedDepartments[0] || ''
        );
        console.log(`🔔 Notification trigger completed for question ${result.answerId}`);
      } catch (notifError) {
        console.warn('Could not trigger notifications:', notifError);
      }
    }

    res.json({ success: true, message: 'Answer verified and saved successfully', answerId: result.answerId });

  } catch (error) {
    console.error('Error verifying answer:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/question-attachments/:questionId - Get list of attachments for a question
router.get('/question-attachments/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const attachments = await getQuestionAttachments(parseInt(questionId));
    res.json({ success: true, attachments });
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/attachment-download/:attachmentId - Download attachment file
router.get('/attachment-download/:attachmentId', async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;
    const attachment = await getQuestionAttachmentData(parseInt(attachmentId));
    
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    // Set response headers for file download
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    res.setHeader('Content-Length', attachment.file_data.length);

    // Send file data
    res.send(attachment.file_data);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/attachment-preview/:attachmentId - Preview attachment file (inline)
router.get('/attachment-preview/:attachmentId', async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;
    const attachment = await getQuestionAttachmentData(parseInt(attachmentId));
    
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    // Set response headers for inline preview (not download)
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
    res.setHeader('Content-Length', attachment.file_data.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Send file data
    res.send(attachment.file_data);
  } catch (error) {
    console.error('Error previewing attachment:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/verification-attachments/:answerId - Get all verification attachments for an answer
router.get('/verification-attachments/:answerId', async (req: Request, res: Response) => {
  try {
    const { answerId } = req.params;
    const verifications = await getAnswerVerificationAttachments(parseInt(answerId));
    
    // Transform the result to include file metadata
    const attachmentsWithMetadata = verifications.map(v => ({
      id: v.id,
      commenter_name: v.commenter_name,
      comment: v.comment,
      created_at: v.created_at,
      attachments: (v.attachment_paths || []).map((path: string) => {
        const filename = path.split('/').pop() || 'file';
        return {
          path: path,
          name: filename,
          url: `/api/storage/${path}`
        };
      })
    }));

    res.json({ success: true, verifications: attachmentsWithMetadata });
  } catch (error) {
    console.error('Error fetching verification attachments:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/storage/:path* - Serve files from MinIO
router.get('/storage/*', async (req: Request, res: Response) => {
  try {
    // Extract the full path after '/api/storage/'
    const objectPath = req.params[0] + (req.params.path || '');
    
    console.log(`📥 Fetching file from MinIO: ${objectPath}`);

    // Get file from MinIO
    const stream = await minioClient.getObject(minioBucketName, objectPath);
    
    // Try to determine content type from file extension
    const ext = objectPath.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain'
    };
    
    const contentType = mimeTypes[ext || ''] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    // Pipe the stream to response
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming file' });
      }
    });
    
  } catch (error) {
    console.error('Error serving file from storage:', error);
    if (!res.headersSent) {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  }
});

// POST /api/increment-view - Increment view count for a question
router.post('/increment-view', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.body;
    
    if (!questionId) {
      return res.status(400).json({ success: false, error: 'Missing questionId' });
    }

    await pool.query(
      `UPDATE verified_answers SET views = COALESCE(views, 0) + 1 WHERE id = $1`,
      [questionId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error incrementing view:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/get-all-verified-answers - Get all verified answers
router.get('/get-all-verified-answers', async (req: Request, res: Response) => {
  try {
    // Get all verified answers with verification count and vote score
    const result = await pool.query(`
      SELECT 
        va.id,
        va.question,
        va.answer,
        va.created_at,
        va.created_by,
        COALESCE(va.views, 0) as views,
        va.requested_departments as requested_departments_list,
        va.verification_type,
        va.tags,
        (SELECT COUNT(*) FROM answer_verifications 
         WHERE verified_answer_id = va.id 
         AND (verification_type = 'self' OR (verification_type = 'request' AND commenter_name IS NOT NULL AND commenter_name != va.created_by))) as verification_count,
        COALESCE((SELECT SUM(vote) FROM question_votes WHERE question_id = va.id), 0) as vote_score
      FROM verified_answers va
      ORDER BY va.created_at DESC
      LIMIT 100
    `);

    console.log('✅ Query result rows:', result.rows.length);

    const answers = result.rows.map(row => {
      return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        views: parseInt(row.views) || 0,
        created_at: row.created_at,
        created_by: row.created_by,
        verification_type: row.verification_type,
        requested_departments: row.requested_departments_list || [],
        requested_departments_list: row.requested_departments_list || [],
        tags: row.tags || [],
        verification_count: parseInt(row.verification_count) || 0,
        vote_score: parseInt(row.vote_score) || 0
      };
    });

    res.json({ success: true, results: answers, answers });
  } catch (error) {
    console.error('Error fetching verified answers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/search-verified-answers - Search verified answers
router.post('/search-verified-answers', async (req: Request, res: Response) => {
  try {
    const { question, threshold = 0.7, limit = 20 } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing question parameter' });
    }

    // Get embedding from Python API
    let questionEmbedding: number[] = [];
    try {
      const embedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: question })
      });
      const embedData: any = await embedRes.json();
      questionEmbedding = embedData.embedding || [];
    } catch (e) {
      console.warn('Could not get embedding:', e);
      // Return all verified answers if embedding fails
      const result = await pool.query(`
        SELECT 
          va.id,
          va.question,
          va.answer
        FROM verified_answers va
        ORDER BY va.created_at DESC
        LIMIT $1
      `, [limit]);

      return res.json({ 
        success: true, 
        results: result.rows.map(row => ({
          id: row.id,
          question: row.question,
          answer: row.answer
        }))
      });
    }

    // Search similar verified answers
    const results = await searchVerifiedAnswers(questionEmbedding, threshold, limit);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error searching verified answers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/verified-answers - Fetch verified answers
router.get('/verified-answers', async (req: Request, res: Response) => {
  try {
    const { question } = req.query;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing question parameter' });
    }

    // Get embedding from Python API
    let questionEmbedding: number[] = [];
    try {
      const embedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: question })
      });
      const embedData: any = await embedRes.json();
      questionEmbedding = embedData.embedding || [];
    } catch (e) {
      console.warn('Could not get embedding:', e);
      return res.status(500).json({ success: false, error: 'Could not generate embedding' });
    }

    // Search similar verified answers
    const results = await searchVerifiedAnswers(questionEmbedding, 0.7, 5);

    res.json({ success: true, results });

  } catch (error) {
    console.error('Error fetching verified answers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/get-verifications/:questionId - Get all verifications for a question
router.get('/get-verifications/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    
    const result = await pool.query(
      `SELECT av.id, av.user_id, av.commenter_name as username, 
              av.comment, av.verification_type, av.requested_departments,
              av.attachments, av.created_at as "createdAt",
              av.due_date as "dueDate"
       FROM answer_verifications av
       WHERE av.verified_answer_id = $1
       ORDER BY av.created_at DESC`,
      [questionId]
    );
    
    const verifications = result.rows.map(row => {
      // Parse attachments from jsonb
      let attachments = [];
      if (row.attachments) {
        try {
          attachments = typeof row.attachments === 'string' 
            ? JSON.parse(row.attachments)
            : Array.isArray(row.attachments) ? row.attachments : [];
        } catch (e) {
          console.warn('Failed to parse attachments:', e);
          attachments = [];
        }
      }
      return {
        id: row.id,
        userId: row.user_id,
        username: row.username || 'Anonymous',
        comment: row.comment,
        text: row.comment,
        verification_type: row.verification_type,
        requestedDepartments: row.requested_departments || [],
        attachments: attachments,
        createdAt: row.createdAt,
        dueDate: row.dueDate
      };
    });
    
    res.json({ success: true, verifications });
  } catch (error) {
    console.error('❌ Error fetching verifications:', error);
    res.json({ success: true, verifications: [] });
  }
});

// GET /api/get-notifications - Get notifications for current user
router.get('/get-notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.json({ success: true, notifications: [], unreadCount: 0 });
    }

    // Fetch user's notifications with question details
    const result = await pool.query(
      `SELECT 
        n.id,
        n.question_id as "questionId",
        n.user_id as "userId",
        n.verified_by_name as "verifiedBy",
        n.verified_by_department as "department",
        n.is_read as "isRead",
        n.created_at as "createdAt",
        va.question,
        va.answer
       FROM notifications n
       JOIN verified_answers va ON n.question_id = va.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const notifications = result.rows;
    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      success: true,
      notifications: notifications,
      unreadCount: unreadCount
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.json({ success: true, notifications: [], unreadCount: 0 });
  }
});

// POST /api/mark-notification-read - Mark notification as read
router.post('/mark-notification-read', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.body;
    const userId = req.session.user?.id;

    if (!userId || !notificationId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Update notification to mark as read
    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE 
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/hot-tags - Get hot tags
router.get('/hot-tags', async (req: Request, res: Response) => {
  try {
    const { limit = 8 } = req.query;
    const hotTags = await getHotTags(parseInt(limit as string) || 8);
    res.json({ success: true, tags: hotTags });
  } catch (error) {
    console.error('❌ Error getting hot tags:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/filter-questions - Filter questions by type with pagination
router.get('/filter-questions', async (req: Request, res: Response) => {
  try {
    const { type = 'all', username, sortBy = 'newest', limit = 20, page = 1 } = req.query;

    if (!['all', 'my-questions', 'my-answers', 'pending-review', 'unverified', 'verified'].includes(type as string)) {
      return res.status(400).json({ success: false, error: 'Invalid filter type' });
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    // Get questions for current page
    const results = await filterQuestionsByType(
      type as string,
      username as string,
      sortBy as string,
      limitNum,
      pageNum
    );

    // Get total count for pagination
    const totalCount = await countQuestionsByType(
      type as string,
      username as string
    );

    const totalPages = Math.ceil(totalCount / limitNum);

    console.log(`✅ Filtered ${results.length} questions by type: ${type} (page ${pageNum}/${totalPages}, total: ${totalCount})`);
    res.json({ 
      success: true, 
      results, 
      count: results.length,
      totalCount,
      totalPages,
      currentPage: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('❌ Error filtering questions:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/get-comments/:questionId - Get comments for a question
router.get('/get-comments/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    console.log(`📝 Fetching comments for question ${questionId}`);
    
    // Fetch comments from comments table
    const commentsResult = await pool.query(
      `SELECT id, question_id, user_id, username, text, attachments, created_at as "createdAt", 'comment' as source
       FROM comments 
       WHERE question_id = $1
       ORDER BY created_at DESC`,
      [questionId]
    );
    
    // Parse attachments from regular comments
    const parsedCommentsResult = commentsResult.rows.map(row => {
      let attachments = [];
      if (row.attachments) {
        try {
          attachments = typeof row.attachments === 'string' 
            ? JSON.parse(row.attachments)
            : Array.isArray(row.attachments) ? row.attachments : [];
        } catch (e) {
          console.warn('Failed to parse comment attachments:', e);
          attachments = [];
        }
      }
      return {
        ...row,
        attachments: attachments
      };
    });
    
    console.log(`Found ${parsedCommentsResult.length} comments from comments table`);
    
    // Fetch verification comments from answer_verifications table
    // Include all verifications (with or without comment text)
    const verificationsResult = await pool.query(
      `SELECT id, verified_answer_id as question_id, user_id, commenter_name as username, 
              comment as text, created_at as "createdAt", verification_type, requested_departments, 
              attachments, 'verification' as source
       FROM answer_verifications 
       WHERE verified_answer_id = $1`,
      [questionId]
    );
    
    console.log(`Found ${verificationsResult.rows.length} verification comments`);
    
    // Debug: Check attachments from database
    verificationsResult.rows.forEach((row, idx) => {
      console.log(`Verification ${idx}: attachments type=${typeof row.attachments}, value=`, row.attachments);
    });
    
    // Format verification comments to match comment structure
    const formattedVerifications = verificationsResult.rows.map(v => {
      // Parse attachments from jsonb
      let attachments = [];
      if (v.attachments) {
        try {
          attachments = typeof v.attachments === 'string' 
            ? JSON.parse(v.attachments)
            : Array.isArray(v.attachments) ? v.attachments : [];
        } catch (e) {
          console.warn('Failed to parse verification attachments:', e);
          attachments = [];
        }
      }
      return {
        ...v,
        department: v.requested_departments && v.requested_departments.length > 0 ? v.requested_departments[0] : null,
        attachments: attachments
      };
    });

    // Combine both sources and sort by date
    const allComments = [...parsedCommentsResult, ...formattedVerifications]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    console.log(`Returning ${allComments.length} total comments`);
    res.json({ success: true, comments: allComments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.json({ success: true, comments: [] });
  }
});

// POST /api/add-comment - Add a comment to a question
router.post('/add-comment', async (req: Request, res: Response) => {
  try {
    const { questionId, userId, username, text, department, attachments = [] } = req.body;
    
    console.log('Received add-comment request:', { questionId, userId, username, text, department, attachments });
    
    if (!questionId || !text) {
      console.error('Missing required fields:', { questionId, text });
      return res.status(400).json({ success: false, error: 'Missing required fields: questionId and text are required' });
    }

    // Validate attachments format
    if (!Array.isArray(attachments)) {
      console.error('Invalid attachments format:', typeof attachments);
      return res.status(400).json({ success: false, error: 'Attachments must be an array' });
    }

    // Save comment to database with department and attachments
    const result = await pool.query(
      `INSERT INTO comments (question_id, user_id, username, text, department, attachments, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, question_id, user_id, username, text, department, attachments, created_at as "createdAt", 'comment' as source`,
      [questionId, userId || null, username || 'Anonymous', text, department || null, JSON.stringify(attachments)]
    );

    console.log('Comment saved successfully:', result.rows[0]);
    res.json({ success: true, comment: result.rows[0] });
  } catch (error) {
    console.error('Error adding comment:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: `Failed to save comment: ${errorMessage}` });
  }
});

// POST /api/vote-question/:questionId - Vote on a question (upvote/downvote)
router.post('/vote-question/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const { vote } = req.body; // vote: 1 (upvote), -1 (downvote), 0 (remove vote)
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Login required' });
    }

    if (![-1, 0, 1].includes(vote)) {
      return res.status(400).json({ success: false, error: 'Invalid vote value' });
    }

    // Check if user has already voted
    const existingVote = await pool.query(
      `SELECT vote FROM question_votes WHERE question_id = $1 AND user_id = $2`,
      [questionId, userId]
    );

    let userVote = vote;

    if (vote === 0) {
      // Remove vote (only delete if exists)
      if (existingVote.rows.length > 0) {
        await pool.query(
          `DELETE FROM question_votes WHERE question_id = $1 AND user_id = $2`,
          [questionId, userId]
        );
      }
      userVote = 0;
    } else {
      // vote is 1 or -1
      if (existingVote.rows.length > 0) {
        // Update existing vote (regardless of whether it's the same or different)
        await pool.query(
          `UPDATE question_votes SET vote = $1, voted_at = NOW() WHERE question_id = $2 AND user_id = $3`,
          [vote, questionId, userId]
        );
      } else {
        // Insert new vote
        await pool.query(
          `INSERT INTO question_votes (question_id, user_id, vote, voted_at) VALUES ($1, $2, $3, NOW())`,
          [questionId, userId, vote]
        );
      }
      userVote = vote;
    }

    // Calculate total score from votes
    const scoreResult = await pool.query(
      `SELECT COALESCE(SUM(vote), 0) as total_votes FROM question_votes WHERE question_id = $1`,
      [questionId]
    );

    const newScore = parseInt(scoreResult.rows[0].total_votes);

    res.json({ success: true, score: newScore, userVote });
  } catch (error) {
    console.error('Error voting on question:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/increment-view - Increment view count for a question
router.post('/increment-view', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.body;
    
    if (!questionId) {
      return res.status(400).json({ success: false, error: 'Question ID required' });
    }

    // Update views in verified_answers table
    await pool.query(
      `UPDATE verified_answers SET views = COALESCE(views, 0) + 1 WHERE id = $1`,
      [questionId]
    );
    
    res.json({ success: true, message: 'View count incremented' });
  } catch (error) {
    console.error('Error incrementing view:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/reload-page - Get current user info
router.get('/reload-page', async (req: Request, res: Response) => {
  try {
    const userId = req.session.user?.id;
    const username = req.session.user?.username || 'Guest';
    
    res.json({ 
      success: true, 
      userId: userId || null,
      username: username 
    });
  } catch (error) {
    console.error('Error reloading page:', error);
    res.json({ 
      success: false, 
      userId: null, 
      username: 'Guest' 
    });
  }
});

// GET /api/get-verification-status/:questionId - Get verification timeline for a question
router.get('/get-verification-status/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    console.log('📋 Getting verification status for question:', questionId);

    // Get all verifications for this question
    const result = await pool.query(`
      SELECT 
        COALESCE(verified_answer_id, 0) as question_id,
        user_id,
        commenter_name,
        verification_type,
        requested_departments,
        comment,
        created_at,
        COALESCE(due_date, NULL) as due_date
      FROM answer_verifications
      WHERE verified_answer_id = $1
      ORDER BY created_at DESC
    `, [questionId]);

    const verifications = result.rows;
    console.log('Found verifications:', verifications.length);

    // Get requested departments status
    const requestResult = await pool.query(`
      SELECT DISTINCT requested_departments
      FROM answer_verifications
      WHERE verified_answer_id = $1 AND requested_departments IS NOT NULL
    `, [questionId]);

    const requestedDepts = new Set<string>();
    requestResult.rows.forEach(row => {
      if (row.requested_departments) {
        row.requested_departments.forEach((dept: string) => requestedDepts.add(dept));
      }
    });

    // Build verification status for each department
    const statusByDept: any = {};
    requestedDepts.forEach(dept => {
      statusByDept[dept] = {
        department: dept,
        status: 'waiting', // waiting, verified, rejected
        verifiedBy: null,
        verifiedDate: null,
        dueDate: null
      };
    });

    // Update with actual verification data
    verifications.forEach(v => {
      if (v.requested_departments) {
        v.requested_departments.forEach((dept: string) => {
          if (statusByDept[dept]) {
            statusByDept[dept].status = 'verified'; // Mark as verified if verification exists
            statusByDept[dept].verifiedBy = v.commenter_name;
            statusByDept[dept].verifiedDate = v.created_at;
            statusByDept[dept].dueDate = v.due_date;
          }
        });
      }
    });

    // Get due dates from first verification request for each department
    verifications.forEach(v => {
      if (v.requested_departments && v.verification_type === 'request') {
        v.requested_departments.forEach((dept: string) => {
          if (statusByDept[dept] && !statusByDept[dept].dueDate) {
            statusByDept[dept].dueDate = v.due_date;
          }
        });
      }
    });

    res.json({ 
      success: true, 
      questionId, 
      status: Object.values(statusByDept),
      allVerifications: verifications
    });
    
    console.log('✅ Verification status response sent:', Object.values(statusByDept).length, 'departments');
  } catch (error) {
    console.error('❌ Error getting verification status:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/request-verifications - Request verification from departments
router.post('/request-verifications', async (req: Request, res: Response) => {
  try {
    const { questionId, departments } = req.body;
    const userId = req.session.user?.id;

    if (!questionId || !departments || !Array.isArray(departments)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Create verification request for each department
    const promises = departments.map(dept => 
      pool.query(`
        INSERT INTO answer_verifications 
        (verified_answer_id, user_id, commenter_name, verification_type, requested_departments, created_at)
        VALUES ($1, $2, $3, 'request', $4, NOW())
        ON CONFLICT DO NOTHING
      `, [questionId, userId, `Request-${new Date().getTime()}`, [dept]])
    );

    await Promise.all(promises);

    res.json({ success: true, message: `Verification requested from ${departments.join(', ')}` });
  } catch (error) {
    console.error('Error requesting verification:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/upload-comment-files - Upload comment files
router.post('/upload-comment-files', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const userId = req.session.user?.id || 0;
    
    console.log('📎 Upload comment files request:', {
      filesCount: files?.length || 0,
      userId: userId
    });
    
    if (!files || files.length === 0) {
      console.log('⚠️ No files received');
      return res.json({ success: true, files: [] });
    }

    const uploadedFiles = [];

    for (const file of files) {
      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const fileExtension = file.originalname.split('.').pop();
      const uniqueFilename = `verification_${timestamp}_${randomString}.${fileExtension}`;
      const objectName = `verify-comment/${userId}/${uniqueFilename}`;

      // Upload to MinIO
      await minioClient.putObject(
        minioBucketName,
        objectName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      console.log(`Uploaded verification file: ${objectName}`);

      // Create accessible URL
      const fileUrl = `/api/storage/${objectName}`;

      uploadedFiles.push({
        name: file.originalname,
        url: fileUrl,
        size: file.size,
        type: file.mimetype
      });
    }

    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('Error uploading comment files:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/submit-verified-answer - Submit a new question with different verification types
router.post('/submit-verified-answer', async (req: Request, res: Response) => {
  try {
    console.log('📨 POST /submit-verified-answer received');
    console.log('📨 Body:', JSON.stringify(req.body));
    console.log('📨 Session:', req.session.user ? 'has user' : 'no user');
    
    const { question, answer, tags, verificationType, requestedDepartments, dueDate } = req.body;
    const userId = req.session.user?.id || null; // Allow anonymous submission
    const username = req.session.user?.username || 'Anonymous';
    const userDept = req.session.user?.department || 'General';

    if (!question || !answer) {
      console.error('❌ Missing question or answer');
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    console.log('📝 Creating question:', { verificationType, userDept, requestedDepartments, userId, username });

    // Generate embeddings for question and answer
    let questionEmbedding: number[] = [];
    let answerEmbedding: number[] = [];
    
    try {
      console.log('🔄 Generating embeddings...');
      const fullQuestionText = `${question}\n\n${answer}`;
      
      // Generate question embedding
      const qEmbedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullQuestionText })
      });
      if (qEmbedRes.ok) {
        const qEmbedData = await qEmbedRes.json() as { embedding: number[] };
        questionEmbedding = qEmbedData.embedding || [];
        console.log('✅ Question embedding generated, length:', questionEmbedding.length);
      }
      
      // Generate answer embedding
      const aEmbedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: answer })
      });
      if (aEmbedRes.ok) {
        const aEmbedData = await aEmbedRes.json() as { embedding: number[] };
        answerEmbedding = aEmbedData.embedding || [];
        console.log('✅ Answer embedding generated, length:', answerEmbedding.length);
      }
    } catch (embedError) {
      console.warn('⚠️ Failed to generate embeddings:', embedError);
      // Continue without embeddings - they can be added later
    }

    // Format embeddings for PostgreSQL
    const questionEmbeddingStr = questionEmbedding.length > 0 ? `[${questionEmbedding.join(',')}]` : null;
    const answerEmbeddingStr = answerEmbedding.length > 0 ? `[${answerEmbedding.join(',')}]` : null;

    // Parse tags - handle both string and array formats
    let tagsArray: string[] = [];
    if (Array.isArray(tags)) {
      tagsArray = tags.filter((t: any) => t && typeof t === 'string' && t.trim());
    } else if (typeof tags === 'string' && tags.trim()) {
      // Split comma-separated string into array
      tagsArray = tags.split(',').map((t: string) => t.trim()).filter((t: string) => t);
    }
    console.log('📝 Tags parsed:', tagsArray);

    // Insert the question with embeddings
    const result = await pool.query(`
      INSERT INTO verified_answers 
      (question, answer, tags, department, verification_type, requested_departments, due_date, created_by, question_embedding, answer_embedding, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *;
    `, [
      question, 
      answer, 
      tagsArray, 
      userDept,
      verificationType || 'staging',
      requestedDepartments || null,
      dueDate || null,
      username,
      questionEmbeddingStr,
      answerEmbeddingStr
    ]);

    const newQuestion = result.rows[0];
    console.log('✅ Question created:', newQuestion.id);

    // If self-verify, add an automatic verification
    if (verificationType === 'self' && userId) {
      await pool.query(`
        INSERT INTO answer_verifications 
        (verified_answer_id, user_id, commenter_name, comment, verification_type, requested_departments, created_at)
        VALUES ($1, $2, $3, $4, 'self', $5, NOW());
      `, [newQuestion.id, userId, username, 'Self-verified by department', [userDept]]);
      console.log('✅ Self-verification added');
    } else if (verificationType === 'request') {
      // For request verification, add a record to track the verification request
      await pool.query(`
        INSERT INTO answer_verifications 
        (verified_answer_id, user_id, commenter_name, comment, verification_type, requested_departments, created_at)
        VALUES ($1, $2, $3, $4, 'request', $5, NOW());
      `, [newQuestion.id, userId || null, username, 'Verification request pending', requestedDepartments || []]);
      console.log('✅ Request verification added');
    }

    res.json({ 
      success: true, 
      message: 'Question created successfully',
      question: newQuestion
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/submit-verification - Submit verification for an answer
router.post('/submit-verification', async (req: Request, res: Response) => {
  try {
    let { questionId, comment, department, attachments } = req.body;
    const userId = req.session.user?.id || 1; // Use guest user ID if not authenticated
    const userDept = department || req.session.user?.department || 'General';
    const commenterName = req.session.user?.username || 'Anonymous';

    if (!questionId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    console.log('📋 Submitting verification (raw):', { 
      questionId, 
      userDept, 
      department, 
      userId, 
      commenterName, 
      attachments,
      attachmentsType: typeof attachments 
    });

    // Parse attachments if it's a JSON string
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
        console.log('Parsed attachments from string:', attachments);
      } catch (e) {
        console.error('Failed to parse attachments:', e);
        attachments = [];
      }
    }

    // Convert attachment URLs to MinIO paths if they're provided
    const attachmentPaths: string[] = [];
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      console.log('Processing attachments:', attachments);
      for (const att of attachments) {
        if (typeof att === 'string') {
          // If it's a direct path string
          attachmentPaths.push(att);
          console.log('  - Direct path:', att);
        } else if (att && att.url) {
          // If it's an object with url property
          const path = att.url.replace(/^\/api\/storage\//, '');
          attachmentPaths.push(path);
          console.log('  - Extracted path from URL:', path);
        } else if (att && att.path) {
          // If it's an object with path property
          attachmentPaths.push(att.path);
          console.log('  - Path from object:', att.path);
        }
      }
    }

    console.log('📎 Final attachments array:', attachments, 'Array length:', attachments?.length || 0);

    // Insert or update verification
    const deptArray = [userDept];
    const attachmentsJson = JSON.stringify(attachments || []);
    
    console.log('💾 Executing INSERT query with params:', {
      questionId,
      userId,
      commenterName,
      comment,
      departments: deptArray,
      attachments: attachments,
      attachmentsJson: attachmentsJson
    });
    
    const result = await pool.query(`
      INSERT INTO answer_verifications 
      (verified_answer_id, user_id, commenter_name, comment, verification_type, requested_departments, attachments, created_at)
      VALUES ($1, $2, $3, $4, 'verification', $5, $6::jsonb, NOW())
      ON CONFLICT (verified_answer_id, user_id) DO UPDATE SET
        comment = EXCLUDED.comment,
        verification_type = EXCLUDED.verification_type,
        requested_departments = EXCLUDED.requested_departments,
        attachments = EXCLUDED.attachments,
        created_at = NOW()
      RETURNING *;
    `, [questionId, userId, commenterName, comment || null, deptArray, attachmentsJson]);

    console.log('✅ Verification saved:', result.rows[0].id, 'with', (attachments?.length || 0), 'attachments');

    // Trigger notifications for users who enabled notifications for this question
    try {
      await triggerNotificationsForQuestion(
        parseInt(questionId),
        commenterName || 'Anonymous',
        userDept || ''
      );
      console.log('✅ Notification trigger completed for question', questionId);
    } catch (notifError) {
      console.warn('Could not trigger notifications:', notifError);
    }

    // Send response IMMEDIATELY - LLM Judge runs async after this
    res.json({ 
      success: true, 
      message: 'Verification submitted successfully',
      verification: result.rows[0],
      asyncAnalysis: true // Indicate analysis is running async
    });

    // ========== LLM AS JUDGE: AI Learning Analysis (ASYNC - after response) ==========
    // Run in background using setImmediate to not block the response
    setImmediate(async () => {
      try {
        const aiSuggestion = await getAISuggestion(parseInt(questionId));
        
        if (aiSuggestion && aiSuggestion.decision === 'pending') {
          // Get the question info including requested departments
          const questionResult = await pool.query(
            `SELECT question, answer, verification_type, requested_departments 
             FROM verified_answers WHERE id = $1`,
            [questionId]
          );
          const questionData = questionResult.rows[0];
          const originalQuestion = questionData?.question || '';
          const humanAnswer = questionData?.answer || '';
          const aiAnswer = aiSuggestion.ai_generated_answer || '';
          const verificationType = questionData?.verification_type || 'self';
        const requestedDepartments: string[] = questionData?.requested_departments || [];
        
        // Check if verification is complete
        let isVerificationComplete = false;
        
        console.log(`🔍 Q${questionId} - Type: ${verificationType}, Requested: [${requestedDepartments.join(', ')}]`);
        
        if (verificationType === 'self') {
          // Self-verified questions are always complete
          isVerificationComplete = true;
          console.log(`✅ Self-verified question - no synthesis needed`);
        } else if (verificationType === 'request' && requestedDepartments.length > 0) {
          // Check how many UNIQUE departments have verified
          const verificationCountResult = await pool.query(
            `SELECT ARRAY_AGG(DISTINCT requested_departments[1]) as verified_depts, 
                    COUNT(DISTINCT requested_departments[1]) as verified_count
             FROM answer_verifications 
             WHERE verified_answer_id = $1 
             AND verification_type = 'verification'
             AND commenter_name IS NOT NULL`,
            [questionId]
          );
          
          const verifiedDepts = verificationCountResult.rows[0]?.verified_depts || [];
          const verifiedCount = parseInt(verificationCountResult.rows[0]?.verified_count || '0');
          const requestedCount = requestedDepartments.length;
          
          isVerificationComplete = verifiedCount >= requestedCount;
          console.log(`📋 Q${questionId} Verification status: ${verifiedCount}/${requestedCount} departments`);
          console.log(`   Requested: [${requestedDepartments.join(', ')}]`);
          console.log(`   Verified:  [${verifiedDepts.join(', ')}]`);
          console.log(`   Complete:  ${isVerificationComplete ? 'YES ✅' : 'NO ⏳'}`);
        } else {
          // No specific request, consider complete after first verification
          isVerificationComplete = true;
        }
        
        // Only run LLM Judge when verification is complete
        if (!isVerificationComplete) {
          console.log(`⏳ Waiting for more verifications (${requestedDepartments.length} requested)`);
        } else {
          console.log(`✅ All verifications complete! Running LLM Judge analysis...`);
          
          // Collect all expert comments for comprehensive analysis
          const allVerifications = await pool.query(
            `SELECT commenter_name, comment, requested_departments 
             FROM answer_verifications 
             WHERE verified_answer_id = $1 
             AND verification_type = 'verification'
             ORDER BY created_at`,
            [questionId]
          );
          
          const expertComments = allVerifications.rows
            .map(v => `- ${v.commenter_name} (${v.requested_departments?.[0] || 'General'}): ${v.comment || 'ยืนยันแล้ว'}`)
            .join('\n');
        
          // ========== ⭐ NEW: SYNTHESIZE ANSWER FROM ALL VERIFICATIONS ==========
          console.log(`🔄 Synthesizing final answer from ${allVerifications.rows.length} verifications...`);
          
          const expertCommentsForSynthesis = allVerifications.rows
            .map(v => `**${v.commenter_name}** (${v.requested_departments?.[0] || 'General'}, ${new Date(v.created_at || Date.now()).toLocaleDateString('th-TH')}):\n${v.comment || 'ยืนยันแล้ว'}`)
            .join('\n\n---\n\n');
        
          // Use LLM to synthesize the final answer
          const synthesisPrompt = `คุณเป็นผู้เชี่ยวชาญด้าน Semiconductor Packaging กำลังรวบรวมความรู้จากผู้เชี่ยวชาญหลายแผนกเป็นคำตอบเดียวที่ครบถ้วน

**คำถามต้นฉบับ:**
${originalQuestion}

**คำตอบจากผู้เชี่ยวชาญแต่ละแผนก:**
${expertCommentsForSynthesis}

**ภารกิจของคุณ:**
โปรดสังเคราะห์คำตอบจากผู้เชี่ยวชาญทั้งหมดเป็นคำตอบเดียวที่:
1. **ครบถ้วน** - รวมข้อมูลสำคัญจากทุกแผนก
2. **กระชับ** - ตัดข้อมูลซ้ำซ้อนออก
3. **เป็นระบบ** - จัดโครงสร้างเป็นหัวข้อชัดเจน
4. **ตอบโจทย์** - ตอบคำถามตรงประเด็น
5. **ระบุแหล่งที่มา** - อ้างอิงผู้เชี่ยวชาญที่ให้ข้อมูล

**รูปแบบคำตอบ:**
- ใช้ Markdown เพื่อจัดรูปแบบ
- แบ่งเป็นหัวข้อย่อย (##) หากมีหลายประเด็น
- ใช้ bullet points (•) เมื่อมีรายการ
- หากมีความขัดแย้งระหว่างแผนก ให้ระบุทั้งสองมุมมองและอธิบาย
- สรุปด้วย **Key Takeaways** (สั้นๆ 2-3 ข้อ) ถ้าคำตอบยาว

**ห้ามเพิ่มข้อมูลที่ไม่มีในคำตอบผู้เชี่ยวชาญ - ใช้เฉพาะข้อมูลที่มีให้เท่านั้น**

ตอบเป็นภาษาไทย ชัดเจน เข้าใจง่าย:`;

          let synthesizedAnswer = '';
          
          // Try using Google Gemini for synthesis
          try {
            console.log('🤖 Calling Gemini for answer synthesis...');
            const geminiResult = await ai.models.generateContent({
              model: 'gemini-2.0-flash-exp',
              contents: synthesisPrompt,
              config: {
                maxOutputTokens: 2000,
                temperature: 0.3,
              },
            });
            
            synthesizedAnswer = geminiResult.text || '';
            console.log(`✅ Gemini synthesis complete: ${synthesizedAnswer.length} characters`);
          } catch (llmError) {
            console.warn('Gemini synthesis failed, trying Ollama:', llmError);
            
            // Fallback to Ollama
            try {
              const ollamaResponse = await fetch(process.env.API_OLLAMA!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'llama3:latest',
                  prompt: synthesisPrompt,
                  stream: false,
                  options: { 
                    temperature: 0.3,
                    num_predict: 2000
                  }
                })
              });
              
              if (ollamaResponse.ok) {
                const ollamaData = await ollamaResponse.json() as { response?: string };
                synthesizedAnswer = ollamaData.response || '';
                console.log(`✅ Ollama synthesis complete: ${synthesizedAnswer.length} characters`);
              }
            } catch (ollamaError) {
              console.error('Both Gemini and Ollama synthesis failed:', ollamaError);
            }
          }
          
          // If synthesis succeeded, create embedding and save to sum_verified_answer
          if (synthesizedAnswer && synthesizedAnswer.length > 50) {
            try {
              // Add synthesis metadata footer
              const verifierNames = allVerifications.rows
                .map(v => `${v.commenter_name} (${v.requested_departments?.[0] || 'General'})`)
                .join(', ');
              
              const finalAnswer = `${synthesizedAnswer}\n\n---\n\n*คำตอบนี้ถูกสังเคราะห์จากความเห็นของผู้เชี่ยวชาญ ${allVerifications.rows.length} ท่าน: ${verifierNames}*`;
              
              // Get embedding for synthesized answer
              let sumAnswerEmbedding: number[] = [];
              try {
                const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
                const embeddingRes = await fetch(`${API_SERVER_URL}/encode_embedding`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    text: synthesizedAnswer,
                    dimensions: 1024
                  })
                });
                
                if (embeddingRes.ok) {
                  const embData = await embeddingRes.json() as { embedding?: number[] };
                  sumAnswerEmbedding = embData.embedding || [];
                  console.log(`✅ Created embedding for synthesized answer (${sumAnswerEmbedding.length} dims)`);
                }
              } catch (embErr) {
                console.warn('Failed to create embedding for synthesized answer:', embErr);
              }
              
              // Update sum_verified_answer and sum_verified_answer_embedding (NOT the original answer)
              if (sumAnswerEmbedding.length === 1024) {
                await pool.query(
                  `UPDATE verified_answers 
                   SET sum_verified_answer = $1, 
                       sum_verified_answer_embedding = $2,
                       last_updated_at = NOW()
                   WHERE id = $3`,
                  [finalAnswer, JSON.stringify(sumAnswerEmbedding), questionId]
                );
                
                console.log(`✅ ⭐ SYNTHESIZED ANSWER SAVED to sum_verified_answer for Q${questionId} (${finalAnswer.length} chars)`);
              } else {
                console.warn('⚠️ Invalid embedding size, not saving synthesized answer');
              }
              
            } catch (updateError) {
              console.error('Failed to update synthesized answer:', updateError);
            }
          } else {
            console.warn('⚠️ Synthesis failed or too short, not saving synthesized answer');
          }
          // ========== END ANSWER SYNTHESIS ==========
        
          // Use LLM to judge the difference
          const judgePrompt = `คุณเป็นผู้ตรวจสอบคุณภาพคำตอบ AI โปรดวิเคราะห์ความแตกต่างระหว่างคำตอบ AI กับคำตอบจากผู้เชี่ยวชาญ

คำถาม: ${originalQuestion}

คำตอบจาก AI:
${aiAnswer.replace(/<[^>]*>/g, '').substring(0, 1500)}

คำตอบจากผู้เชี่ยวชาญ (คำตอบที่ถูกต้อง):
${humanAnswer.replace(/<[^>]*>/g, '').substring(0, 1500)}

ความเห็นจากผู้เชี่ยวชาญที่ยืนยัน:
${expertComments || 'ไม่มีความเห็นเพิ่มเติม'}

**เกณฑ์การตัดสิน:**
- "accepted" = AI ตอบถูกต้อง ครบถ้วน ตรงคำถาม (ใช้ได้เลย)
- "modified" = AI ตอบถูกบางส่วน หรือ ตอบไม่ตรงคำถาม หรือ ข้อมูลไม่ครบ (ต้องแก้ไขเพิ่มเติม) ← ใช้กรณีนี้ถ้า AI ให้ข้อมูลที่ถูกต้องแต่ไม่ตอบคำถามโดยตรง
- "rejected" = AI ให้ข้อมูลที่ผิดพลาด/เป็นเท็จ (ข้อมูลผิดจริงๆ ไม่ใช่แค่ไม่ครบ)

**conflictType:**
- "none" = ไม่มีปัญหา
- "off_topic" = ตอบไม่ตรงคำถาม (แต่ข้อมูลที่ให้ไม่ผิด)
- "incomplete_answer" = ตอบไม่ครบถ้วน
- "factual_error" = ข้อมูลผิดพลาดจริง
- "wrong_context" = เข้าใจบริบทผิด
- "outdated_info" = ข้อมูลเก่า/ไม่อัปเดต
- "style_difference" = แค่สไตล์การเขียนต่าง

กรุณาวิเคราะห์และตอบในรูปแบบ JSON เท่านั้น:
{
  "decision": "accepted" หรือ "modified" หรือ "rejected",
  "similarityPercent": ตัวเลข 0-100,
  "conflictType": "none/off_topic/incomplete_answer/factual_error/wrong_context/outdated_info/style_difference",
  "severity": "none" หรือ "minor" หรือ "major" หรือ "critical",
  "keyDifferences": ["จุดที่ต่าง 1", "จุดที่ต่าง 2"],
  "analysis": "อธิบายสั้นๆ ว่า AI ตอบผิดตรงไหน หรือถูกต้อง",
  "suggestedImprovement": "คำแนะนำในการปรับปรุง prompt หรือ AI",
  "aiInfoCorrect": true หรือ false (ข้อมูลที่ AI ให้ถูกต้องไหม แม้จะไม่ตรงคำถาม)
}

ตอบเฉพาะ JSON เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;

          let judgeResult: any = null;
          
          // Use Google Gemini Flash for fast LLM Judge (much faster than Ollama)
          try {
            const geminiResult = await ai.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: judgePrompt,
              config: {
                maxOutputTokens: 1000,
                temperature: 0.1,
              },
            });
            
            const responseText = geminiResult.text || '';
            
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              judgeResult = JSON.parse(jsonMatch[0]);
            }
          } catch (llmError) {
            console.warn('LLM Judge (Gemini) failed, trying Ollama:', llmError);
            
            // Fallback to Ollama for LLM Judge
            try {
              const ollamaJudgeResponse = await fetch(process.env.API_OLLAMA!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'llama3:latest',
                  prompt: judgePrompt,
                  stream: false,
                  options: { 
                    temperature: 0.1,
                    num_predict: 1000
                  }
                })
              });
              
              if (ollamaJudgeResponse.ok) {
                const ollamaData = await ollamaJudgeResponse.json() as { response?: string };
                const responseText = ollamaData.response || '';
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  judgeResult = JSON.parse(jsonMatch[0]);
                  console.log('✅ LLM Judge (Ollama) succeeded');
                }
              }
            } catch (ollamaJudgeError) {
              console.warn('LLM Judge (Ollama) also failed:', ollamaJudgeError);
            }
          }
          
          // Fallback: Smarter text comparison if both LLMs fail
          if (!judgeResult) {
            console.log('⚠️ Both LLMs failed, using text analysis fallback');
            const normalizeText = (text: string) => 
              text.toLowerCase().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            
            const humanNorm = normalizeText(humanAnswer);
            const aiNorm = normalizeText(aiAnswer);
            
            // Calculate word overlap (Jaccard similarity)
            const humanWords = new Set(humanNorm.split(' ').filter(w => w.length > 2));
            const aiWords = new Set(aiNorm.split(' ').filter(w => w.length > 2));
            const intersection = [...humanWords].filter(w => aiWords.has(w));
            const union = new Set([...humanWords, ...aiWords]);
            const jaccardSimilarity = union.size > 0 ? (intersection.length / union.size) * 100 : 0;
            
            // Check if AI mentions the same key technical terms (English + Thai)
            const keyTerms = [
              // English terms
              'digital core', 'analog block', 'i/o ring', 'power distribution', 
              'die', 'wafer', 'pad', 'specification', 'design', 'working capital',
              'liquidity', 'profitability', 'cash flow', 'inventory', 'accounts receivable',
              // Thai terms
              'เงินทุนหมุนเวียน', 'สภาพคล่อง', 'กำไร', 'เงินสด', 'สินค้าคงคลัง',
              'ลูกหนี้การค้า', 'เจ้าหนี้การค้า', 'ธุรกิจ', 'การเติบโต', 'ความเสี่ยง',
              'การบริหาร', 'ต้นทุน', 'รายได้', 'ค่าใช้จ่าย', 'หนี้สิน', 'สินทรัพย์',
              'process window', 'defect', 'yield', 'wire bonding', 'die attach'
            ];
            const aiHasKeyTerms = keyTerms.filter(term => aiNorm.includes(term.toLowerCase()));
            const humanHasKeyTerms = keyTerms.filter(term => humanNorm.includes(term.toLowerCase()));
            const keyTermOverlap = aiHasKeyTerms.filter(t => humanHasKeyTerms.includes(t));
            const keyTermScore = humanHasKeyTerms.length > 0 ? 
              (keyTermOverlap.length / humanHasKeyTerms.length) * 100 : 0;
            
            // Combined score: 40% Jaccard + 60% key terms
            const combinedScore = (jaccardSimilarity * 0.4) + (keyTermScore * 0.6);
            
            // More lenient decision criteria for fallback
            // Since we can't use LLM to understand context, be MORE lenient
            let decision: 'accepted' | 'modified' | 'rejected';
            let conflictType: string;
            let severity: string;
            
            // If both AI and human have similar key terms, they're likely on the same topic
            if (combinedScore > 50 || keyTermOverlap.length >= 3) {
              decision = 'accepted';
              conflictType = 'none';
              severity = 'none';
            } else if (combinedScore > 20 || keyTermOverlap.length >= 1 || jaccardSimilarity > 15) {
              // If there's ANY overlap, don't reject - use modified instead
              decision = 'modified';
              conflictType = 'incomplete_answer';
              severity = 'minor';
            } else if (keyTermOverlap.length === 0 && humanHasKeyTerms.length > 0) {
              // AI missed all key terms - likely off topic or wrong context
              decision = 'modified'; // Changed from 'rejected' to be more lenient
              conflictType = 'off_topic';
              severity = 'minor';
            } else {
              // Low similarity but unknown - default to modified, not rejected
              decision = 'modified';
              conflictType = 'style_difference';
              severity = 'minor';
            }
            
            console.log(`📊 Fallback analysis: Jaccard=${jaccardSimilarity.toFixed(1)}%, KeyTerms=${keyTermScore.toFixed(1)}%, Combined=${combinedScore.toFixed(1)}%`);
            console.log(`📊 Key terms overlap: AI[${aiHasKeyTerms.join(', ')}] ∩ Human[${humanHasKeyTerms.join(', ')}] = [${keyTermOverlap.join(', ')}]`);
            
            // Generate appropriate improvement suggestion based on conflict type
            let suggestedImprovement = '';
            if (conflictType === 'off_topic') {
              suggestedImprovement = 'ปรับปรุง prompt ให้เข้าใจคำถามและตอบตรงประเด็นมากขึ้น เพิ่ม context ที่เกี่ยวข้องกับ domain';
            } else if (conflictType === 'incomplete_answer') {
              suggestedImprovement = 'เพิ่มข้อมูลในฐานความรู้เกี่ยวกับหัวข้อนี้ให้ครบถ้วนมากขึ้น';
            } else if (conflictType === 'factual_error') {
              suggestedImprovement = 'ตรวจสอบและอัปเดตข้อมูลในฐานความรู้ ข้อมูลปัจจุบันอาจไม่ถูกต้อง';
            } else {
              suggestedImprovement = 'พิจารณาเพิ่ม verified answers ใน domain นี้เพื่อปรับปรุงคุณภาพ';
            }
            
            judgeResult = {
              decision,
              similarityPercent: Math.round(combinedScore),
              conflictType,
              severity,
              keyDifferences: keyTermOverlap.length < humanHasKeyTerms.length ? 
                [`AI ขาดคำสำคัญ: ${humanHasKeyTerms.filter(t => !keyTermOverlap.includes(t)).join(', ')}`] : [],
              analysis: `Fallback analysis - Combined score: ${combinedScore.toFixed(1)}% (Jaccard: ${jaccardSimilarity.toFixed(1)}%, Key terms: ${keyTermScore.toFixed(1)}%)`,
              suggestedImprovement: suggestedImprovement,
              aiInfoCorrect: keyTermOverlap.length >= 2
            };
          }
          
          // Update AI suggestion decision
          await updateAISuggestionDecision(
            aiSuggestion.id,
            judgeResult.decision as 'accepted' | 'modified' | 'rejected',
            humanAnswer,
            commenterName || 'LLM-Judge'
          );
          
          // Save learning analysis for ALL decisions (including accepted)
          // This helps track AI performance over time
          // Determine suggested routing based on conflict type
          const suggestedRouting = judgeResult.conflictType === 'factual_error' ? 'expert_review' :
                                   judgeResult.conflictType === 'off_topic' ? 'prompt_refinement' :
                                   judgeResult.conflictType === 'incomplete_answer' ? 'knowledge_expansion' :
                                   judgeResult.conflictType === 'outdated_info' ? 'data_update' :
                                   judgeResult.conflictType === 'wrong_context' ? 'context_training' : 'none';
          
          // Extract error tags from conflict type and key differences
          const errorTags: string[] = [];
          if (judgeResult.conflictType && judgeResult.conflictType !== 'none') {
            errorTags.push(judgeResult.conflictType);
          }
          if (judgeResult.severity === 'major' || judgeResult.severity === 'critical') {
            errorTags.push('needs_attention');
          }
          if (judgeResult.decision === 'rejected') {
            errorTags.push('ai_failed');
          }
          
          // ========== AI Knowledge Group Classification ==========
          // Classify the question into a knowledge group for analytics
          let predictedGroup: string | null = null;
          let groupConfidence: number | null = null;
          
          try {
            // Get full context for better classification
            const aiAnswerText = aiSuggestion.ai_generated_answer || '';
            
            const classificationPrompt = `
You are a semiconductor packaging domain expert. Classify this Q&A into ONE knowledge group.

**Knowledge Groups:**
1. **Electrical Pad** - PCB pad design, trace routing, electrical connections, contact points
2. **Wire Bonding** - Wire connection processes, bonding techniques, wire materials, ball/wedge bonding
3. **Die Attach** - Die attachment methods, substrate connection, die bonding, epoxy, adhesives
4. **Package Design** - Overall package architecture, encapsulation, form factor, molding, substrate design
5. **Testing & QC** - Test procedures, quality control, inspection, defect analysis, probing, measurement
6. **Process Optimization** - Manufacturing improvements, yield enhancement, cycle time reduction
7. **Material Science** - Material properties, selection, compatibility, chemical properties, substrates
8. **Thermal Management** - Heat dissipation, thermal design, cooling solutions, temperature control
9. **Reliability** - Product lifetime, failure analysis, stress testing, MTBF, durability
10. **Equipment & Tools** - Machine operation, maintenance, calibration, tooling, prober, bonder
11. **Other** - Does not clearly fit above categories

**Question:**
${originalQuestion}

**AI Answer:**
${aiAnswerText.substring(0, 600)}

**Expert Verification:**
${expertComments || humanAnswer.substring(0, 300)}

**Instructions:**
- Analyze the TECHNICAL DOMAIN and MAIN PURPOSE of the Q&A
- Equipment questions (prober, bonder, etc.) → "Equipment & Tools"
- Inspection/testing procedures → "Testing & QC"
- Material selection/properties → "Material Science"
- If multiple groups apply, choose the PRIMARY domain
- If truly uncertain or general, use "Other" with confidence < 0.5

Return ONLY this JSON format (no markdown, no explanation):
{"group": "Testing & QC", "confidence": 0.85}
`;

            // Use Llama3 for better classification accuracy
            console.log('🔍 Calling Ollama for knowledge group classification...');
            const classifyResponse = await fetch(process.env.API_OLLAMA!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'llama3:latest',
                prompt: classificationPrompt,
                stream: false,
                options: { 
                  temperature: 0.2,
                  num_predict: 100
                }
              })
            });
            
            console.log('🔍 Ollama response status:', classifyResponse.status, classifyResponse.ok);
            
            if (classifyResponse.ok) {
              const classifyData = await classifyResponse.json() as { response?: string };
              const classifyText = classifyData.response || '';
              
              console.log('🔍 Ollama classification response:', classifyText.substring(0, 200));
              
              // Try to extract JSON from response
              const jsonMatch = classifyText.match(/\{[\s\S]*?\}/);
              if (jsonMatch) {
                try {
                  const classification = JSON.parse(jsonMatch[0]);
                  predictedGroup = classification.group || null;
                  groupConfidence = typeof classification.confidence === 'number' 
                    ? Math.min(1, Math.max(0, classification.confidence)) 
                    : null;
                  
                  console.log(`📁 Knowledge Group: ${predictedGroup} (${(groupConfidence || 0) * 100}% confidence)`);
                } catch (parseErr) {
                  console.warn('Could not parse classification JSON:', parseErr);
                }
              }
            }
          } catch (classifyError) {
            console.warn('Knowledge group classification failed (non-critical):', classifyError);
          }
          // ========== END AI Knowledge Group Classification ==========
          
          await saveAILearningAnalysis(aiSuggestion.id, {
            conflictType: judgeResult.conflictType || 'none',
            conflictDetails: judgeResult.analysis || '',
            severity: judgeResult.severity || 'none',
            similarityScore: (judgeResult.similarityPercent || 0) / 100,
            keyDifferences: judgeResult.keyDifferences || [],
            suggestedPromptFix: judgeResult.suggestedImprovement || '',
            suggestedRouting: suggestedRouting,
            errorTags: errorTags,
            analyzedBy: 'llm-judge',
            predictedGroup: predictedGroup || undefined,
            groupConfidence: groupConfidence || undefined
          });
          
          // Store judge result to return in response
          (req as any).llmJudgeResult = judgeResult;
          
          console.log(`📊 LLM Judge: Q${questionId} - ${judgeResult.decision} (${judgeResult.similarityPercent}%) - ${judgeResult.conflictType}`);
        }
      }
    } catch (judgeError) {
      console.warn('LLM Judge analysis failed (non-critical):', judgeError);
      // Don't fail the verification if judge fails
    }
    // ========== END LLM AS JUDGE (ASYNC) ==========
    }); // End setImmediate

  } catch (error) {
    console.error('❌ Error submitting verification:', error);
    console.error('Error details:', {
      name: (error as any).name,
      message: (error as any).message,
      stack: (error as any).stack
    });
    res.status(500).json({ success: false, error: String(error) });
  }
});
// ⭐ NEW: LIST FILES FOR A SPECIFIC CHAT (e.g., ID -1)
// =================================================================================
router.get('/chat/:chatId/files', async (req: Request, res: Response) => {
    const chatId = parseInt(req.params.chatId, 10);
    
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'Invalid Chat ID' });
    }

    try {
        const files = await getFilesByChatId(chatId);
        res.json(files);
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// =================================================================================
// ⭐ NEW: DELETE A SPECIFIC FILE
// =================================================================================
router.delete('/file/:fileId', async (req: Request, res: Response) => {
    const fileId = parseInt(req.params.fileId, 10);

    if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid File ID' });
    }

    // Optional: Add ownership check here if strictly required for non-dummy chats
    // const userId = req.session.user?.id;

    try {
        await deleteFile(fileId);
        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// =================================================================================
// ⭐ NEW: MANAGE ACTIVE USERS FOR A FILE
// =================================================================================

// Endpoint to ADD (Append) a user to active_users
router.post('/file/:fileId/active', async (req: Request, res: Response) => {
    const fileId = parseInt(req.params.fileId, 10);
    // Use session ID by default, or allow body override if needed
    const userId = req.session.user?.id || req.body.userId;

    if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid File ID' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    try {
        const updatedList = await addActiveUserToFile(fileId, userId);
        
        // Optional: Emit socket event to notify other clients
        // io.to(chatId).emit('active_users_update', { fileId, activeUsers: updatedList });
        
        res.json({ success: true, active_users: updatedList });
    } catch (error) {
        console.error('Error adding active user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Endpoint to REMOVE (Delete) a user from active_users
router.delete('/file/:fileId/active', async (req: Request, res: Response) => {
    const fileId = parseInt(req.params.fileId, 10);
    // Use session ID by default, or allow body override if needed
    const userId = req.session.user?.id || req.body.userId;

    if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid File ID' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    try {
        const updatedList = await removeActiveUserFromFile(fileId, userId);
        
        // Optional: Emit socket event to notify other clients
        // io.to(chatId).emit('active_users_update', { fileId, activeUsers: updatedList });

        res.json({ success: true, active_users: updatedList });
    } catch (error) {
        console.error('Error removing active user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/getDocSearchStatus', async (req, res) => {
  try {
    const chatId = req.session.user?.currentChatId;
      if (!chatId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await getDocSearchStatus(chatId);
    console.log('Document search status retrieved:', status);
    res.json({ docSearchMethod: status });
  } catch (error) {
    console.error('Error getting document search status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/setDocSearchStatus', async (req, res) => {
  try {
    const chatId = req.session.user?.currentChatId;
    const docSearchMethod = req.body.docSearchMethod;

    if (!chatId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (typeof docSearchMethod !== 'string') {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    await setDocSearchStatus(chatId, docSearchMethod);
    res.json({ success: true, documentSearchEnabled: docSearchMethod });
  } catch (error) {
    console.error('Error setting document search status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// This endpoint serves the file directly from MinIO to the browser
router.get('/storage/*', async (req: Request, res: Response) => {
    // The '*' captures the entire path after /storage/
    const objectName = req.params[0];

    if (!objectName) {
        return res.status(400).send('File path is required.');
    }

    try {
        // 1. Get file metadata (MIME type is crucial for preview)
        const fileInfo = await getFileInfoByObjectName(objectName);

        if (!fileInfo) {
            return res.status(404).send('File not found in database records.');
        }

        // 2. Get the stream from MinIO
        const fileStream = await getFileByObjectName(objectName);
        
        // 3. Set headers so browser knows how to display it (Image, PDF, etc)
        res.setHeader('Content-Type', fileInfo.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${fileInfo.file_name}"`);
        
        // 4. Pipe stream to response
        fileStream.pipe(res);

    } catch (error) {
        console.error(`Failed to retrieve file '${objectName}':`, error);
        res.status(500).send('Internal server error while retrieving file.');
    }
});

// GET /api/related-questions/:questionId - Get related questions using vector similarity (verified only)
router.get('/related-questions/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    
    if (!questionId || isNaN(parseInt(questionId))) {
      return res.status(400).json({ success: false, error: 'Invalid question ID' });
    }

    const qId = parseInt(questionId);

    // 1. Get current question's embedding
    const currentResult = await pool.query(
      `SELECT question_embedding, tags FROM verified_answers WHERE id = $1`,
      [qId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const { question_embedding } = currentResult.rows[0];

    if (!question_embedding) {
      // If no embedding, return empty results
      return res.json({ success: true, results: [] });
    }

    // 2. Get total count of related questions (same criteria as main query)
    // Include both self-verified and request-verified (with sum_verified_answer) questions
    // Lower threshold to 0.50 for better coverage
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
      FROM verified_answers va
      WHERE va.id != $1
        AND (va.question_embedding IS NOT NULL OR va.sum_verified_answer_embedding IS NOT NULL)
        AND (
          (va.verification_type = 'self')
          OR (va.verification_type = 'request' AND va.sum_verified_answer IS NOT NULL)
        )
        AND LENGTH(va.question) >= 10
        AND (
          (va.question_embedding IS NOT NULL AND (1 - (va.question_embedding <=> $2::vector)) > 0.50)
          OR (va.sum_verified_answer_embedding IS NOT NULL AND (1 - (va.sum_verified_answer_embedding <=> $2::vector)) > 0.50)
        )`,
      [qId, question_embedding]
    );
    
    const totalRelated = parseInt(countResult.rows[0]?.total) || 0;

    // 3. Search for similar questions using vector similarity
    // Include both self-verified and request-verified (with synthesized answer) questions
    const relatedResult = await pool.query(
      `SELECT 
        va.id,
        va.question,
        va.created_by,
        va.views,
        va.tags,
        va.verification_type,
        va.created_at,
        va.sum_verified_answer IS NOT NULL as is_fully_verified,
        GREATEST(
          COALESCE(1 - (va.question_embedding <=> $1::vector), 0),
          CASE 
            WHEN va.sum_verified_answer_embedding IS NOT NULL 
            THEN COALESCE(1 - (va.sum_verified_answer_embedding <=> $1::vector), 0)
            ELSE 0
          END
        ) as similarity_score,
        COALESCE(COUNT(av.id), 0) as verification_count
      FROM verified_answers va
      LEFT JOIN answer_verifications av ON va.id = av.verified_answer_id
      WHERE va.id != $2
        AND (va.question_embedding IS NOT NULL OR va.sum_verified_answer_embedding IS NOT NULL)
        AND (
          (va.verification_type = 'self')
          OR (va.verification_type = 'request' AND va.sum_verified_answer IS NOT NULL)
        )
        AND LENGTH(va.question) >= 10
        AND (
          (va.question_embedding IS NOT NULL AND (1 - (va.question_embedding <=> $1::vector)) > 0.50)
          OR (va.sum_verified_answer_embedding IS NOT NULL AND (1 - (va.sum_verified_answer_embedding <=> $1::vector)) > 0.50)
        )
      GROUP BY va.id, va.question, va.created_by, va.views, va.tags, va.verification_type, va.created_at, va.question_embedding, va.sum_verified_answer_embedding, va.sum_verified_answer
      ORDER BY 
        similarity_score DESC
      LIMIT 5`,
      [question_embedding, qId]
    );

    const relatedQuestions = relatedResult.rows.map(row => ({
      id: row.id,
      question: row.question,
      created_by: row.created_by,
      views: parseInt(row.views) || 0,
      tags: row.tags || [],
      verification_type: row.verification_type,
      is_fully_verified: row.is_fully_verified || row.verification_type === 'self',
      created_at: row.created_at,
      similarity: parseFloat(row.similarity_score),
      verification_count: parseInt(row.verification_count) || 0
    }));

    console.log(`✅ Found ${relatedQuestions.length} verified related questions for question ${qId} (total: ${totalRelated})`);
    res.json({ success: true, results: relatedQuestions, total: totalRelated });

  } catch (error) {
    console.error('Error fetching related questions:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/related-questions-all/:questionId - Get ALL related questions (no limit)
router.get('/related-questions-all/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    
    if (!questionId || isNaN(parseInt(questionId))) {
      return res.status(400).json({ success: false, error: 'Invalid question ID' });
    }

    const qId = parseInt(questionId);

    // 1. Get current question's embedding
    const currentResult = await pool.query(
      `SELECT question_embedding, tags FROM verified_answers WHERE id = $1`,
      [qId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const { question_embedding } = currentResult.rows[0];

    if (!question_embedding) {
      return res.json({ success: true, results: [] });
    }

    // 2. Search for ALL similar questions - improved filtering
    // Include both self-verified and request-verified (with sum_verified_answer) questions
    // Lower threshold to 0.50 for better coverage
    const relatedResult = await pool.query(
      `SELECT 
        va.id,
        va.question,
        va.created_by,
        va.views,
        va.tags,
        va.verification_type,
        va.created_at,
        GREATEST(
          COALESCE(1 - (va.question_embedding <=> $1::vector), 0),
          CASE 
            WHEN va.sum_verified_answer_embedding IS NOT NULL 
            THEN COALESCE(1 - (va.sum_verified_answer_embedding <=> $1::vector), 0)
            ELSE 0
          END
        ) as similarity_score,
        COALESCE(COUNT(av.id), 0) as verification_count
      FROM verified_answers va
      LEFT JOIN answer_verifications av ON va.id = av.verified_answer_id
      WHERE va.id != $2
        AND (va.question_embedding IS NOT NULL OR va.sum_verified_answer_embedding IS NOT NULL)
        AND (
          (va.verification_type = 'self')
          OR (va.verification_type = 'request' AND va.sum_verified_answer IS NOT NULL)
        )
        AND LENGTH(va.question) >= 10
        AND (
          (va.question_embedding IS NOT NULL AND (1 - (va.question_embedding <=> $1::vector)) > 0.50)
          OR (va.sum_verified_answer_embedding IS NOT NULL AND (1 - (va.sum_verified_answer_embedding <=> $1::vector)) > 0.50)
        )
      GROUP BY va.id, va.question, va.created_by, va.views, va.tags, va.verification_type, va.created_at, va.question_embedding, va.sum_verified_answer_embedding
      ORDER BY similarity_score DESC`,
      [question_embedding, qId]
    );

    const relatedQuestions = relatedResult.rows.map(row => ({
      id: row.id,
      question: row.question,
      created_by: row.created_by,
      views: parseInt(row.views) || 0,
      tags: row.tags || [],
      verification_type: row.verification_type,
      created_at: row.created_at,
      similarity: parseFloat(row.similarity_score),
      verification_count: parseInt(row.verification_count) || 0
    }));

    console.log(`✅ Loaded ALL ${relatedQuestions.length} related questions for question ${qId}`);
    res.json({ success: true, results: relatedQuestions });

  } catch (error) {
    console.error('Error fetching all related questions:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// =====================================================
// ========== AI SUGGESTIONS API ENDPOINTS ==========
// =====================================================
// These endpoints handle AI-generated suggestions for Q&A
// Separate from main chat flow - used in Q&A Detail page
// =====================================================

/**
 * Generate AI suggestion for a question
 * POST /api/ai-generate-suggestion
 * 
 * This endpoint:
 * 1. Takes a question ID or question text
 * 2. Searches verified_answers for similar content
 * 3. Gets VERIFIED COMMENTS from answer_verifications as Knowledge Base
 * 4. Generates an AI answer suggestion by synthesizing from verified knowledge
 * 5. Saves to ai_suggestions table
 */
router.post('/ai-generate-suggestion', async (req: Request, res: Response) => {
  try {
    const { 
      questionId, 
      questionText, 
      sourceType = 'create_question',
      originalChatMessage,
      originalAiResponse 
    } = req.body;

    if (!questionId && !questionText) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either questionId or questionText is required' 
      });
    }

    // Get the question details if questionId provided
    let question = questionText;
    let questionBody = ''; // The full content/body of the question
    let verifiedAnswerId = questionId;

    if (questionId && !questionText) {
      const questionResult = await pool.query(
        'SELECT question, answer FROM verified_answers WHERE id = $1',
        [questionId]
      );
      if (questionResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Question not found' });
      }
      question = questionResult.rows[0].question;
      questionBody = questionResult.rows[0].answer || '';
    }

    // Combine title + body for better embedding (important for short titles)
    const fullQuestionText = questionBody 
      ? `${question}\n\n${questionBody}` 
      : question;
    
    console.log(`📋 Question title: ${question.substring(0, 50)}...`);
    console.log(`📋 Question body length: ${questionBody.length} chars`);

    // Generate embedding for the FULL question (title + body)
    const embeddingResponse = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fullQuestionText })
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding');
    }

    const embeddingData = await embeddingResponse.json() as { embedding: number[] };
    const questionEmbedding = embeddingData.embedding;

    // ========== ดึงข้อมูลจาก Knowledge Base ==========
    // 1. ตรวจสอบว่าคำถามนี้ self-verified หรือยัง (ใช้ answer ของตัวเอง)
    const currentQuestionData = await pool.query(
      `SELECT id, question, answer, verification_type, created_by
       FROM verified_answers 
       WHERE id = $1`,
      [questionId]
    );
    
    const isCurrentSelfVerified = currentQuestionData.rows[0]?.verification_type === 'self';
    const currentAnswer = currentQuestionData.rows[0]?.answer || '';
    const currentCreatedBy = currentQuestionData.rows[0]?.created_by || 'Unknown';

    // ========== Approach 1: ใช้เฉพาะข้อมูลของคำถามปัจจุบันเท่านั้น ==========
    // ไม่ใช้ข้อมูลจากคำถามอื่นที่คล้ายกัน เพื่อป้องกันคำตอบปนกัน

    console.log(`📚 Current question self-verified: ${isCurrentSelfVerified}`);

    // Build context from current question's verifications AND similar verified questions
    let context = '';
    const sourcesUsed: any[] = [];
    let totalSources = 0;
    
    // ถ้าคำถามนี้ self-verified แล้ว ใช้คำตอบของตัวเอง
    if (isCurrentSelfVerified && currentAnswer) {
      context = `คำตอบที่ยืนยันแล้วสำหรับคำถามนี้ (โดย ${currentCreatedBy}):\n${currentAnswer}\n\n`;
      sourcesUsed.push({
        type: 'self_verified',
        questionId: questionId,
        verifiedBy: currentCreatedBy
      });
      totalSources++;
    }

    // ========== Approach 2: ค้นหาคำถามที่คล้ายกันจากฐานความรู้ ==========
    // ถ้าคำถามนี้ยังไม่มีคำตอบที่ยืนยัน ให้ค้นหาจากคำถามที่คล้ายกัน
    if (!isCurrentSelfVerified || totalSources === 0) {
      console.log('🔍 Searching similar verified questions from knowledge base...');
      
      // Search for:
      // 1. Self-verified questions (verification_type = 'self')
      // 2. Request-verified questions that have synthesized answer (sum_verified_answer IS NOT NULL)
      // Use higher threshold (0.6) to avoid irrelevant results
      const SIMILARITY_THRESHOLD = 0.6;
      
      const similarQuestions = await pool.query(
        `SELECT va.id, va.question, 
                CASE 
                  WHEN va.verification_type = 'request' AND va.sum_verified_answer IS NOT NULL 
                  THEN va.sum_verified_answer
                  ELSE va.answer
                END as answer,
                va.verification_type, va.created_by,
                GREATEST(
                  COALESCE(1 - (va.question_embedding <=> $1::vector), 0),
                  CASE 
                    WHEN va.sum_verified_answer_embedding IS NOT NULL 
                    THEN COALESCE(1 - (va.sum_verified_answer_embedding <=> $1::vector), 0)
                    ELSE 0
                  END
                ) as similarity
         FROM verified_answers va
         WHERE va.id != $2
           AND (va.question_embedding IS NOT NULL OR va.sum_verified_answer_embedding IS NOT NULL)
           AND (
             (va.verification_type = 'self')
             OR (va.verification_type = 'request' AND va.sum_verified_answer IS NOT NULL)
           )
           AND (
             (va.question_embedding IS NOT NULL AND (1 - (va.question_embedding <=> $1::vector)) > $3)
             OR (va.sum_verified_answer_embedding IS NOT NULL AND (1 - (va.sum_verified_answer_embedding <=> $1::vector)) > $3)
           )
         ORDER BY similarity DESC
         LIMIT 3`,
        [JSON.stringify(questionEmbedding), questionId, SIMILARITY_THRESHOLD]
      );

      if (similarQuestions.rows.length > 0) {
        console.log(`📚 Found ${similarQuestions.rows.length} similar verified questions:`);
        similarQuestions.rows.forEach((q, idx) => {
          console.log(`   ${idx+1}. Q${q.id} (${q.verification_type}): similarity=${(parseFloat(q.similarity) * 100).toFixed(1)}% - "${q.question.substring(0, 60)}..."`);
        });
        
        context += '\nคำตอบที่ยืนยันแล้วจากคำถามที่คล้ายกัน:\n';
        similarQuestions.rows.forEach((q, idx) => {
          const similarity = (parseFloat(q.similarity) * 100).toFixed(1);
          context += `\n[${idx + 1}] คำถาม: ${q.question}\n`;
          context += `    ความคล้าย: ${similarity}%\n`;
          context += `    ประเภท: ${q.verification_type === 'request' ? 'ยืนยันจากผู้เชี่ยวชาญหลายคน' : 'ยืนยันด้วยตนเอง'}\n`;
          context += `    คำตอบ: ${q.answer.substring(0, 500)}${q.answer.length > 500 ? '...' : ''}\n`;
          
          sourcesUsed.push({
            type: 'similar_verified',
            questionId: q.id,
            question: q.question,
            verificationType: q.verification_type,
            verifiedBy: q.created_by,
            similarity: parseFloat(q.similarity)
          });
          totalSources++;
        });
      } else {
        console.log('📚 No similar verified questions found');
      }
    }

    // 3. ดึง verification comments จากผู้เชี่ยวชาญ (สำหรับคำถามปัจจุบัน)
    const expertVerifications = await pool.query(
      `SELECT av.comment, av.commenter_name, av.requested_departments
       FROM answer_verifications av
       WHERE av.verified_answer_id = $1 
         AND av.comment IS NOT NULL 
         AND av.comment != ''
         AND av.verification_type = 'verification'
       ORDER BY av.created_at DESC`,
      [questionId]
    );

    if (expertVerifications.rows.length > 0) {
      context += '\nคำยืนยันจากผู้เชี่ยวชาญสำหรับคำถามนี้:\n';
      expertVerifications.rows.forEach((v, idx) => {
        const dept = v.requested_departments?.[0] || '';
        context += `- ${v.commenter_name}${dept ? ` (${dept})` : ''}: ${v.comment}\n`;
        sourcesUsed.push({
          type: 'expert_verification',
          verifiedBy: v.commenter_name,
          department: dept
        });
        totalSources++;
      });
    }

    console.log(`📚 Expert verifications: ${expertVerifications.rows.length}`);

    // ========== 4. ดึงไฟล์แนบและวิเคราะห์ (Priority 2 - รองจาก Knowledge Base) ==========
    // OPTIMIZED: Process attachments in PARALLEL for faster loading
    let attachmentContext = '';
    const attachments = await getQuestionAttachments(parseInt(questionId));
    
    if (attachments && attachments.length > 0) {
      console.log(`📎 Found ${attachments.length} attachments for question ${questionId}`);
      
      // Process attachments in parallel for faster loading
      const attachmentPromises = attachments.map(async (att): Promise<{context: string, source: any} | null> => {
        try {
          // Get full attachment data including file content
          const attachmentData = await getQuestionAttachmentData(att.id);
          
          if (attachmentData && attachmentData.file_data) {
            const mimeType = attachmentData.mime_type || '';
            const fileName = attachmentData.file_name || 'unknown';
            
            // Handle different file types
            if (mimeType.startsWith('image/')) {
              // For images - use VLM to describe
              console.log(`📎 Processing image: ${fileName}`);
              try {
                const imageBase64 = attachmentData.file_data.toString('base64');
                
                // Call Python API to analyze image with VLM
                const vlmResponse = await fetch(`${process.env.API_SERVER_URL}/analyze_image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    image_base64: imageBase64,
                    prompt: `Describe this image in detail. What information does it contain? Answer in Thai if the image contains Thai text.`
                  })
                });
                
                if (vlmResponse.ok) {
                  const vlmData = await vlmResponse.json() as { description: string };
                  if (vlmData.description) {
                    return {
                      context: `\n[ไฟล์แนบ: ${fileName}]\n${vlmData.description}\n`,
                      source: {
                        type: 'attachment_image',
                        fileName: fileName,
                        description: vlmData.description.substring(0, 100) + '...'
                      }
                    };
                  }
                }
              } catch (imgError) {
                console.warn(`⚠️ Could not analyze image ${fileName}:`, imgError);
              }
            } else if (mimeType === 'application/pdf' || mimeType.includes('document') || mimeType === 'text/plain') {
              // For PDFs and documents - extract text
              console.log(`📎 Processing document: ${fileName}`);
              try {
                const fileBase64 = attachmentData.file_data.toString('base64');
                
                // Call Python API to extract text from document
                const extractResponse = await fetch(`${process.env.API_SERVER_URL}/extract_text`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    file_base64: fileBase64,
                    file_name: fileName,
                    mime_type: mimeType
                  })
                });
                
                if (extractResponse.ok) {
                  const extractData = await extractResponse.json() as { text: string };
                  if (extractData.text && extractData.text.trim()) {
                    // Limit text length to avoid token overflow
                    const extractedText = extractData.text.substring(0, 3000);
                    return {
                      context: `\n[ไฟล์แนบ: ${fileName}]\n${extractedText}\n`,
                      source: {
                        type: 'attachment_document',
                        fileName: fileName,
                        textLength: extractData.text.length
                      }
                    };
                  }
                }
              } catch (docError) {
                console.warn(`⚠️ Could not extract text from ${fileName}:`, docError);
              }
            }
          }
        } catch (attError) {
          console.warn(`⚠️ Error processing attachment ${att.id}:`, attError);
        }
        return null;
      });
      
      // Wait for all attachments to be processed in parallel
      const attachmentResults = await Promise.allSettled(attachmentPromises);
      
      // Combine results
      for (const result of attachmentResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { context: ctx, source } = result.value;
          if (ctx) attachmentContext += ctx;
          if (source) sourcesUsed.push(source);
        }
      }
      
      if (attachmentContext) {
        console.log(`📎 Attachment context length: ${attachmentContext.length} chars`);
      }
    }

    console.log(`📚 Total sources for AI: ${totalSources}`);

    // Generate AI suggestion using LLM 
    // สร้าง system prompt โดยดูว่ามีข้อมูลหรือไม่
    const hasKnowledgeData = totalSources > 0 && context && context.trim().length > 0;
    const hasAttachments = attachmentContext && attachmentContext.trim().length > 0;
    
    // Build system prompt with priority: Knowledge Base > Attachments
    let systemPrompt = '';
    
    if (hasKnowledgeData || hasAttachments) {
      systemPrompt = `You are an AI assistant that creates answers from verified knowledge and attached files.

IMPORTANT PRIORITY RULES:
1. **PRIORITY 1 (HIGHEST)**: Use KNOWLEDGE BASE data as the main source of truth
2. **PRIORITY 2 (SECONDARY)**: Use ATTACHED FILES as supplementary information
3. If Knowledge Base and Attachments conflict, prefer Knowledge Base data
4. If only Attachments are available (no Knowledge Base), use them but note it's from attachments

Rules:
1. Use the verified answers and expert comments as your PRIMARY reference
2. Use attached file content as SECONDARY/supporting information
3. Rephrase and summarize the information clearly - do NOT copy word-for-word
4. Include all important data, numbers, and specifications mentioned
5. Answer in Thai language

Response format:
- Write in continuous paragraphs, concise and clear
- Use **bold** for important keywords
- Use bullet points for lists when appropriate
- Do not leave multiple blank lines in a row
`;

      if (hasKnowledgeData) {
        systemPrompt += `
========== KNOWLEDGE BASE DATA (PRIORITY 1 - USE THIS FIRST!) ==========
${context}
========================================================================
`;
      }

      if (hasAttachments) {
        systemPrompt += `
========== ATTACHED FILES DATA (PRIORITY 2 - SUPPLEMENTARY) ==========
${attachmentContext}
======================================================================
`;
      }
    } else {
      systemPrompt = `You are an AI assistant. There is no verified data in the knowledge base for this question yet.

Since there is NO data available, respond with exactly:
"ยังไม่มีคำตอบที่ยืนยันแล้วในฐานความรู้ กรุณารอผู้เชี่ยวชาญมายืนยัน"

Do not make up any information.`;
    }

    const userPrompt = `Question: ${question}
${questionBody ? `\nDetails: ${questionBody}` : ''}

Create a summary answer from the knowledge base:
- Write in concise paragraphs with clear main points
- Include important numbers and data if available
- If there are conflicting information, clearly state them
- Do NOT copy the original answer word-for-word
- Answer in Thai language`;

    let aiGeneratedAnswer = '';
    let aiModelUsed = 'gemma-3-4b-it';
    
    // Try to call LLM to synthesize answer
    try {
      console.log('🤖 Calling Google AI to synthesize answer...');
      
      // Use Google AI API (same as chat uses)
      const ai = new GoogleGenAI({ apiKey: process.env.Google_API_KEY });
      
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      
      const response = await ai.models.generateContent({
        model: 'gemma-3-4b-it',
        contents: fullPrompt
      });
      
      if (response && response.text) {
        aiGeneratedAnswer = response.text
          .replace(/\r\n/g, '\n')  // Normalize line endings
          .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
          .replace(/\n\n\n/g, '\n\n')  // Ensure no triple newlines
          .trim();
        console.log('✅ Google AI generated answer successfully');
      }
    } catch (llmError) {
      console.error('⚠️ Google AI call failed:', llmError);
      
      // Fallback: Try Ollama
      try {
        console.log('🔄 Trying Ollama as fallback...');
        const llmResponse = await fetch(`${process.env.API_OLLAMA}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3:latest',
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            stream: false
          })
        });
        
        if (llmResponse.ok) {
          const llmData = await llmResponse.json() as { response: string };
          aiGeneratedAnswer = (llmData.response || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          aiModelUsed = 'llama3:latest (Ollama)';
          console.log('✅ Ollama generated answer successfully');
        }
      } catch (ollamaError) {
        console.error('⚠️ Ollama also failed:', ollamaError);
      }
    }
    
    // Check if LLM incorrectly said "no data" when we actually have sources
    const noDataPhrases = [
      'ยังไม่มีคำตอบที่ยืนยันแล้ว',
      'ไม่มีข้อมูลในฐานความรู้',
      'ยังไม่มีข้อมูล',
      'No data available',
      'no verified',
      'กรุณารอผู้เชี่ยวชาญมายืนยัน'
    ];
    
    const llmSaidNoData = noDataPhrases.some(phrase => 
      aiGeneratedAnswer.toLowerCase().includes(phrase.toLowerCase())
    );
    
    // If LLM said no data but we have sources, use fallback instead
    if (llmSaidNoData && totalSources > 0) {
      console.log('⚠️ LLM incorrectly said no data, using fallback with actual sources');
      aiGeneratedAnswer = ''; // Reset to trigger fallback below
    }
    
    // Fallback if LLM fails or returns empty
    if (!aiGeneratedAnswer) {
      if (totalSources > 0) {
        // Show verified answers directly from sources
        aiGeneratedAnswer = '';
        
        // Show self-verified answer if exists
        if (isCurrentSelfVerified && currentAnswer) {
          aiGeneratedAnswer += `**คำตอบที่ยืนยันแล้ว (โดย ${currentCreatedBy}):**\n\n${currentAnswer}\n\n`;
        }
        
        // Show answers from similar verified questions
        const similarSources = sourcesUsed.filter((s: any) => s.type === 'similar_verified');
        if (similarSources.length > 0) {
          aiGeneratedAnswer += '**ข้อมูลจากคำถามที่คล้ายกัน:**\n\n';
          similarSources.forEach((source: any, idx: number) => {
            const similarity = source.similarity ? Math.round(source.similarity * 100) : 0;
            aiGeneratedAnswer += `• จากคำถาม "${source.question}" (ความคล้าย ${similarity}%)\n`;
          });
          aiGeneratedAnswer += '\n';
        }
        
        // Show expert verifications if any
        if (expertVerifications.rows.length > 0) {
          aiGeneratedAnswer += '**ความเห็นจากผู้เชี่ยวชาญ:**\n\n';
          expertVerifications.rows.forEach((v) => {
            const dept = v.requested_departments?.[0] || '';
            aiGeneratedAnswer += `• **${v.commenter_name}${dept ? ` (${dept})` : ''}:** ${v.comment}\n`;
          });
        }
        
        aiGeneratedAnswer = aiGeneratedAnswer.trim();
      } else {
        aiGeneratedAnswer = 'ยังไม่มีคำตอบที่ยืนยันแล้วในฐานความรู้ กรุณารอผู้เชี่ยวชาญมายืนยันคำตอบ';
      }
    }

    // Calculate confidence based on verified sources
    const confidence = isCurrentSelfVerified ? 1.0 : (totalSources > 0 ? 0.8 : 0);

    // Save AI suggestion to database
    const saveResult = await saveAISuggestion(
      verifiedAnswerId,
      aiGeneratedAnswer,
      sourceType as 'chat_verify' | 'create_question',
      {
        originalChatMessage,
        originalAiResponse,
        aiModelUsed,
        aiConfidence: confidence,
        sourcesUsed
      }
    );

    console.log(`✅ AI suggestion generated for question ${verifiedAnswerId} with ${totalSources} sources`);

    res.json({
      success: true,
      suggestion: {
        id: saveResult.suggestionId,
        answer: aiGeneratedAnswer,
        model: aiModelUsed,
        confidence: confidence,
        sources: sourcesUsed,
        verifiedSourcesCount: totalSources
      }
    });

  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Get AI suggestion for a question
 * GET /api/ai-suggestion/:questionId
 */
router.get('/ai-suggestion/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    
    const suggestion = await getAISuggestion(parseInt(questionId));
    
    if (!suggestion) {
      return res.json({ 
        success: true, 
        suggestion: null,
        message: 'No AI suggestion found for this question'
      });
    }

    res.json({
      success: true,
      suggestion: {
        id: suggestion.id,
        answer: suggestion.ai_generated_answer,
        model: suggestion.ai_model_used,
        confidence: suggestion.ai_confidence,
        sources: suggestion.sources_used,
        decision: suggestion.decision,
        reviewedAt: suggestion.reviewed_at,
        reviewedBy: suggestion.reviewed_by,
        createdAt: suggestion.created_at
      }
    });

  } catch (error) {
    console.error('Error getting AI suggestion:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Update AI suggestion decision after human review
 * POST /api/ai-suggestion-decision
 */
router.post('/ai-suggestion-decision', async (req: Request, res: Response) => {
  try {
    const { 
      suggestionId, 
      decision, 
      humanFinalAnswer, 
      reviewedBy,
      // For AI learning analysis
      conflictType,
      conflictDetails,
      severity
    } = req.body;

    if (!suggestionId || !decision) {
      return res.status(400).json({ 
        success: false, 
        error: 'suggestionId and decision are required' 
      });
    }

    if (!['accepted', 'modified', 'rejected'].includes(decision)) {
      return res.status(400).json({ 
        success: false, 
        error: 'decision must be: accepted, modified, or rejected' 
      });
    }

    // Update the decision
    await updateAISuggestionDecision(
      suggestionId,
      decision,
      humanFinalAnswer || '',
      reviewedBy || 'Anonymous'
    );

    // If decision is modified or rejected, save learning analysis
    if (decision !== 'accepted' && (conflictType || conflictDetails)) {
      await saveAILearningAnalysis(suggestionId, {
        conflictType: conflictType || (decision === 'rejected' ? 'incorrect_answer' : 'partial_error'),
        conflictDetails,
        severity: severity || (decision === 'rejected' ? 'major' : 'minor'),
        analyzedBy: reviewedBy || 'user'
      });
    }

    console.log(`✅ AI suggestion ${suggestionId} decision updated: ${decision}`);

    res.json({
      success: true,
      message: `Decision updated to: ${decision}`
    });

  } catch (error) {
    console.error('Error updating AI suggestion decision:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Get AI performance dashboard data
 * GET /api/ai-performance
 */
router.get('/ai-performance', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    
    const [performance, conflicts] = await Promise.all([
      getAIPerformanceSummary(days),
      getAIConflictPatterns()
    ]);

    res.json({
      success: true,
      data: {
        performance,
        conflicts,
        period: `Last ${days} days`
      }
    });

  } catch (error) {
    console.error('Error getting AI performance:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Save AI learning analysis manually
 * POST /api/ai-learning-analysis
 */
router.post('/ai-learning-analysis', async (req: Request, res: Response) => {
  try {
    const {
      suggestionId,
      conflictType,
      conflictDetails,
      severity,
      errorTags,
      suggestedPromptFix,
      suggestedRouting,
      analyzedBy
    } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'suggestionId is required' 
      });
    }

    const result = await saveAILearningAnalysis(suggestionId, {
      conflictType,
      conflictDetails,
      severity,
      errorTags,
      suggestedPromptFix,
      suggestedRouting,
      analyzedBy
    });

    res.json({
      success: true,
      analysisId: result.analysisId
    });

  } catch (error) {
    console.error('Error saving AI learning analysis:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Get Knowledge Group Analytics
 * GET /api/knowledge-group-analytics
 */
router.get('/knowledge-group-analytics', async (req: Request, res: Response) => {
  try {
    const [groupAnalytics, confidenceDistribution] = await Promise.all([
      getKnowledgeGroupAnalytics(),
      getConfidenceDistribution()
    ]);

    // Calculate summary stats
    const totalQuestions = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.total_questions || 0), 0);
    const totalRejected = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.rejected_count || 0), 0);
    const totalAccepted = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.accepted_count || 0), 0);
    const totalPending = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.pending_count || 0), 0);
    const totalHighConf = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.high_conf_count || 0), 0);
    const totalLowConf = groupAnalytics.reduce((sum: number, g: any) => sum + parseInt(g.low_conf_count || 0), 0);
    const totalDecisions = totalRejected + totalAccepted;
    
    res.json({
      success: true,
      data: {
        groupDistribution: groupAnalytics,
        confidenceDistribution,
        summary: {
          totalQuestions,
          totalPending,
          totalRejected,
          totalAccepted,
          rejectionRate: totalDecisions > 0 ? Math.round(100 * totalRejected / totalDecisions) : 0,
          highConfidenceCount: totalHighConf,
          lowConfidenceCount: totalLowConf,
          uniqueGroups: groupAnalytics.length
        }
      }
    });

  } catch (error) {
    console.error('Error getting knowledge group analytics:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// =====================================================
// ========== END AI SUGGESTIONS API ==========
// =====================================================

/**
 * Update embeddings for questions that don't have them
 * POST /api/update-missing-embeddings
 */
router.post('/update-missing-embeddings', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Updating missing embeddings...');
    
    // Get all questions without embeddings
    const questionsResult = await pool.query(`
      SELECT id, question, answer 
      FROM verified_answers 
      WHERE question_embedding IS NULL
      ORDER BY id
    `);
    
    console.log(`📋 Found ${questionsResult.rows.length} questions without embeddings`);
    
    let updated = 0;
    let failed = 0;
    
    for (const q of questionsResult.rows) {
      try {
        const fullText = `${q.question}\n\n${q.answer}`;
        
        // Generate question embedding
        const qEmbedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullText })
        });
        
        if (!qEmbedRes.ok) {
          console.warn(`⚠️ Failed to get embedding for question ${q.id}`);
          failed++;
          continue;
        }
        
        const qEmbedData = await qEmbedRes.json() as { embedding: number[] };
        const questionEmbedding = qEmbedData.embedding || [];
        
        // Generate answer embedding
        const aEmbedRes = await fetch(`${process.env.API_SERVER_URL}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: q.answer })
        });
        
        let answerEmbedding: number[] = [];
        if (aEmbedRes.ok) {
          const aEmbedData = await aEmbedRes.json() as { embedding: number[] };
          answerEmbedding = aEmbedData.embedding || [];
        }
        
        // Update database
        const qEmbStr = questionEmbedding.length > 0 ? `[${questionEmbedding.join(',')}]` : null;
        const aEmbStr = answerEmbedding.length > 0 ? `[${answerEmbedding.join(',')}]` : null;
        
        await pool.query(`
          UPDATE verified_answers 
          SET question_embedding = $1, answer_embedding = $2, last_updated_at = NOW()
          WHERE id = $3
        `, [qEmbStr, aEmbStr, q.id]);
        
        updated++;
        console.log(`✅ Updated embedding for question ${q.id} (${updated}/${questionsResult.rows.length})`);
        
      } catch (err) {
        console.error(`❌ Error updating question ${q.id}:`, err);
        failed++;
      }
    }
    
    console.log(`✅ Embedding update complete: ${updated} updated, ${failed} failed`);
    
    res.json({
      success: true,
      total: questionsResult.rows.length,
      updated,
      failed
    });
    
  } catch (error) {
    console.error('Error updating embeddings:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});