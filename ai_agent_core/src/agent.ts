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
import { saveVerifiedAnswer, searchVerifiedAnswers, updateAnswerRating, getAnswerVerifications } from './db.js';

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
    deleteQuestionAttachment
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

interface ToolData {
  toolName: string;
  arguments: {[key: string]: string[]};
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
    toolData.arguments[key] = content[key];
  }

  return toolData;
};

let io: SocketIOServer;
const router = express.Router();
export default async function agentRouters(ios: SocketIOServer) {
  io = ios;

  // === Verified Answers Endpoints ===

  // ① Rate Answer
  router.post('/rate-answer', async (req, res) => {
    try {
      const { question, answer, rating, userName } = req.body;
      
      if (!question || !answer || rating === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // สร้าง embedding จาก Python API server (สำหรับ verified_answers ต้อง 384 dimensions)
      const embeddingRes = await axios.post(
        `${process.env.API_SERVER_URL || 'http://localhost:5000'}/encode_embedding`,
        { 
          text: question,
          dimensions: 384  // ← ต้องเป็น 384 dimensions สำหรับ verified_answers table
        }
      );
      const embedding = embeddingRes.data.embedding;

      // ตรวจสอบ dimensions
      if (embedding.length !== 384) {
        throw new Error(`Invalid embedding dimensions: expected 384, got ${embedding.length}`);
      }

      // บันทึกคะแนน
      const result = await saveVerifiedAnswer(question, answer, embedding, undefined, rating, userName);
      await updateAnswerRating(result.answerId);

      res.json({ success: true, answerId: result.answerId });
    } catch (error) {
      console.error('Error rating answer:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ③ Search Verified Answers
  router.post('/search-verified-answers', async (req, res) => {
    try {
      const { question, threshold, limit } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: 'Question required' });
      }

      // สร้าง embedding (สำหรับ verified_answers ต้อง 384 dimensions)
      const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
      console.log(`Calling embedding API at ${API_SERVER_URL}/encode_embedding...`);
      
      let embedding: number[] = [];
      try {
        const embeddingRes = await axios.post(
          `${API_SERVER_URL}/encode_embedding`,
          { 
            text: question,
            dimensions: 384  // ← ต้องเป็น 384 dimensions
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
      if (embedding.length !== 384) {
        console.warn(`Warning: Expected 384 dimensions, got ${embedding.length}. Proceeding anyway...`);
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
    // The '*' captures the entire path after /storage/, including slashes
    const objectName = req.params[0];

    if (!objectName) {
        return res.status(400).send('File path is required.');
    }

    try {
        // 1. Get file metadata (like MIME type) from the database
        const fileInfo = await getFileInfoByObjectName(objectName);

        if (!fileInfo) {
            return res.status(404).send('File not found in database records.');
        }

        // 2. Get the file stream from MinIO
        const fileStream = await getFileByObjectName(objectName);
        
        // 3. Set headers to tell the browser how to handle the file
        // 'Content-Type' lets the browser know if it's an image, pdf, etc.
        res.setHeader('Content-Type', fileInfo.mime_type || 'application/octet-stream');
        // 'Content-Disposition' suggests the original filename
        res.setHeader('Content-Disposition', `inline; filename="${fileInfo.file_name}"`);
        
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


router.post('/create_record', async (req : Request, res : Response) => {
  const { message: userMessage, model: selectedModel, mode: selectedMode, role: selectedRole, socket: socketId } = req.body;
  const initialMode = selectedMode ?? 'ask';
  const initialModel = selectedModel ?? 'gemma3:1b';
  try {
    if (req.session.user){
      if (!req.session.user.currentChatId){
        const chat_history_id = await newChatHistory(req.session.user.id);
        // REMOVED: createChatFolder(req.session.user.id, chat_history_id);
        req.session.user.currentChatId = chat_history_id;
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
        const chat_history_id = await newChatHistory(req.session.user.id);
        // REMOVED: createChatFolder(req.session.user.id, chat_history_id);
        req.session.user.currentChatId = chat_history_id;
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
    const { message: userMessage, model: selectedModel, mode: selectedMode, role: selectedRole, socket: socketId ,work_dir: work_dir, requestId: requestId_} = req.body;
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
    let serch_doc = ""

    if (currentChatId){
      try {
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
            threshold: 2.0
          }),
          signal: controller.signal,
        });

        const result_similar_TopK = await response_similar_TopK.json() as SearchSimilarResponse;
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
                serch_doc += "";
              }
            } catch (error) {
              console.error(`Error processing document ${doc.file_name}:`, error);
              serch_doc += doc + "\n\n";
            }
          });
        }
      } catch (error) {
        console.warn('Could not fetch similar documents, continuing without RAG:', error);
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
        // console.log(question)
      }
    }
    catch(err) {
      console.error('Error setting chat mode:', err);
      return res.status(500).json({ error: `${err}` });
    }

    let response: { text: string } | null = null;
    
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
          
      if (rrs.length > 0) {
        rrs = rrs.map(xml =>
          xml.replace(/<text>([\s\S]*?)<\/text>/g, (match, p1) => `<text><![CDATA[\n${p1}\n]]></text>`)
             .replace(/<result>([\s\S]*?)<\/result>/g, (match, p1) => `<result><![CDATA[\n${p1}\n]]></result>`)
        );
      }
      
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
  const { chatId, messageIndex, newMessage, socketId, requestId } = req.body;
  const userId = req.session.user?.id;
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
      try {
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
            threshold: 2.0
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
      } catch (error) {
        console.warn('Could not fetch similar documents, continuing without RAG:', error);
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

    if (rows.length > 0) {
      chatContent = rows[0].message;
      chatMode = rows[0].chat_mode ?? 'code';
      chatModel = rows[0].chat_model ?? 'gemini-2.0-flash-001';
      req.session.user!.currentChatMode = chatMode;
      req.session.user!.currentChatModel = chatModel;
    } else {
      req.session.user!.currentChatMode = null;
      req.session.user!.currentChatModel = null;
    }
    const chatHistoryArray = (chatContent ? chatContent.split('\n<DATA_SECTION>\n') : []);
    res.json({ chatHistory: chatHistoryArray, chatMode: chatMode, chatModel: chatModel });
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

// =================================================================================
// NEW: RATING AND VERIFICATION ENDPOINTS
// =================================================================================

// POST /api/rate-answer - Save answer rating to PostgreSQL
router.post('/rate-answer', async (req: Request, res: Response) => {
  try {
    const { question, answer, rating, userName } = req.body;
    const userId = req.session.user?.id;

    if (!question || !answer || rating === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get embedding from Python API
    let questionEmbedding: number[] = [];
    try {
      const apiUrl = process.env.API_SERVER_URL;
      if (apiUrl) {
        const embedRes = await fetch(`${apiUrl}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: question, dimensions: 384 })
        });
        if (embedRes.ok) {
          const embedData: any = await embedRes.json();
          questionEmbedding = embedData.embedding || [];
        }
      }
    } catch (e) {
      console.warn('Could not get embedding for question:', e);
      // Continue without embedding
    }

    // Save to database using verifiedAnswers function
    let result;
    try {
      result = await saveVerifiedAnswer(question, answer, questionEmbedding, userId, rating, userName);
    } catch (dbError) {
      console.error('Database error in saveVerifiedAnswer:', dbError);
      return res.status(500).json({ success: false, error: `Database error: ${String(dbError)}` });
    }
    
    if (result && result.answerId) {
      // Update rating statistics
      try {
        await updateAnswerRating(result.answerId);
      } catch (e) {
        console.warn('Error updating rating (non-fatal):', e);
      }
    }

    res.json({ success: true, message: 'Rating saved successfully' });

  } catch (error) {
    console.error('Error rating answer:', error);
    res.status(500).json({ success: false, error: String(error) });
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
    let question, answer, comment, userName, rating, verificationType, requestedDepartments;
    let files: Express.Multer.File[] = [];

    // Check if request has multipart form data
    if (req.is('multipart/form-data') && (req as any).files) {
      // File upload case
      files = (req as any).files;
      question = req.body.question;
      answer = req.body.answer;
      comment = req.body.comment || '';
      userName = req.body.userName || 'Anonymous';
      rating = req.body.rating ?? 1;
      verificationType = req.body.verificationType || 'self';
      requestedDepartments = req.body.requestedDepartments ? JSON.parse(req.body.requestedDepartments) : [];
    } else {
      // JSON case (no files)
      ({ question, answer, comment, userName, rating = 1, verificationType = 'self', requestedDepartments = [] } = req.body);
    }

    const userId = req.session.user?.id;

    if (!question || !answer) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Validate rating value
    const validRatings = [-1, 0, 1];
    const validatedRating = validRatings.includes(parseInt(rating)) ? parseInt(rating) : 1;

    if (!validRatings.includes(validatedRating)) {
      return res.status(400).json({ success: false, error: 'Invalid rating value. Must be -1, 0, or 1' });
    }

    // Get embedding from Python API
    let questionEmbedding: number[] = [];
    try {
      const apiUrl = process.env.API_SERVER_URL;
      if (apiUrl) {
        const embedRes = await fetch(`${apiUrl}/encode_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: question })
        });
        if (embedRes.ok) {
          const embedData: any = await embedRes.json();
          questionEmbedding = embedData.embedding || [];
        }
      }
    } catch (e) {
      console.warn('Could not get embedding for question:', e);
      // Continue without embedding
    }

    // Save verified answer to database
    let result;
    try {
      result = await saveVerifiedAnswer(
        question, 
        answer, 
        questionEmbedding, 
        userId, 
        validatedRating, 
        userName || 'Anonymous', 
        comment || '',
        verificationType,
        requestedDepartments
      );
    } catch (dbError) {
      console.error('Database error in saveVerifiedAnswer:', dbError);
      return res.status(500).json({ success: false, error: `Database error: ${String(dbError)}` });
    }
    
    if (result && result.answerId) {
      // Handle file attachments
      if (files && files.length > 0) {
        try {
          for (const file of files) {
            await saveQuestionAttachment(
              result.answerId,
              file.originalname,
              file.buffer,
              file.mimetype,
              file.size,
              userName || 'Anonymous'
            );
            console.log(`Attachment saved: ${file.originalname} for question ${result.answerId}`);
          }
        } catch (fileError) {
          console.error('Error saving file attachments:', fileError);
          // Don't fail the entire request, just log the warning
          console.warn('File attachments could not be saved, but question was created successfully');
        }
      }
      
      // Update rating statistics
      try {
        await updateAnswerRating(result.answerId);
      } catch (e) {
        console.warn('Error updating rating (non-fatal):', e);
      }
      
      if (comment) {
        console.log('Verification saved with comment:', comment);
      }
      
      console.log(`Verification type: ${verificationType}, Requested departments: ${requestedDepartments.join(', ')}`);
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

// GET /api/get-all-verified-answers - Get all verified answers with calculated scores
router.get('/get-all-verified-answers', async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.user?.id || null;
    
    // Use a single query with CTEs to get all data efficiently
    const result = await pool.query(`
      WITH verification_stats AS (
        SELECT 
          verified_answer_id,
          COALESCE(SUM(CAST(rating AS FLOAT)), 0) as verification_score,
          COUNT(*) as rating_count,
          COALESCE(AVG(CAST(rating AS FLOAT)), 0) as avg_rating,
          ARRAY_AGG(DISTINCT verification_type) FILTER (WHERE verification_type IS NOT NULL) as verification_types,
          (ARRAY_AGG(commenter_name ORDER BY created_at ASC))[1] as first_user_name,
          (ARRAY_AGG(user_id ORDER BY created_at ASC))[1] as creator_user_id
        FROM answer_verifications
        GROUP BY verified_answer_id
      ),
      vote_stats AS (
        SELECT 
          question_id,
          COALESCE(SUM(vote), 0) as vote_score
        FROM question_votes
        GROUP BY question_id
      )
      SELECT 
        va.id,
        va.question,
        va.answer,
        va.created_at,
        COALESCE(va.views, 0) as views,
        COALESCE(vs.verification_score, 0) as verification_score,
        COALESCE(vts.vote_score, 0) as vote_score,
        COALESCE(vs.rating_count, 0) as rating_count,
        COALESCE(vs.avg_rating, 0) as avg_rating,
        COALESCE(vs.first_user_name, 'Anonymous') as user_name,
        vs.creator_user_id,
        COALESCE(vs.verification_types, ARRAY[]::VARCHAR[]) as verification_types,
        va.requested_departments as requested_departments_list,
        va.verification_type,
        va.tags,
        va.department
      FROM verified_answers va
      LEFT JOIN verification_stats vs ON va.id = vs.verified_answer_id
      LEFT JOIN vote_stats vts ON va.id = vts.question_id
      ORDER BY (COALESCE(vs.verification_score, 0) + COALESCE(vts.vote_score, 0)) DESC, va.created_at DESC
      LIMIT 100
    `);

    console.log('✅ Query result rows:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('📊 First row:', JSON.stringify(result.rows[0], null, 2));
    }

    const answers = result.rows.map(row => {
      // Calculate combined score
      const score = (parseFloat(row.verification_score) || 0) + (parseFloat(row.vote_score) || 0);
      
      // Determine if this is pending (request type with no positive rating)
      const verificationTypes = row.verification_types || [];
      const isPending = verificationTypes.includes('request') && score <= 0;
      const isVerified = (parseInt(row.rating_count) || 0) > 0 && score > 0;
      
      return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        score: score,
        rating_count: parseInt(row.rating_count) || 0,
        avg_rating: parseFloat(row.avg_rating) || 0,
        views: parseInt(row.views) || 0,
        user_name: row.user_name || 'Anonymous',
        user_id: row.creator_user_id,
        created_at: row.created_at,
        verification_type: row.verification_type,
        requested_departments: row.requested_departments_list || [],
        verification_types: verificationTypes,
        requested_departments_list: row.requested_departments_list || [],
        status: isPending ? '⏳ Pending' : (isVerified ? '✓ Verified' : 'Unverified'),
        is_pending: isPending,
        is_verified: isVerified,
        answered_by_user: false // Will be filled below if needed
      };
    });

    // If user is logged in, get their verifications
    if (currentUserId) {
      const userVerifications = await pool.query(
        `SELECT DISTINCT verified_answer_id FROM answer_verifications WHERE user_id = $1`,
        [currentUserId]
      );
      const userVerifiedIds = new Set(userVerifications.rows.map(r => r.verified_answer_id));
      answers.forEach(answer => {
        answer.answered_by_user = userVerifiedIds.has(answer.id);
      });
    }

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
          va.answer,
          COALESCE(SUM(av.rating), 0) as score,
          COUNT(av.id) as rating_count,
          COALESCE(AVG(CAST(av.rating AS FLOAT)), 0) as avg_rating
        FROM verified_answers va
        LEFT JOIN answer_verifications av ON va.id = av.verified_answer_id
        GROUP BY va.id
        ORDER BY score DESC
        LIMIT $1
      `, [limit]);

      return res.json({ 
        success: true, 
        results: result.rows.map(row => ({
          id: row.id,
          question: row.question,
          answer: row.answer,
          score: row.score || 0,
          avg_rating: row.avg_rating || 0
        }))
      });
    }

    // Search similar verified answers
    const results = await searchVerifiedAnswers(questionEmbedding, threshold, limit);

    // Enrich with score calculations
    const enrichedResults = results.map((r: any) => ({
      ...r,
      score: r.score || 0,
      avg_rating: r.avg_rating || 0
    }));

    res.json({ success: true, results: enrichedResults });
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

// GET /api/get-verifications/:questionId - Get all verifications/ratings for a question
router.get('/get-verifications/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    
    const result = await pool.query(
      `SELECT av.id, av.user_id, av.commenter_name as username, av.rating, 
              av.comment, av.verification_type, av.requested_departments,
              av.created_at as "createdAt",
              va.due_date as "dueDate"
       FROM answer_verifications av
       LEFT JOIN verified_answers va ON av.verified_answer_id = va.id
       WHERE av.verified_answer_id = $1
       ORDER BY av.created_at DESC`,
      [questionId]
    );
    
    const verifications = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      username: row.username || 'Anonymous',
      rating: row.rating,
      comment: row.comment,
      verificationType: row.verification_type,
      requestedDepartments: row.requested_departments || [],
      createdAt: row.createdAt,
      dueDate: row.dueDate
    }));
    
    res.json({ success: true, verifications });
  } catch (error) {
    console.error('❌ Error fetching verifications:', error);
    res.json({ success: true, verifications: [] });
  }
});

// POST /api/rate-answer - Rate an answer (quick rating without full verification)
router.post('/rate-answer', async (req: Request, res: Response) => {
  try {
    const { questionId, rating, userId, username } = req.body;
    
    if (!questionId || rating === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Check if user already rated
    const existingRating = await pool.query(
      `SELECT id FROM answer_verifications WHERE verified_answer_id = $1 AND user_id = $2`,
      [questionId, userId]
    );
    
    if (existingRating.rows.length > 0) {
      // Update existing rating
      await pool.query(
        `UPDATE answer_verifications SET rating = $1, created_at = NOW() WHERE id = $2`,
        [rating, existingRating.rows[0].id]
      );
    } else {
      // Insert new rating
      await pool.query(
        `INSERT INTO answer_verifications (verified_answer_id, user_id, commenter_name, rating, verification_type, created_at)
         VALUES ($1, $2, $3, $4, 'rating', NOW())`,
        [questionId, userId, username || 'Anonymous', rating]
      );
    }
    
    // Update avg_rating in verified_answers
    const scoreResult = await pool.query(
      `SELECT COALESCE(AVG(CAST(rating AS FLOAT)), 0) as avg_rating, COUNT(*) as rating_count 
       FROM answer_verifications WHERE verified_answer_id = $1`,
      [questionId]
    );
    
    await pool.query(
      `UPDATE verified_answers SET avg_rating = $1, rating_count = $2 WHERE id = $3`,
      [scoreResult.rows[0].avg_rating, scoreResult.rows[0].rating_count, questionId]
    );
    
    res.json({ 
      success: true, 
      newScore: scoreResult.rows[0].total_score,
      ratingCount: scoreResult.rows[0].rating_count 
    });
  } catch (error) {
    console.error('Error rating answer:', error);
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
      `SELECT id, question_id, user_id, username, text, department, attachments, created_at as "createdAt", 'comment' as source
       FROM comments 
       WHERE question_id = $1
       ORDER BY created_at DESC`,
      [questionId]
    );
    
    console.log(`Found ${commentsResult.rows.length} comments from comments table`);
    
    // Fetch verification comments from answer_verifications table
    // Include all verifications (with or without comment text)
    const verificationsResult = await pool.query(
      `SELECT id, verified_answer_id as question_id, user_id, commenter_name as username, 
              comment as text, created_at as "createdAt", rating, verification_type, requested_departments, 'verification' as source
       FROM answer_verifications 
       WHERE verified_answer_id = $1 AND rating = 1`,
      [questionId]
    );
    
    console.log(`Found ${verificationsResult.rows.length} verification comments`);
    
    // Format verification comments to match comment structure
    const formattedVerifications = verificationsResult.rows.map(v => ({
      ...v,
      department: v.requested_departments && v.requested_departments.length > 0 ? v.requested_departments[0] : null,
      attachments: []
    }));

    // Combine both sources and sort by date
    const allComments = [...commentsResult.rows, ...formattedVerifications]
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
      return res.status(400).json({ success: false, error: 'Missing required fields' });
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
    res.status(500).json({ success: false, error: String(error) });
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

    if (existingVote.rows.length > 0) {
      const oldVote = existingVote.rows[0].vote;
      
      // If clicking the same vote, remove it (toggle off)
      if (oldVote === vote) {
        await pool.query(
          `DELETE FROM question_votes WHERE question_id = $1 AND user_id = $2`,
          [questionId, userId]
        );
        userVote = 0;
      } else {
        // Update to new vote
        await pool.query(
          `UPDATE question_votes SET vote = $1, voted_at = NOW() WHERE question_id = $2 AND user_id = $3`,
          [vote, questionId, userId]
        );
      }
    } else {
      // Insert new vote
      await pool.query(
        `INSERT INTO question_votes (question_id, user_id, vote, voted_at) VALUES ($1, $2, $3, NOW())`,
        [questionId, userId, vote]
      );
    }

    // Calculate total score from votes
    const scoreResult = await pool.query(
      `SELECT COALESCE(SUM(vote), 0) as total_votes FROM question_votes WHERE question_id = $1`,
      [questionId]
    );

    const newScore = parseInt(scoreResult.rows[0].total_votes);

    // Note: verified_answers uses avg_rating for answer verifications
    // Vote score is calculated on the fly when displaying questions

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
        rating,
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
        dueDate: null,
        rating: null
      };
    });

    // Update with actual verification data
    verifications.forEach(v => {
      if (v.requested_departments && v.rating !== null) {
        v.requested_departments.forEach((dept: string) => {
          if (statusByDept[dept]) {
            statusByDept[dept].status = v.rating > 0 ? 'verified' : (v.rating < 0 ? 'rejected' : 'waiting');
            statusByDept[dept].verifiedBy = v.commenter_name;
            statusByDept[dept].verifiedDate = v.created_at;
            statusByDept[dept].dueDate = v.due_date;
            statusByDept[dept].rating = v.rating;
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
      const uniqueFilename = `comment_${timestamp}_${randomString}.${fileExtension}`;
      const objectName = `comments/${userId}/${uniqueFilename}`;

      // Upload to MinIO
      await minioClient.putObject(
        minioBucketName,
        objectName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      console.log(`Uploaded comment file: ${objectName}`);

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

    // Insert the question
    const tagsArray = Array.isArray(tags) ? tags : [];
    const result = await pool.query(`
      INSERT INTO verified_answers 
      (question, answer, tags, department, verification_type, requested_departments, due_date, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;
    `, [
      question, 
      answer, 
      tagsArray, 
      userDept,
      verificationType || 'staging',
      requestedDepartments || null,
      dueDate || null,
      username
    ]);

    const newQuestion = result.rows[0];
    console.log('✅ Question created:', newQuestion.id);

    // If self-verify, add an automatic verification
    if (verificationType === 'self' && userId) {
      await pool.query(`
        INSERT INTO answer_verifications 
        (verified_answer_id, user_id, commenter_name, rating, comment, verification_type, requested_departments, created_at)
        VALUES ($1, $2, $3, $4, $5, 'self', $6, NOW());
      `, [newQuestion.id, userId, username, 1, 'Self-verified by department', [userDept]]);
      console.log('✅ Self-verification added');
    } else if (verificationType === 'request') {
      // For request verification, add a record to track the verification request
      await pool.query(`
        INSERT INTO answer_verifications 
        (verified_answer_id, user_id, commenter_name, rating, comment, verification_type, requested_departments, created_at)
        VALUES ($1, $2, $3, $4, $5, 'request', $6, NOW());
      `, [newQuestion.id, userId || null, username, 0, 'Verification request pending', requestedDepartments || []]);
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
    const { questionId, rating, comment, department } = req.body;
    const userId = req.session.user?.id || 1; // Use guest user ID if not authenticated
    const userDept = department || req.session.user?.department || 'General';
    const commenterName = req.session.user?.username || 'Anonymous';

    if (!questionId || rating === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (![1, 0, -1].includes(rating)) {
      return res.status(400).json({ success: false, error: 'Invalid rating' });
    }

    console.log('📋 Submitting verification:', { questionId, rating, userDept, department, userId, commenterName });

    // Insert or update verification
    const result = await pool.query(`
      INSERT INTO answer_verifications 
      (verified_answer_id, user_id, commenter_name, rating, comment, verification_type, requested_departments, created_at)
      VALUES ($1, $2, $3, $4, $5, 'verification', $6, NOW())
      ON CONFLICT (verified_answer_id, user_id) DO UPDATE SET
        rating = $4,
        comment = $5,
        requested_departments = $6,
        created_at = NOW()
      RETURNING *;
    `, [questionId, userId, commenterName, rating, comment || null, [userDept]]);

    console.log('✅ Verification saved:', result.rows[0].id);

    res.json({ 
      success: true, 
      message: 'Verification submitted successfully',
      verification: result.rows[0]
    });
  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});