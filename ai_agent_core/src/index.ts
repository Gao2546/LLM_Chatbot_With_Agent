import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import authRouters from './auth.js';
import agentRouters from './agent.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleGenAI } from "@google/genai";
import fetch from 'node-fetch'; // Import the node-fetch library
import * as cheerio from 'cheerio';   // Import cheerio
import { parseStringPromise } from 'xml2js';
import { callToolFunction, GetSocketIO } from "./api.js"

// Import DB functions for session timeout cleanup
import { setCurrentChatId, setUserActiveStatus, deleteUserAndHistory, getUserByUsername, getUserActiveStatus, deleteInactiveGuestUsersAndChats, getUserByUserId, deleteAllGuestUsersAndChats } from './db.js';
// Clean up old guest users on startup (optional - commented out for stability)
// deleteAllGuestUsersAndChats();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded form data
const port = Number(process.env.PORT) || 3000;
// const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

app.use(express.static(path.join(__dirname, '..', 'public')));
// app.use(express.static(path.join(__dirname, "..",'user_files')));
// Serve static files
// app.use("/user_files", express.static(path.join(__dirname, ".." ,"user_files")));

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
// const uploadFolder = path.join(__dirname, '..', 'user_files');
// if (!fs.existsSync(uploadFolder)) {
//   fs.mkdirSync(uploadFolder);
// }

// declare module 'express-session' {
//   interface SessionData {
//     user?: {
//       id: number;
//       username: string;
//       current_chat_id?: number | string | null;
//       [key: string]: any;
//     };
//     lastAccess?: number;
//   }
// }

import { Request, Response, NextFunction } from 'express';
import { SessionOptions } from 'express-session';

// Session configuration
const sessionConfig: SessionOptions = {
  secret: 'my_secret_key', // Replace with a strong, random secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    sameSite: 'lax',
    maxAge: 1 * 1 * 24 * 60 * 60 * 1000 // 1 day in milliseconds
  }

};
const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

const CLEANUP_INTERVAL_MS =1 * 1 * 1 * 3 * 60 * 1000; // 180 sec in milliseconds

setInterval(async () => {
  // console.log('Starting periodic cleanup of inactive guest users and chats...');
  try {
    await deleteInactiveGuestUsersAndChats();
    // await deleteOrphanedUserFolders();
    console.log('Periodic cleanup completed.');
  } catch (error) {
    console.error('Error during periodic cleanup:', error);
  }
}, CLEANUP_INTERVAL_MS);

const BypassSession = ["/auth/login", "/auth/register", "/auth/styleRL.css", "/api/message", "/api/create_record", "/auth/login.js", "/auth/register.js","/auth/admin", "/auth/login?error=invalide_username_or_password", "/auth/login?success=registered", "/auth/login?error=server_error", "/auth/register?error=server_error", "/auth/register?error=username_exists", "/auth/register?error=email_exists", "/api/download-script", "/api/download-script/entrypoint.sh", "/api/download-script/entrypoint.bat", "/api/detect-platform", "/.well-known/appspecific/com.chrome.devtools.json", "/api/set-model", "/api/save_img", "/api/stop", "/api/get-all-verified-answers", "/api/search-verified-answers", "/api/submit-verified-answer", "/api/submit-verification", "/api/related-questions", "/api/related-questions-all"];
const BypassSessionNRe = ["/api/download-script", "/api/download-script/entrypoint.sh", "/api/download-script/entrypoint.bat", "/.well-known/appspecific/com.chrome.devtools.json"]

// Session timeout cleanup middleware
app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Bypass session check for public API endpoints and non-api routes
  const publicPaths = ["/auth/login", "/auth/register", "/auth/styleRL.css", "/api/message", "/api/create_record", "/auth/login.js", "/auth/register.js","/auth/admin", "/api/download-script", "/api/detect-platform", "/.well-known/appspecific/com.chrome.devtools.json", "/api/set-model", "/api/save_img", "/api/stop", "/api/get-all-verified-answers", "/api/search-verified-answers", "/api/submit-verified-answer", "/api/submit-verification", "/api/get-verifications", "/api/related-questions", "/api/related-questions-all"];
  
  if (publicPaths.includes(req.path) || req.path.startsWith('/api/get-') || req.path.startsWith('/api/search-') || req.path.startsWith('/api/submit-')) {
    return next();
  }

  try {
    const user = req.session.user;

    // If no user in session, treat as expired
    if (!user) {
      if (BypassSession.includes(req.path)) {
        return next();
      }
      else{
        return res.redirect("/")
        // res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        // res.json({ exp: true });
      }
    }

    const now = Date.now();
    const TIMEOUT_DURATION =1 * 1 * 1 * 60 * 60 * 1000; // 1 houre in milliseconds

    // Initialize lastAccess if not set
    if (!req.session.lastAccess) {
      req.session.lastAccess = now;
    }

    // Check if session has timed out
    if (now - req.session.lastAccess > TIMEOUT_DURATION) {
      const userId = user.id;
      try {
        await setCurrentChatId(userId, null);
        await setUserActiveStatus(userId, false);

        // Check if guest user
        let isGuest = false;
        if (user.isGuest !== undefined) {
          isGuest = user.isGuest;
        } else {
          // fallback: query DB
          const dbUser = await getUserByUsername(user.username);
          isGuest = dbUser?.is_guest === true;
        }

        if (isGuest) {
          await deleteUserAndHistory(userId);
          // await deleteUserFolder(userId);
        }
      } catch (cleanupErr) {
        console.error('Error during session timeout cleanup:', cleanupErr);
      }

      await req.session.destroy((err: any) => {
        if (err) {
          console.error('Error destroying expired session:', err);
        }
      });
      console.log('Session expired');
      await deleteInactiveGuestUsersAndChats();
      // await deleteOrphanedUserFolders();
      // return res.redirect('/');
      return res.json({ exp: true });
    }

    // Update last access time
    req.session.lastAccess = now;

  } catch (err) {
    console.error('Error in session timeout middleware:', err);
  }
  next();
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/communities', (req, res, next) => {
    // const {q} = req.params;
    // console.log(q);
    res.sendFile(path.join(__dirname, '..', 'public', 'community.html'));
});

