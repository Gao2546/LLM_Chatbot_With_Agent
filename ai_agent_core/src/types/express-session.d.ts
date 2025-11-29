import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      current_chat_id?: number | string | null; // Keep existing
      currentChatMode?: string | null; // Add chat mode
      currentChatModel?: string | null; // Add chat model
      [key: string]: any; // Keep for flexibility
    };
  }
}

import { Session } from 'express-session';
import { IncomingMessage } from 'http';

declare module 'http' {
  interface IncomingMessage {
    session?: Session & Partial<SessionData>;
  }
}