// Create HTTP + WebSocket server
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Use authentication routes
app.use('/auth', authRouters);
app.use('/api', await agentRouters(io));
await GetSocketIO(io);

// Share session middleware with Socket.IO
// io.use((socket, next) => {
//   sessionMiddleware(socket.request as any, {} as any, next as any);
// });

// Socket.IO user tracking
const clients = new Map<string, { userId: number; lastSeen: number }>();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('register', async (data) => { //for update socket if when reload page
    const userId = typeof data === 'object' && data?.userId ? data.userId : data;
    if (!userId) {
      console.log("no data")
      return;
    }

    socket.data.userId = userId;

    // Check if userId already exists in clients map
    let existingSocketId = null;
    for (const [socketId, client] of clients.entries()) {
      if (client.userId === userId) {
        existingSocketId = socketId;
        break;
      }
    }

    if (existingSocketId) {
      // Update existing client's socket id and lastSeen
      clients.delete(existingSocketId);
      clients.set(socket.id, { userId, lastSeen: Date.now() });
      console.log(`User ${userId} reconnected with new socket id: ${socket.id}`);
    } else {
      // Add new client
      clients.set(socket.id, { userId, lastSeen: Date.now() });
    }

    try {
      await setUserActiveStatus(userId, true);
      socket.emit('ping');
      // console.log(`User ${userId} active`);
    } catch (err) {
      console.error('Error setting user active status:', err);
    }
  });

  socket.on('pong', () => {
    const client = clients.get(socket.id);
    console.log(`Received pong from client${client?.userId}`);
    if (client) client.lastSeen = Date.now();
  });

  socket.on('SetNewSocket', (userId) => {
    clients.set(socket.id, { userId, lastSeen: Date.now() });
  })

  // socket.on('disconnect', async () => {
  //   console.log("disconnecting")
  //   const client = clients.get(socket.id);
  //   if (!client) return;

  //   try {
  //     // await fetch(`${BASE_URL}/api/endsession`);
  //     await setUserActiveStatus(client.userId, false);
  //     // await setCurrentChatId(client.userId, null);

  //     const user = await getUserByUserId(socket.data.userId);
  //     if (user?.is_guest) {
  //       // console.log(socket.request.session);
  //       // if (socket.request && socket.request.session) {
  //       //   socket.request.session.destroy((err: any) => {
  //       //     console.log("destroying session")
  //       //     if (err) {
  //       //       console.error('Error destroying session on disconnect:', err);
  //       //     }
  //       //   });
  //       // }
  //       await deleteUserAndHistory(client.userId);
  //       console.log(`Deleted guest ${client.userId}`);
  //     }
  //   } catch (err) {
  //     console.error('Disconnect error:', err);
  //   }

  //   clients.delete(socket.id);
  //   console.log(`Socket disconnected: ${socket.id}`);
  // });
});

// Periodic check for inactive clients
const CHECK_INTERVAL_MS =1 * 1 * 1 * 1 * 40 * 1000; // 40 seconds in milliseconds
const CLIENT_TIMEOUT_MS =1 * 1 * 1 * 2.5 * 60 * 1000; // 150 seconds in milliseconds

// Periodic ping and timeout disconnect
setInterval(async () => {
  const now = Date.now();

  for (const [socketId, client] of clients.entries()) {
    if (now - client.lastSeen > CLIENT_TIMEOUT_MS) { // 20 sec timeout
      try {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
          clients.delete(socketId);
          await setUserActiveStatus(client.userId, false);
          // await setCurrentChatId(client.userId, null);
          console.log(`Client ${socketId} timed out. No socket found`);
        }
        // else{
        //   await setUserActiveStatus(client.userId, false);
        //   socket.disconnect();
        //   console.log(`Client ${socketId} timed out.`);
        // }
      } 
      catch (err) {
        console.error('Timeout status error:', err);
      }
    } else {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.emit('ping');
    }
  }
}, CHECK_INTERVAL_MS); // check every 10s

const host = '0.0.0.0'; // Add this line

httpServer.listen(port, host, () => {
  console.log(`Server listening at http://localhost:${port}`);
  // Note: Printing 'localhost' here is fine for your logs, 
  // but the server must listen on '0.0.0.0' to work in Docker.
});
