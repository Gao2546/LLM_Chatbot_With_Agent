import pkg from 'pg';
import dotenv from 'dotenv';
import * as Minio from 'minio'; // Import MinIO client
import { fileURLToPath } from 'url';
import path from 'path';


// Load environment variables from .env file
dotenv.config();

const { Pool } = pkg;
console.log(process.env.DATABASE_URL)
// Use the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- MinIO Client Setup ---
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

const minioBucketName = process.env.MINIO_BUCKET || 'uploads';

// --- Database Table Creation Queries (Updated) ---

const createUsersTableQuery = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    current_chat_id INTEGER,
    role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_guest BOOLEAN DEFAULT FALSE
);
`;

const createChatHistoryTableQuery = `
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    chat_mode VARCHAR(255),
    chat_model VARCHAR(255),
    doc_search_method VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
`;

// UPDATED: Replaced file_data BYTEA with object_name TEXT
const createUploadedFilesTableQuery = `
CREATE TABLE IF NOT EXISTS uploaded_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  chat_history_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  object_name TEXT UNIQUE NOT NULL, -- Stores the unique key in MinIO
  mime_type VARCHAR(255),
  file_size_bytes BIGINT,
  active_users INTEGER[] DEFAULT ARRAY[]::INTEGER[], -- <<< NEW COLUMN FOR ACTIVE USERS
  file_process_status TEXT DEFAULT 'process',
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_file_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_file_chat
    FOREIGN KEY (chat_history_id)
    REFERENCES chat_history(id)
    ON DELETE CASCADE
);
`;

const createDocumentEmbeddingsTableQuery = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_history_id INTEGER NOT NULL,
    uploaded_file_id INTEGER NOT NULL,
    extracted_text TEXT,
    embedding VECTOR(1536),
    page_number INTEGER DEFAULT -1, -- <<< NEW/UPDATED COLUMN
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doc_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_doc_chat
        FOREIGN KEY (chat_history_id)
        REFERENCES chat_history(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_doc_file
        FOREIGN KEY (uploaded_file_id)
        REFERENCES uploaded_files(id)
        ON DELETE CASCADE
);
`;
// --- NEW TABLE FOR IMAGE EMBEDDINGS ---
const createDocumentPageEmbeddingsTableQuery = `
CREATE TABLE IF NOT EXISTS document_page_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_history_id INTEGER NOT NULL,
    uploaded_file_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    embedding VECTOR(2048),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_page_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_page_chat
        FOREIGN KEY (chat_history_id)
        REFERENCES chat_history(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_page_file
        FOREIGN KEY (uploaded_file_id)
        REFERENCES uploaded_files(id)
        ON DELETE CASCADE
);
`;


const alterUsersTableQuery = `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_current_chat'
          AND table_name = 'users'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT fk_current_chat
        FOREIGN KEY (current_chat_id) REFERENCES chat_history(id) ON DELETE SET NULL;
    END IF;
END
$$;
`;

// === PGVECTOR EXTENSION ===
const enablePgvectorQuery = `
CREATE EXTENSION IF NOT EXISTS vector;
`;

// === VERIFIED ANSWERS TABLES ===
const createVerifiedAnswersTableQuery = `
CREATE TABLE IF NOT EXISTS verified_answers (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sum_verified_answer TEXT,
    tags TEXT[],
    verification_type VARCHAR(50) DEFAULT 'staging',
    question_embedding VECTOR(2048),
    answer_embedding VECTOR(2048),
    sum_verified_answer_embedding VECTOR(2048),
    views INT DEFAULT 0,
    requested_departments TEXT[],
    notify_me BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated_at TIMESTAMP DEFAULT NOW()
);
`;

const createVerifiedAnswersIndexQuery = `
-- pgvector does not support indexes for > 2000 dimensions
-- Using sequential scan for 2048-dim vectors
SELECT 1;
`;

const createAnswerVerificationsTableQuery = `
CREATE TABLE IF NOT EXISTS answer_verifications (
    id SERIAL PRIMARY KEY,
    verified_answer_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT,
    comment TEXT,
    commenter_name VARCHAR(255),
    verification_type VARCHAR(50) DEFAULT 'self',
    requested_departments TEXT[],
    attachments JSONB DEFAULT '[]'::jsonb,
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(verified_answer_id, user_id)
);
`;

const createAnswerVerificationsIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_answer_verifications_answer 
ON answer_verifications(verified_answer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_verifications_unique 
ON answer_verifications(verified_answer_id, user_id);
`;

// Comments table for Q&A
const createCommentsTableQuery = `
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT,
    username VARCHAR(255),
    text TEXT NOT NULL,
    department VARCHAR(255),
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);
`;

const createCommentsIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_comments_question 
ON comments(question_id);
`;

// Additional indexes for optimization
const createOptimizationIndexesQuery = `
-- Index for verified_answers commonly used filters
CREATE INDEX IF NOT EXISTS idx_verified_answers_verification_type 
ON verified_answers(verification_type);

CREATE INDEX IF NOT EXISTS idx_verified_answers_created_at 
ON verified_answers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verified_answers_created_by 
ON verified_answers(created_by);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_verified_answers_type_embedding 
ON verified_answers(verification_type) 
WHERE question_embedding IS NOT NULL;

-- Index for tags array search
CREATE INDEX IF NOT EXISTS idx_verified_answers_tags 
ON verified_answers USING GIN(tags);
`;

// Question Votes table for Stack Overflow style voting
const createQuestionVotesTableQuery = `
CREATE TABLE IF NOT EXISTS question_votes (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
    voted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(question_id, user_id),
    FOREIGN KEY (question_id) REFERENCES verified_answers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

const createQuestionVotesIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_question_votes_question_id ON question_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_question_votes_user_id ON question_votes(user_id);
`;

// Question Attachments table for file uploads in Q&A
const createQuestionAttachmentsTableQuery = `
CREATE TABLE IF NOT EXISTS question_attachments (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_data BYTEA NOT NULL,
    file_size_bytes BIGINT,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
`;

const createQuestionAttachmentsIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_question_attachments_question 
ON question_attachments(question_id);
`;

// Notifications table - tracks when users want to be notified for questions
const createNotificationsTableQuery = `
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verified_by_name VARCHAR(255),
    verified_by_department VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(question_id, user_id)
);
`;

const createNotificationsIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_question ON notifications(question_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
`;

// ALTER TABLE to add missing columns
const alterVerifiedAnswersAddNotifyMeQuery = `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='verified_answers' AND column_name='notify_me'
    ) THEN
        ALTER TABLE verified_answers ADD COLUMN notify_me BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;
`;

const alterVerifiedAnswersAddTagsQuery = `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='verified_answers' AND column_name='tags'
    ) THEN
        ALTER TABLE verified_answers ADD COLUMN tags TEXT[];
    END IF;
END
$$;
`;

// ALTER TABLE to add sum_verified_answer columns
const alterVerifiedAnswersAddSumColumnsQuery = `
DO $$
BEGIN
    -- Add sum_verified_answer column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='verified_answers' AND column_name='sum_verified_answer'
    ) THEN
        ALTER TABLE verified_answers ADD COLUMN sum_verified_answer TEXT;
    END IF;
    
    -- Add sum_verified_answer_embedding column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='verified_answers' AND column_name='sum_verified_answer_embedding'
    ) THEN
        ALTER TABLE verified_answers ADD COLUMN sum_verified_answer_embedding VECTOR(2048);
    END IF;
END
$$;
`;

const alterAnswerVerificationsAddUniqueConstraint = `
DO $$
BEGIN
    -- First, remove duplicate records keeping only the latest one
    DELETE FROM answer_verifications a
    USING answer_verifications b
    WHERE a.id < b.id 
      AND a.verified_answer_id = b.verified_answer_id 
      AND a.user_id = b.user_id;
    
    -- Then add UNIQUE constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'answer_verifications_user_answer_unique'
    ) THEN
        ALTER TABLE answer_verifications 
        ADD CONSTRAINT answer_verifications_user_answer_unique 
        UNIQUE (verified_answer_id, user_id);
    END IF;
END
$$;
`;

// --- NEW HELPER FOR DUMMY DATA ---
/**
 * Creates a System User (ID 0) and a Dummy Chat History (ID -1).
 * This ensures that file uploads targeting chat_id -1 have a valid foreign key relation.
 */
async function initializeDummyData() {
    try {
        // 1. Insert System User (ID 0) if not exists
        // We use ID 0 to avoid conflicts with auto-incrementing regular users (starting at 1)
        await pool.query(`
            INSERT INTO users (id, username, password, email, role, is_active, is_guest)
            VALUES (0, 'system_placeholder', NULL, 'system@local', 'admin', TRUE, FALSE)
            ON CONFLICT (id) DO NOTHING;
        `);
        console.log('DB: System user (ID 0) ensured.');

        // 2. Insert Dummy Chat History (ID -1) if not exists
        // We attach this to User ID 0
        await pool.query(`
            INSERT INTO chat_history (id, user_id, message, chat_mode, chat_model)
            VALUES (-1, 0, 'TEMP_UPLOAD_BUFFER', 'system', 'system')
            ON CONFLICT (id) DO NOTHING;
        `);
        console.log('DB: Dummy chat history (ID -1) ensured.');

    } catch (error) {
        console.error('Error initializing dummy data:', error);
        // We don't throw here to allow app to try to continue, 
        // but uploads to ID -1 will likely fail if this failed.
    }
}

// Note: Guest support columns are now integrated into the main createUsersTableQuery
// to simplify initialization. This block is no longer strictly necessary if starting fresh.
const alterGuestSupportQuery = `
ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='is_guest'
    ) THEN
        ALTER TABLE users ADD COLUMN is_guest BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;
`;


/**
 * Ensures the MinIO bucket specified in the environment variables exists.
 * Creates it if it does not.
 */
async function ensureMinIOBucketExists() {
  try {
    const bucketExists = await minioClient.bucketExists(minioBucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(minioBucketName);
      console.log(`MinIO: Bucket '${minioBucketName}' created.`);
    } else {
      console.log(`MinIO: Bucket '${minioBucketName}' already exists.`);
    }
  } catch (error) {
    console.error(`Error ensuring MinIO bucket '${minioBucketName}' exists:`, error);
    throw error;
  }
}

async function initializeDatabase() {
  const maxRetries = 30; // 30 retries * 1 second = 30 seconds max wait
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Test database connection first
      await pool.query('SELECT 1');
      console.log('DB: Database connection successful');
      break;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        console.error('Error: Could not connect to database after 30 retries');
        throw error;
      }
      console.log(`DB: Waiting for database... (attempt ${retries}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  try {
    // Enable pgvector extension first
    await pool.query(enablePgvectorQuery);
    console.log('DB: pgvector extension enabled');

    await pool.query(createUsersTableQuery);
    console.log('DB: Users table created or already exists');

    await pool.query(createChatHistoryTableQuery);
    console.log('DB: Chat history table created or already exists');

    // --- EXECUTE DUMMY DATA CREATION HERE ---
    // Must be done BEFORE uploaded_files creation creates constraints, 
    // or at least before we try to use the system.
    await initializeDummyData(); 
    console.log('DB: Create dummy chat with system user user id : 0')

    await pool.query(createUploadedFilesTableQuery); // Using updated query
    console.log('DB: Uploaded files table created or already exists');

    await pool.query(createDocumentEmbeddingsTableQuery);
    console.log('DB: Document embeddings table created or already exists (w/ page_number)');
    
    // --- ADD NEW TABLE INITIALIZATION ---
    await pool.query(createDocumentPageEmbeddingsTableQuery);
    console.log('DB: Document page embeddings table created or already exists');

    // === VERIFIED ANSWERS INITIALIZATION ===
    await pool.query(createVerifiedAnswersTableQuery);
    console.log('DB: Verified answers table created or already exists');

    // ⭐ ADD COLUMNS FIRST BEFORE CREATING INDEXES
    await pool.query(alterVerifiedAnswersAddSumColumnsQuery);
    console.log('DB: sum_verified_answer columns added to verified_answers');

    await pool.query(createVerifiedAnswersIndexQuery);
    console.log('DB: Verified answers index created or already exists');

    await pool.query(createAnswerVerificationsTableQuery);
    console.log('DB: Answer verifications table created or already exists');

    await pool.query(createAnswerVerificationsIndexQuery);
    console.log('DB: Answer verifications index created or already exists');

    // Create comments table
    await pool.query(createCommentsTableQuery);
    console.log('DB: Comments table created or already exists');

    await pool.query(createCommentsIndexQuery);
    console.log('DB: Comments index created or already exists');

    // Create optimization indexes
    await pool.query(createOptimizationIndexesQuery);
    console.log('DB: Optimization indexes created or already exists');

    // Create question votes table
    await pool.query(createQuestionVotesTableQuery);
    console.log('DB: Question votes table created or already exists');

    await pool.query(createQuestionVotesIndexQuery);
    console.log('DB: Question votes indexes created or already exists');

    // Create question attachments table
    await pool.query(createQuestionAttachmentsTableQuery);
    console.log('DB: Question attachments table created or already exists');

    await pool.query(createQuestionAttachmentsIndexQuery);
    console.log('DB: Question attachments index created or already exists');

    // Create notifications table
    await pool.query(createNotificationsTableQuery);
    console.log('DB: Notifications table created or already exists');

    await pool.query(createNotificationsIndexQuery);
    console.log('DB: Notifications indexes created or already exists');

    // Add verification_type and requested_departments columns if not exists
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='verification_type'
        ) THEN
          ALTER TABLE answer_verifications ADD COLUMN verification_type VARCHAR(50) DEFAULT 'self';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='requested_departments'
        ) THEN
          ALTER TABLE answer_verifications ADD COLUMN requested_departments TEXT[];
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='due_date'
        ) THEN
          ALTER TABLE answer_verifications ADD COLUMN due_date TIMESTAMP;
        END IF;
        
        -- Drop attachment_paths if exists and add attachments as JSONB
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='attachment_paths'
        ) THEN
          ALTER TABLE answer_verifications DROP COLUMN attachment_paths;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='attachments'
        ) THEN
          ALTER TABLE answer_verifications ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
        END IF;
      END
      $$;
    `);
    console.log('DB: verification_type, requested_departments, due_date, and attachments columns added');

    // DROP rating column and its CHECK constraint if exists
    await pool.query(`
      DO $$
      BEGIN
        -- Drop the CHECK constraint first if it exists
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'answer_verifications_rating_check'
        ) THEN
          ALTER TABLE answer_verifications DROP CONSTRAINT answer_verifications_rating_check;
        END IF;
        
        -- Then drop the rating column if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='answer_verifications' AND column_name='rating'
        ) THEN
          ALTER TABLE answer_verifications DROP COLUMN rating;
        END IF;
      END
      $$;
    `);
    console.log('DB: rating column and constraint removed from answer_verifications table');

    // DROP department, due_date columns if exists from verified_answers
    // But keep created_by column if it exists
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='verified_answers' AND column_name='department'
        ) THEN
          ALTER TABLE verified_answers DROP COLUMN department;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='verified_answers' AND column_name='due_date'
        ) THEN
          ALTER TABLE verified_answers DROP COLUMN due_date;
        END IF;
      END
      $$;
    `);
    console.log('DB: department, due_date columns removed from verified_answers table');

    // Add created_by column if not exists
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='verified_answers' AND column_name='created_by'
        ) THEN
          ALTER TABLE verified_answers ADD COLUMN created_by VARCHAR(255);
        END IF;
      END
      $$;
    `);
    console.log('DB: created_by column added to verified_answers table');

    // Add views column if not exists
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='verified_answers' AND column_name='views'
        ) THEN
          ALTER TABLE verified_answers ADD COLUMN views INT DEFAULT 0;
        END IF;
      END
      $$;
    `);
    console.log('DB: Views column added to verified_answers table');

    // Add notify_me column if not exists
    await pool.query(alterVerifiedAnswersAddNotifyMeQuery);
    console.log('DB: notify_me column added to verified_answers table');

    // Add tags column if not exists
    await pool.query(alterVerifiedAnswersAddTagsQuery);
    console.log('DB: tags column added to verified_answers table');

    // Add UNIQUE constraint to prevent duplicate user ratings
    await pool.query(alterAnswerVerificationsAddUniqueConstraint);
    console.log('DB: UNIQUE constraint added to answer_verifications table');

    // await pool.query(alterUsersTableQuery);
    console.log('DB: Foreign key added to users table');
    console.log('✅ Database initialization complete!');
    
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

// --- Initialize services on startup ---
(async () => {
  try {
    await initializeDatabase();
    console.log('✅ Database initialization complete');
    
    // Initialize AI Suggestions tables (NEW)
    await initializeAISuggestionsTables();
  } catch (error) {
    console.error('❌ FATAL: Database initialization failed:', error);
    process.exit(1);
  }
})();

(async () => {
  try {
    await ensureMinIOBucketExists();
    console.log('✅ MinIO bucket initialization complete');
  } catch (error) {
    console.error('⚠️ Warning: MinIO bucket initialization failed:', error);
    // Don't exit for MinIO, it's less critical
  }
})();

// --- MinIO File Operation Functions ---

/**
 * Uploads a file to MinIO and creates a corresponding record in the database.
 * @returns An object containing the database ID and the MinIO object name of the uploaded file record.
 */
async function uploadFile(
  userId: number,
  chatId: number,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  fileSize: number
): Promise<{ id: number; objectName: string }> {
  // Generate a unique object name to prevent collisions
  const objectName = `user_${userId}/chat_${chatId}/${Date.now()}-${fileName}`;

  try {
    // 1. Upload to MinIO
    // Provide the file size as the fourth argument and metadata as the fifth to satisfy the MinIO types.
    await minioClient.putObject(minioBucketName, objectName, fileBuffer, fileSize, {
      'Content-Type': mimeType,
    });
    console.log(`MinIO: File '${objectName}' uploaded successfully.`);

    // 2. Insert record into PostgreSQL
    const query = `
      INSERT INTO uploaded_files (user_id, chat_history_id, file_name, object_name, mime_type, file_size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    const values = [userId, chatId, fileName, objectName, mimeType, fileSize];
    const result = await pool.query(query, values);

    // ⭐ RETURN BOTH THE ID AND THE OBJECT NAME
    return { 
        id: result.rows[0].id, 
        objectName: objectName 
    };
  } catch (error) {
    console.error('Error during file upload process:', error);
    // Attempt to clean up MinIO object if DB insert fails
    try {
        await minioClient.removeObject(minioBucketName, objectName);
    } catch (cleanupError) {
        console.error(`Failed to clean up MinIO object '${objectName}' after DB error:`, cleanupError);
    }
    throw error;
  }
}

/**
 * Retrieves a file stream from MinIO based on its database ID.
 * @returns A readable stream of the file data.
 */
async function getFile(fileId: number): Promise<NodeJS.ReadableStream> {
    const query = 'SELECT object_name FROM uploaded_files WHERE id = $1';
    const result = await pool.query(query, [fileId]);

    if (result.rows.length === 0) {
        throw new Error(`File with ID ${fileId} not found in database.`);
    }

    const objectName = result.rows[0].object_name;

    try {
        const stream = await minioClient.getObject(minioBucketName, objectName);
        console.log(`MinIO: Retrieving file stream for '${objectName}'.`);
        return stream;
    } catch (error) {
        console.error(`Error getting file '${objectName}' from MinIO:`, error);
        throw error;
    }
}

/**
 * Retrieves a file stream from MinIO based on its object name.
 * @param {string} objectName The unique identifier for the object in MinIO.
 * @returns {Promise<NodeJS.ReadableStream>} A readable stream of the file data.
 */
async function getFileByObjectName(objectName: string): Promise<NodeJS.ReadableStream> {
    try {
        const stream = await minioClient.getObject(minioBucketName, objectName);
        console.log(`MinIO: Retrieving file stream for object '${objectName}'.`);
        return stream;
    } catch (error) {
        console.error(`Error getting file object '${objectName}' from MinIO:`, error);
        throw error;
    }
}

// =================================================================================
// ⭐ NEW FUNCTION ADDED HERE ⭐
// =================================================================================
/**
 * Retrieves file metadata from the database using its MinIO object name.
 * @param {string} objectName The unique identifier for the object in MinIO.
 * @returns {Promise<{file_name: string, mime_type: string} | undefined>} File metadata or undefined if not found.
 */
async function getFileInfoByObjectName(objectName: string) {
    const query = 'SELECT file_name, mime_type FROM uploaded_files WHERE object_name = $1';
    try {
        const result = await pool.query(query, [objectName]);
        return result.rows[0];
    } catch (error) {
        console.error('Error getting file info by object name:', error);
        throw error;
    }
}


/**
 * Deletes a file from MinIO and its record from the database.
 * The `ON DELETE CASCADE` will handle related embeddings.
 */
async function deleteFile(fileId: number): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get the object name from the database before deleting the record
        const selectQuery = 'SELECT object_name FROM uploaded_files WHERE id = $1';
        const result = await client.query(selectQuery, [fileId]);

        if (result.rows.length === 0) {
            console.warn(`File with ID ${fileId} not found. No deletion needed.`);
            await client.query('ROLLBACK');
            return;
        }
        const objectName = result.rows[0].object_name;

        // 2. Delete the record from PostgreSQL (CASCADE will propagate)
        const deleteQuery = 'DELETE FROM uploaded_files WHERE id = $1';
        await client.query(deleteQuery, [fileId]);
        console.log(`DB: Deleted record for file ID ${fileId}.`);

        // 3. Delete the object from MinIO
        await minioClient.removeObject(minioBucketName, objectName);
        console.log(`MinIO: Deleted object '${objectName}'.`);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting file ${fileId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}


// --- User and Chat Functions (Original + Updated) ---

async function createUser(username: string, passwordHash: string, email: string) {
  const query = 'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email';
  const values = [username, passwordHash, email];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function createGuestUser(username: string) {
  const query = `
    INSERT INTO users (username, is_guest)
    VALUES ($1, TRUE)
    RETURNING id, username, is_guest
  `;
  const values = [username];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating guest user:', error);
    throw error;
  }
}

async function getUserByUsername(username: string) {
  const query = 'SELECT * FROM users WHERE username = $1';
  const values = [username];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting user by username:', error);
    throw error;
  }
}

async function getUserByUserId(userId: number) {
  const query = 'SELECT * FROM users WHERE id = $1';
  const values = [userId];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting user by id:', error);
    throw error;
  }
}
async function getUserByEmail(email: string) {
  const query = 'SELECT * FROM users WHERE email = $1';
  const values = [email];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
}


async function newChatHistory(userId: number, selectedDocSearchMethod: string) {
  const query = 'INSERT INTO chat_history (user_id, message, doc_search_method) VALUES ($1, \'\', $2) RETURNING id';
  const values = [userId, selectedDocSearchMethod];

  try {
    const result = await pool.query(query, values);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating new chat history:', error);
    throw error;
  }
}

async function storeChatHistory(chatId: number, message: string) {
  const query = 'UPDATE chat_history SET message = $1 WHERE id = $2';
  const values = [message, chatId];

  try {
    await pool.query(query, values);
    console.log(`DB: Chat history ${chatId} updated`);
  } catch (error) {
    console.error('Error storing chat history:', error);
    throw error;
  }
}

async function listChatHistory(userId: number) {
  const query = 'SELECT id, timestamp FROM chat_history WHERE user_id = $1 ORDER BY timestamp ASC';
  const values = [userId];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('Error listing chat history:', error);
    throw error;
  }
}

async function readChatHistory(chatId: number) {
  const query = 'SELECT message, timestamp, chat_mode, chat_model, doc_search_method FROM chat_history WHERE id = $1';
  const values = [chatId];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('Error reading chat history:', error);
    throw error;
  }
}

/**
 * UPDATED: Deletes chat history and all associated files from MinIO.
 */
async function deleteChatHistory(chatId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get all object names for the given chat ID before deleting
    const res = await client.query(
        'SELECT object_name FROM uploaded_files WHERE chat_history_id = $1',
        [chatId]
    );
    const objectNames = res.rows.map(row => row.object_name);

    // 2. Delete objects from MinIO
    if (objectNames.length > 0) {
      await minioClient.removeObjects(minioBucketName, objectNames);
      console.log(`MinIO: Deleted ${objectNames.length} objects for chat ${chatId}.`);
    }

    // 3. Delete the chat history from the DB. `ON DELETE CASCADE` handles cleanup
    // of `uploaded_files` and `document_embeddings` table records.
    await client.query('DELETE FROM chat_history WHERE id = $1', [chatId]);
    console.log(`DB: Chat history ${chatId} deleted`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting chat history:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function setChatMode(chatId: number, chatMode: string) {
  const query = 'UPDATE chat_history SET chat_mode = $1 WHERE id = $2';
  const values = [chatMode, chatId];

  try {
    await pool.query(query, values);
    console.log(`DB: Chat mode for history ${chatId} updated to ${chatMode}`);
  } catch (error) {
    console.error('Error setting chat mode:', error);
    throw error;
  }
}

async function getChatMode(chatId: number) {
  const query = 'SELECT chat_mode FROM chat_history WHERE id = $1';
  const values = [chatId];

  try {
    const result = await pool.query(query, values);
    return result.rows[0]?.chat_mode ?? null;
  } catch (error) {
    console.error('Error getting chat mode:', error);
    throw error;
  }
}

async function setChatModel(chatId: number, chatModel: string) {
  const query = 'UPDATE chat_history SET chat_model = $1 WHERE id = $2';
  const values = [chatModel, chatId];

  try {
    await pool.query(query, values);
    console.log(`DB: Chat model for history ${chatId} updated to ${chatModel}`);
  } catch (error) {
    console.error('Error setting chat model:', error);
    throw error;
  }
}

async function getChatModel(chatId: number) {
  const query = 'SELECT chat_model FROM chat_history WHERE id = $1';
  const values = [chatId];

  try {
    const result = await pool.query(query, values);
    return result.rows[0]?.chat_model ?? null;
  } catch (error) {
    console.error('Error getting chat model:', error);
    throw error;
  }
}


async function setUserActiveStatus(userId: number, isActive: boolean) {
  const query = 'UPDATE users SET is_active = $1 WHERE id = $2';
  const values = [isActive, userId];
  try {
    await pool.query(query, values);
  } catch (error) {
    console.error('Error setting user active status:', error);
    throw error;
  }
}

async function getUserActiveStatus(userId: number) {
  const query = 'SELECT is_active FROM users WHERE id = $1';
  const values = [userId];
  try {
    const result = await pool.query(query, values);
    return result.rows[0]?.is_active ?? false;
  } catch (error) {
    console.error('Error getting user active status:', error);
    throw error;
  }
}

async function setCurrentChatId(userId: number, chatId: number | null) {
  const query = 'UPDATE users SET current_chat_id = $1 WHERE id = $2';
  const values = [chatId, userId];
  try {
    await pool.query(query, values);
  } catch (error) {
    console.error('Error setting current chat ID:', error);
    throw error;
  }
}

async function getCurrentChatId(userId: number) {
  const query = 'SELECT current_chat_id FROM users WHERE id = $1';
  const values = [userId];
  try {
    const result = await pool.query(query, values);
    return result.rows[0]?.current_chat_id ?? null;
  } catch (error) {
    console.error('Error getting current chat ID:', error);
    throw error;
  }
}

/**
 * UPDATED: Deletes a user, their chat history, and all their files from MinIO.
 */
async function deleteUserAndHistory(userId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get all object names for the user's files before deleting from DB
     const res = await client.query(
        'SELECT object_name FROM uploaded_files WHERE user_id = $1',
        [userId]
    );
    const objectNames = res.rows.map(row => row.object_name);

    // 2. Delete user's files from MinIO
    if (objectNames.length > 0) {
      await minioClient.removeObjects(minioBucketName, objectNames);
      console.log(`MinIO: Deleted ${objectNames.length} objects for user ${userId}.`);
    }

    // 3. Delete the user from the DB. `ON DELETE CASCADE` handles cleanup of
    // `chat_history`, `uploaded_files`, and `document_embeddings`.
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log(`DB: User ${userId} and their history/files deleted`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting user and chat history:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Iterates through inactive guest users and deletes them one by one.
 */
async function deleteInactiveGuestUsersAndChats() {
    const client = await pool.connect();
    try {
        // Find all inactive guest users
        const res = await client.query(
            'SELECT id FROM users WHERE is_guest = TRUE AND is_active = FALSE'
        );
        const userIds = res.rows.map(row => row.id);

        if (userIds.length > 0) {
             console.log(`DB: Found ${userIds.length} inactive guest users to delete.`);
             for (const userId of userIds) {
                // Use the comprehensive delete function
                await deleteUserAndHistory(userId);
             }
             console.log('DB: Finished deleting inactive guest users.');
        }

    } catch (error) {
        console.error('Error during inactive guest user cleanup:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function getUserRole(userId: number): Promise<string | null> {
  const query = 'SELECT role FROM users WHERE id = $1';
  const values = [userId];
  try {
    const result = await pool.query(query, values);
    return result.rows[0]?.role ?? null;
  } catch (error) {
    console.error('Error getting user role:', error);
    throw error;
  }
}

async function setUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
  const query = 'UPDATE users SET role = $1 WHERE id = $2';
  const values = [role, userId];
  try {
    await pool.query(query, values);
    console.log(`DB: Role for user ${userId} updated to ${role}`);
  } catch (error) {
    console.error('Error setting user role:', error);
    throw error;
  }
}

// ===================================
// === VERIFIED ANSWERS FUNCTIONS ===
// ===================================

/**
 * ① บันทึกคำตอบที่ verified
 * Saves a verified answer with question embedding
 */
async function saveVerifiedAnswer(
  question: string,
  answer: string,
  questionEmbedding: number[],
  answerEmbedding?: number[],
  userId?: number,
  commenterName?: string,
  comment?: string,
  verificationType?: string,
  requestedDepartments?: string[],
  notifyMe?: boolean,
  tags?: string[],
  createdBy?: string
) {
  try {
    // First, check if this answer already exists (by question + answer)
    const existingAnswer = await pool.query(
      `SELECT id FROM verified_answers 
       WHERE question = $1 AND answer = $2 
       LIMIT 1`,
      [question, answer]
    );

    let answerId: number;

    if (existingAnswer.rows.length > 0) {
      // Answer already exists - get its ID
      answerId = existingAnswer.rows[0].id;
      
      // Update verification_type, requested_departments, and tags if provided
      await pool.query(
        `UPDATE verified_answers 
         SET verification_type = COALESCE($1, verification_type),
             requested_departments = COALESCE($2, requested_departments),
             tags = COALESCE($3, tags),
             last_updated_at = NOW()
         WHERE id = $4`,
        [verificationType || 'self', requestedDepartments || [], tags || [], answerId]
      );
    } else {
      // Answer doesn't exist - create new one
      // Format embeddings as PostgreSQL vector string (allow NULL if no embedding)
      let questionEmbeddingStr = null;
      if (questionEmbedding && questionEmbedding.length > 0) {
        questionEmbeddingStr = `[${questionEmbedding.join(',')}]`;
      }
      let answerEmbeddingStr = null;
      if (answerEmbedding && answerEmbedding.length > 0) {
        answerEmbeddingStr = `[${answerEmbedding.join(',')}]`;
      }
      const result = await pool.query(
        `INSERT INTO verified_answers (question, answer, question_embedding, answer_embedding, verification_type, requested_departments, notify_me, tags, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [question, answer, questionEmbeddingStr, answerEmbeddingStr, verificationType || 'self', requestedDepartments || [], notifyMe || false, tags || [], createdBy || commenterName || 'Anonymous']
      );
      answerId = result.rows[0].id;
    }

    // Save verification record to answer_verifications table
    if (userId || comment || verificationType) {
      try {
        await pool.query(
          `INSERT INTO answer_verifications (verified_answer_id, user_id, comment, commenter_name, verification_type, requested_departments, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (verified_answer_id, user_id) DO UPDATE SET 
             comment = COALESCE(EXCLUDED.comment, answer_verifications.comment),
             verification_type = COALESCE(EXCLUDED.verification_type, answer_verifications.verification_type),
             requested_departments = COALESCE(EXCLUDED.requested_departments, answer_verifications.requested_departments)`,
          [answerId, userId || null, comment || null, commenterName || 'Anonymous', verificationType || 'self', requestedDepartments || [], null]
        );
      } catch (verifyError) {
        console.error('Error saving answer verification record:', verifyError);
        // Continue even if verification record fails to save
      }
    }

    return { success: true, answerId };
  } catch (error) {
    console.error('Error saving verified answer:', error);
    throw error;
  }
}

/**
 * Trigger notifications for all users who enabled notifications for a question
 * Get users with notify_me=true from verified_answers, create notification records
 */
async function triggerNotificationsForQuestion(
  questionId: number,
  verifiedByName: string = 'Anonymous',
  verifiedByDepartment: string = ''
) {
  try {
    // Get the user who created this question and has notify_me = true
    // Join with users table to get user_id from created_by username
    const result = await pool.query(
      `SELECT u.id as user_id, va.created_by
       FROM verified_answers va
       JOIN users u ON u.username = va.created_by
       WHERE va.id = $1 AND va.notify_me = true`,
      [questionId]
    );

    if (result.rows.length === 0) {
      console.log(`No users to notify for question ${questionId} (notify_me not enabled or user not found)`);
      return;
    }

    // For each user, create a notification
    for (const row of result.rows) {
      const userId = row.user_id;
      const createdBy = row.created_by;
      
      // ✅ Don't send notification if the verifier is the question creator (self-verification)
      // This means the request shows "✓ Requested by username" and should not trigger bell notification
      if (verifiedByName === createdBy) {
        console.log(`⏭️ Skipping notification for question ${questionId} - self-verification by ${verifiedByName}`);
        continue;
      }
      
      try {
        await pool.query(
          `INSERT INTO notifications (question_id, user_id, verified_by_name, verified_by_department, is_read)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (question_id, user_id) DO UPDATE SET
             verified_by_name = EXCLUDED.verified_by_name,
             verified_by_department = EXCLUDED.verified_by_department,
             is_read = FALSE,
             created_at = NOW()`,
          [questionId, userId, verifiedByName, verifiedByDepartment, false]
        );
      } catch (err) {
        console.error(`Error creating notification for user ${userId}:`, err);
        // Continue with other users
      }
    }

    console.log(`✅ Triggered notifications for ${result.rows.length} users for question ${questionId}`);
  } catch (error) {
    console.error('Error triggering notifications:', error);
    // Don't fail the verification if notifications fail
  }
}

/**
 * ② ค้นหาคำตอบคล้ายกัน (Vector Similarity)
 * Searches for verified answers using vector similarity
 * Searches both question_embedding AND answer_embedding for better matching
 * NOTE: threshold default = 0.3 สำหรับ cross-lingual search (ไทย<->อังกฤษ)
 */
async function searchVerifiedAnswers(
  questionEmbedding: number[],
  threshold: number = 0.3,  // ← ลดจาก 0.7 เป็น 0.3 สำหรับ cross-lingual
  limit: number = 5
) {
  try {
    // Validate embedding
    if (!questionEmbedding || questionEmbedding.length === 0) {
      console.warn('Empty embedding provided, returning empty results');
      return [];
    }

    // Format embedding as PostgreSQL vector string
    const embeddingStr = `[${questionEmbedding.join(',')}]`;

    // First, check how many verified answers have embeddings
    const countResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(question_embedding) as with_q_emb,
        COUNT(sum_verified_answer_embedding) as with_sum_emb,
        COUNT(CASE WHEN verification_type = 'request' AND sum_verified_answer IS NOT NULL THEN 1 END) as request_with_sum
      FROM verified_answers
    `);
    console.log('📊 Verified Answers Stats:', countResult.rows[0]);

    // Search using question and answer embeddings, prioritize sum_verified_answer for request type
    // For 'request' type with sum_verified_answer, use it; otherwise use regular answer
    // IMPORTANT: Include questions that have sum_verified_answer_embedding even if question_embedding is NULL
    // FILTER: Only include VERIFIED answers (verification_type != 'staging')
    //   - 'self': Self-verified by creator
    //   - 'request': Requested verification from others (with sum_verified_answer = verified)
    const result = await pool.query(
      `SELECT 
        id,
        question,
        CASE 
          WHEN verification_type = 'request' AND sum_verified_answer IS NOT NULL 
          THEN sum_verified_answer
          ELSE answer
        END as answer,
        verification_type,
        created_by,
        tags,
        GREATEST(
          COALESCE(1 - (question_embedding <-> $1::vector), 0),
          COALESCE(1 - (answer_embedding <-> $1::vector), 0),
          CASE 
            WHEN sum_verified_answer_embedding IS NOT NULL 
            THEN COALESCE(1 - (sum_verified_answer_embedding <-> $1::vector), 0)
            ELSE 0
          END
        ) as similarity
       FROM verified_answers
       WHERE verification_type != 'staging'
         AND (
           (verification_type = 'self')
           OR (verification_type = 'request' AND sum_verified_answer IS NOT NULL)
         )
         AND (question_embedding IS NOT NULL OR sum_verified_answer_embedding IS NOT NULL)
         AND (
           (question_embedding IS NOT NULL AND 1 - (question_embedding <-> $1::vector) > $2)
           OR (answer_embedding IS NOT NULL AND 1 - (answer_embedding <-> $1::vector) > $2)
           OR (sum_verified_answer_embedding IS NOT NULL AND 1 - (sum_verified_answer_embedding <-> $1::vector) > $2)
         )
       ORDER BY similarity DESC
       LIMIT $3`,
      [embeddingStr, threshold, limit]
    );

    console.log(`🔍 searchVerifiedAnswers: threshold=${threshold}, found ${result.rows.length} results`);
    if (result.rows.length > 0) {
      result.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. Q${row.id} (${row.verification_type}): similarity=${row.similarity.toFixed(3)} - "${row.question.substring(0, 80)}..."`);
      });
    }

    return result.rows;
  } catch (error) {
    console.error('Error searching verified answers:', error);
    throw error;
  }
}

/**
 * HYBRID SEMANTIC SEARCH - Enhanced version with keyword and freshness scoring
 * 
 * This function enhances vector similarity with:
 * 1. Keyword extraction and matching (stopwords removed)
 * 2. Freshness scoring (exponential decay, 180-day half-life)
 * 3. Weighted combination: Vector 55% + Keyword 30% + Freshness 15%
 * 
 * @param questionText - The question text (will generate embedding)
 * @param threshold - Minimum vector similarity threshold (default: 0.25, lower for better recall)
 * @param limit - Maximum results to return
 * @returns Array of results with confidence scores and match details
 */
async function searchVerifiedAnswersHybrid(
  questionText: string,
  threshold: number = 0.25,  // Lower threshold for better recall
  limit: number = 10
) {
  try {
    // 1. Generate embedding for question
    const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:5000';
    const embeddingResponse = await fetch(`${API_SERVER_URL}/encode_embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: questionText, dimensions: 2048, is_query: true })
    });
    
    if (!embeddingResponse.ok) {
      console.error('Failed to get embedding for hybrid search');
      return [];
    }
    
    const embeddingData = await embeddingResponse.json();
    const questionEmbedding = embeddingData.embedding;
    
    if (!questionEmbedding || questionEmbedding.length === 0) {
      console.warn('Empty embedding provided, returning empty results');
      return [];
    }

    const embeddingStr = `[${questionEmbedding.join(',')}]`;

    // 2. Get vector similarity results (broad search) - using COSINE distance (<=>)
    // FILTER: Only include VERIFIED answers (verification_type != 'staging')
    const vectorResults = await pool.query(
      `SELECT 
        id,
        question,
        CASE 
          WHEN verification_type = 'request' AND sum_verified_answer IS NOT NULL 
          THEN sum_verified_answer
          ELSE answer
        END as answer,
        verification_type,
        created_by,
        tags,
        created_at,
        GREATEST(
          COALESCE(1 - (question_embedding <=> $1::vector), 0),
          COALESCE(1 - (answer_embedding <=> $1::vector), 0),
          CASE 
            WHEN sum_verified_answer_embedding IS NOT NULL 
            THEN COALESCE(1 - (sum_verified_answer_embedding <=> $1::vector), 0)
            ELSE 0
          END
        ) as similarity
       FROM verified_answers
       WHERE verification_type != 'staging'
         AND (
           (verification_type = 'self')
           OR (verification_type = 'request' AND sum_verified_answer IS NOT NULL)
         )
         AND (question_embedding IS NOT NULL OR sum_verified_answer_embedding IS NOT NULL)
         AND (
           (question_embedding IS NOT NULL AND 1 - (question_embedding <=> $1::vector) > $2)
           OR (answer_embedding IS NOT NULL AND 1 - (answer_embedding <=> $1::vector) > $2)
           OR (sum_verified_answer_embedding IS NOT NULL AND 1 - (sum_verified_answer_embedding <=> $1::vector) > $2)
         )
       ORDER BY similarity DESC
       LIMIT $3`,
      [embeddingStr, threshold, limit * 2] // Get more results for hybrid filtering
    );

    console.log(`🔍 Hybrid Search: Vector search found ${vectorResults.rows.length} results (threshold=${threshold})`);

    if (vectorResults.rows.length === 0) {
      return [];
    }

    // 3. Extract keywords from query (simple version - remove stopwords)
    const queryKeywords = extractKeywordsSimple(questionText);
    console.log(`   Query keywords: [${queryKeywords.join(', ')}]`);

    // 4. Score each result with hybrid approach
    const hybridResults = vectorResults.rows.map(row => {
      // Vector score
      const vectorScore = row.similarity;

      // Keyword score (Jaccard similarity)
      const docKeywords = extractKeywordsSimple(row.question);
      const intersection = queryKeywords.filter(kw => docKeywords.includes(kw));
      const union = [...new Set([...queryKeywords, ...docKeywords])];
      const keywordScore = union.length > 0 ? intersection.length / union.length : 0;

      // Freshness score (exponential decay, 180-day half-life)
      const now = new Date();
      const createdAt = row.created_at ? new Date(row.created_at) : now;
      const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const freshnessScore = Math.max(Math.pow(0.5, ageDays / 180), 0.01); // Min 0.01

      // Weighted combination: Vector 55% + Keyword 30% + Freshness 15%
      const confidenceScore = (vectorScore * 0.55) + (keywordScore * 0.30) + (freshnessScore * 0.15);

      return {
        ...row,
        vectorScore,
        keywordScore,
        freshnessScore,
        confidenceScore,
        matchedKeywords: intersection.length,
        totalKeywords: queryKeywords.length
      };
    });

    // 5. Filter by minimum confidence (increased to 0.50 for better quality)
    const minConfidence = 0.50;
    const filtered = hybridResults.filter(r => r.confidenceScore >= minConfidence);

    // 6. Sort by confidence score
    filtered.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // 7. Limit results
    const final = filtered.slice(0, limit);

    console.log(`   Hybrid results: ${vectorResults.rows.length} → ${filtered.length} → ${final.length} (after scoring & limit)`);
    if (final.length > 0) {
      final.forEach((r, idx) => {
        console.log(`   ${idx + 1}. Q${r.id}: confidence=${(r.confidenceScore * 100).toFixed(1)}% [vec:${(r.vectorScore * 100).toFixed(0)}% kw:${(r.keywordScore * 100).toFixed(0)}% fresh:${(r.freshnessScore * 100).toFixed(0)}%] "${r.question.substring(0, 60)}..."`);
      });
    }

    return final;
  } catch (error) {
    console.error('Error in hybrid semantic search:', error);
    throw error;
  }
}

/**
 * Simple keyword extraction helper
 * Removes stopwords and short words
 */
function extractKeywordsSimple(text: string): string[] {
  const stopwords = new Set([
    // English
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'can', 'may', 'might', 'must', 'of', 'at', 'by', 'for',
    'with', 'about', 'against', 'between', 'into', 'through', 'during',
    'to', 'from', 'in', 'out', 'on', 'off', 'over', 'under', 'how',
    'what', 'which', 'who', 'when', 'where', 'why', 'this', 'that',
    // Thai
    'ที่', 'ใน', 'การ', 'เป็น', 'ของ', 'มี', 'ได้', 'จาก', 'และ', 'ให้',
    'ต้อง', 'จะ', 'อยู่', 'แล้ว', 'ด้วย', 'ว่า', 'คือ', 'ซึ่ง', 'นี้', 'นั้น',
    'ไม่', 'หรือ', 'เพราะ', 'โดย', 'เพื่อ', 'กับ', 'เช่น'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\sก-๙]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopwords.has(word) && !/^\d+$/.test(word))
    .filter((word, idx, arr) => arr.indexOf(word) === idx); // Remove duplicates
}

/**
 * ③ ดึงคะแนนและคอมเมนต์
 * Retrieves ratings and comments for a verified answer
 */
async function getAnswerVerifications(answerId: number) {
  try {
    const result = await pool.query(
      `SELECT commenter_name, rating, comment, created_at
       FROM answer_verifications
       WHERE verified_answer_id = $1
       ORDER BY created_at DESC`,
      [answerId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting verifications:', error);
    throw error;
  }
}

/**
 * ④ Filter Questions by type
 * - all: ทั้งหมด
 * - my-questions: สร้างโดยผู้ใช้เอง
 * - my-answers: ผู้ใช้ไปเม้น/comment
 * - pending-review: รีวิวยังไม่เสร็จ (verification_count > 0 && verification_count < requested_departments count)
 * - unverified: ยังไม่มีการตรวจสอบเลย (verification_count = 0)
 */
async function filterQuestionsByType(
  filterType: string,
  username?: string,
  sortBy: string = 'newest',
  limit: number = 20,
  page: number = 1
) {
  try {
    let query = `
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
        (SELECT COUNT(DISTINCT dept) 
         FROM (
           SELECT UNNEST(av.requested_departments) AS dept
           FROM answer_verifications av
           WHERE av.verified_answer_id = va.id 
           AND av.verification_type = 'verification'
           AND av.commenter_name IS NOT NULL 
           AND av.commenter_name != ''
           AND av.requested_departments IS NOT NULL
           AND ARRAY_LENGTH(av.requested_departments, 1) > 0
         ) AS verified_depts
         WHERE dept = ANY(va.requested_departments)
        ) as verification_count,
        COALESCE(ARRAY_LENGTH(va.requested_departments, 1), 0) as total_requested_depts,
        COALESCE((SELECT SUM(vote) FROM question_votes WHERE question_id = va.id), 0) as vote_score
      FROM verified_answers va
    `;

    const params: any[] = [];

    // Apply filter logic
    switch (filterType) {
      case 'my-questions':
        if (username) {
          query += ` WHERE va.created_by = $1`;
          params.push(username);
        }
        break;

      case 'my-answers':
        if (username) {
          query += ` WHERE EXISTS (
            SELECT 1 FROM comments 
            WHERE question_id = va.id AND username = $1
          )`;
          params.push(username);
        }
        break;

      case 'pending-review':
        // verification_type = 'request' AND has actual verified count > 0 but < total_requested_depts
        query += ` WHERE va.verification_type = 'request'
                   AND ARRAY_LENGTH(va.requested_departments, 1) > 0
                   AND (SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != '') > 0
                   AND (SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != '') < ARRAY_LENGTH(va.requested_departments, 1)`;
        break;

      case 'unverified':
        // verification_type = 'request' AND verification_count = 0 (no actual verifications yet)
        query += ` WHERE va.verification_type = 'request'
                   AND COALESCE((SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != ''), 0) = 0`;
        break;

      case 'verified':
        // Self-verified OR fully verified request (verification_count >= total_requested_depts)
        query += ` WHERE (va.verification_type = 'self')
                   OR (va.verification_type = 'request' 
                       AND ARRAY_LENGTH(va.requested_departments, 1) > 0
                       AND (SELECT COUNT(DISTINCT dept) 
                        FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                        WHERE av.verified_answer_id = va.id 
                        AND av.verification_type = 'verification'
                        AND av.commenter_name IS NOT NULL 
                        AND av.commenter_name != ''
                        AND dept = ANY(va.requested_departments)) >= ARRAY_LENGTH(va.requested_departments, 1))`;
        break;

      case 'all':
      default:
        // Show all (no WHERE clause needed)
        break;
    }

    // Apply sort
    switch (sortBy) {
      case 'score':
        query += ` ORDER BY verification_count DESC, va.created_at DESC`;
        break;
      case 'views':
        query += ` ORDER BY views DESC, va.created_at DESC`;
        break;
      case 'verified':
        query += ` ORDER BY verification_count DESC, va.created_at DESC`;
        break;
      case 'newest':
      default:
        query += ` ORDER BY va.created_at DESC`;
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;
    
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    query += ` LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
    params.push(limit);
    params.push(offset);

    const result = await pool.query(query, params);

    return result.rows.map(row => {
      const verificationType = row.verification_type;
      const verificationCount = parseInt(row.verification_count) || 0;
      const totalRequestedDepts = parseInt(row.total_requested_depts) || 0;
      
      // Determine if fully verified
      let isFullyVerified = false;
      if (verificationType === 'self') {
        // Self-verified is always considered verified
        isFullyVerified = true;
      } else if (verificationType === 'request') {
        // Request type: check if all requested departments have verified
        if (totalRequestedDepts > 0) {
          isFullyVerified = verificationCount >= totalRequestedDepts;
        } else {
          // No departments requested, consider verified if has any verification
          isFullyVerified = verificationCount > 0;
        }
      }
      
      return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        created_at: row.created_at,
        created_by: row.created_by,
        views: parseInt(row.views) || 0,
        verification_type: verificationType,
        requested_departments: row.requested_departments_list || [],
        tags: row.tags || [],
        verification_count: verificationCount,
        total_requested_depts: totalRequestedDepts,
        vote_score: parseInt(row.vote_score) || 0,
        user_has_answered: parseInt(row.user_comment_count) > 0,
        is_fully_verified: isFullyVerified
      };
    });
  } catch (error) {
    console.error('Error filtering questions:', error);
    throw error;
  }
}

/**
 * Count total questions by filter type (for pagination)
 */
async function countQuestionsByType(filterType: string, username?: string): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as total FROM verified_answers va`;
    const params: any[] = [];

    switch (filterType) {
      case 'my-questions':
        if (username) {
          query += ` WHERE va.created_by = $1`;
          params.push(username);
        }
        break;

      case 'my-answers':
        if (username) {
          query += ` WHERE EXISTS (
            SELECT 1 FROM comments 
            WHERE question_id = va.id AND username = $1
          )`;
          params.push(username);
        }
        break;

      case 'pending-review':
        query += ` WHERE va.verification_type = 'request'
                   AND ARRAY_LENGTH(va.requested_departments, 1) > 0
                   AND (SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != '') > 0
                   AND (SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != '') < ARRAY_LENGTH(va.requested_departments, 1)`;
        break;

      case 'unverified':
        query += ` WHERE va.verification_type = 'request'
                   AND COALESCE((SELECT COUNT(DISTINCT dept) 
                    FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                    WHERE av.verified_answer_id = va.id 
                    AND av.verification_type = 'verification'
                    AND av.commenter_name IS NOT NULL 
                    AND av.commenter_name != ''), 0) = 0`;
        break;

      case 'verified':
        query += ` WHERE (va.verification_type = 'self')
                   OR (va.verification_type = 'request' 
                       AND ARRAY_LENGTH(va.requested_departments, 1) > 0
                       AND (SELECT COUNT(DISTINCT dept) 
                        FROM answer_verifications av, UNNEST(av.requested_departments) AS dept
                        WHERE av.verified_answer_id = va.id 
                        AND av.verification_type = 'verification'
                        AND av.commenter_name IS NOT NULL 
                        AND av.commenter_name != ''
                        AND dept = ANY(va.requested_departments)) >= ARRAY_LENGTH(va.requested_departments, 1))`;
        break;

      case 'all':
      default:
        break;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0]?.total) || 0;
  } catch (error) {
    console.error('Error counting questions:', error);
    return 0;
  }
}

/**
 * Get Hot Tags - Most used tags from all questions
 */
async function getHotTags(limit: number = 8) {
  try {
    const result = await pool.query(`
      SELECT tag, COUNT(*) as count
      FROM verified_answers, UNNEST(tags) AS tag
      WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0
      GROUP BY tag
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      tag: row.tag,
      count: parseInt(row.count) || 0
    }));
  } catch (error) {
    console.error('Error getting hot tags:', error);
    return [];
  }
}

/**
 * Iterates through ALL guest users and deletes them.
 */
async function deleteAllGuestUsersAndChats() {
  const client = await pool.connect();
    try {
        const res = await client.query('SELECT id FROM users WHERE is_guest = TRUE');
        const userIds = res.rows.map(row => row.id);

        if (userIds.length > 0) {
            console.log(`DB: Found ${userIds.length} guest users to delete.`);
            for (const userId of userIds) {
                await deleteUserAndHistory(userId);
            }
            console.log('DB: Finished deleting all guest users.');
        }

    } catch (error) {
        console.error('Error deleting all guest users:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function getFilesByChatId(chatId: number) {
  const query = `
    SELECT id, file_name, object_name, mime_type, file_size_bytes, active_users, file_process_status, uploaded_at 
    FROM uploaded_files 
    WHERE chat_history_id = $1 
    ORDER BY uploaded_at DESC
  `;
  try {
    const result = await pool.query(query, [chatId]);
    return result.rows;
  } catch (error) {
    console.error(`Error getting files for chat ${chatId}:`, error);
    throw error;
  }
}

// =================================================================================
// ⭐ NEW FUNCTIONS FOR ACTIVE USERS MANAGEMENT ⭐
// =================================================================================

/**
 * Appends a user ID to the active_users array for a specific file.
 * Prevents duplicates (only adds if not already present).
 */
async function addActiveUserToFile(fileId: number, userId: number) {
  const query = `
    UPDATE uploaded_files
    SET active_users = CASE
        WHEN NOT ($1 = ANY(active_users)) THEN array_append(active_users, $1)
        ELSE active_users
    END
    WHERE id = $2
    RETURNING active_users;
  `;
  try {
    const result = await pool.query(query, [userId, fileId]);
    return result.rows[0]?.active_users || [];
  } catch (error) {
    console.error(`Error adding active user ${userId} to file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Removes a user ID from the active_users array for a specific file.
 */
async function removeActiveUserFromFile(fileId: number, userId: number) {
  const query = `
    UPDATE uploaded_files
    SET active_users = array_remove(active_users, $1)
    WHERE id = $2
    RETURNING active_users;
  `;
  try {
    const result = await pool.query(query, [userId, fileId]);
    return result.rows[0]?.active_users || [];
  } catch (error) {
    console.error(`Error removing active user ${userId} from file ${fileId}:`, error);
    throw error;
  }
}

async function getDocSearchStatus(chatID: number) {
  const query = 'SELECT doc_search_method FROM chat_history WHERE id = $1';
  const values = [chatID];

  try {
    const result = await pool.query(query, values);
    console.log(`DB: Retrieved document search method for chat history ${chatID}: ${result.rows[0]?.doc_search_method ?? null}`);
    return result.rows[0]?.doc_search_method ?? null;
  } catch (error) {
    console.error('Error getting document search method:', error);
    throw error;
  }
}

async function setDocSearchStatus(chatID: number, method: string) {
  const query = 'UPDATE chat_history SET doc_search_method = $1 WHERE id = $2';
  const values = [method, chatID];

  try {
    await pool.query(query, values);
    console.log(`DB: Document search method for chat history ${chatID} updated to ${method}`);
  } catch (error) {
    console.error('Error setting document search method:', error);
    throw error;
  }
}


// These startup cleanup functions can be run if needed.
// await deleteAllGuestUsersAndChats();

// ===================================
// === QUESTION ATTACHMENTS FUNCTIONS ===
// ===================================

/**
 * Saves a file attachment to a question
 * @param questionId The ID of the question
 * @param fileName The name of the file
 * @param fileData The file data as Buffer
 * @param mimeType The MIME type of the file
 * @param fileSizeBytes The size of the file in bytes
 * @param uploadedBy The username of who uploaded the file
 * @returns The ID of the attachment record
 */
async function saveQuestionAttachment(
  questionId: number,
  fileName: string,
  fileData: Buffer,
  mimeType: string,
  fileSizeBytes: number,
  uploadedBy: string
): Promise<number> {
  try {
    const result = await pool.query(
      `INSERT INTO question_attachments (question_id, file_name, mime_type, file_data, file_size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [questionId, fileName, mimeType, fileData, fileSizeBytes, uploadedBy]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving question attachment:', error);
    throw error;
  }
}

/**
 * Gets all attachments for a question
 * @param questionId The ID of the question
 * @returns Array of attachment metadata (excluding file_data)
 */
async function getQuestionAttachments(questionId: number) {
  try {
    const result = await pool.query(
      `SELECT id, file_name, mime_type, file_size_bytes, uploaded_by, created_at 
       FROM question_attachments 
       WHERE question_id = $1 
       ORDER BY created_at DESC`,
      [questionId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting question attachments:', error);
    throw error;
  }
}

/**
 * Gets a specific attachment file data
 * @param attachmentId The ID of the attachment
 * @returns Object with file_name, mime_type, and file_data (Buffer)
 */
async function getQuestionAttachmentData(attachmentId: number) {
  try {
    const result = await pool.query(
      `SELECT file_name, mime_type, file_data 
       FROM question_attachments 
       WHERE id = $1`,
      [attachmentId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Attachment with ID ${attachmentId} not found`);
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error getting question attachment data:', error);
    throw error;
  }
}

/**
 * Deletes an attachment from a question
 * @param attachmentId The ID of the attachment
 */
async function deleteQuestionAttachment(attachmentId: number): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM question_attachments WHERE id = $1`,
      [attachmentId]
    );
    console.log(`DB: Attachment ${attachmentId} deleted`);
  } catch (error) {
    console.error('Error deleting question attachment:', error);
    throw error;
  }
}

/**
 * Saves verification attachment paths to MinIO
 * @param verificationId The ID of the verification record
 * @param attachmentPaths Array of MinIO object paths
 */
async function saveVerificationAttachments(
  verificationId: number,
  attachmentPaths: string[]
): Promise<void> {
  try {
    await pool.query(
      `UPDATE answer_verifications 
       SET attachment_paths = $1
       WHERE id = $2`,
      [attachmentPaths, verificationId]
    );
    console.log(`DB: Verification ${verificationId} attachments saved`);
  } catch (error) {
    console.error('Error saving verification attachments:', error);
    throw error;
  }
}

/**
 * Gets attachments for a verification
 * @param verificationId The ID of the verification
 * @returns Array of attachment paths from MinIO
 */
async function getVerificationAttachments(verificationId: number): Promise<string[]> {
  try {
    const result = await pool.query(
      `SELECT attachment_paths FROM answer_verifications WHERE id = $1`,
      [verificationId]
    );
    if (result.rows.length === 0) {
      return [];
    }
    return result.rows[0].attachment_paths || [];
  } catch (error) {
    console.error('Error getting verification attachments:', error);
    throw error;
  }
}

/**
 * Gets all attachments for all verifications of an answer
 * @param answerId The ID of the verified answer
 * @returns Array of verification records with their attachments
 */
async function getAnswerVerificationAttachments(answerId: number) {
  try {
    const result = await pool.query(
      `SELECT id, commenter_name, comment, attachment_paths, created_at
       FROM answer_verifications
       WHERE verified_answer_id = $1 AND attachment_paths IS NOT NULL AND array_length(attachment_paths, 1) > 0
       ORDER BY created_at DESC`,
      [answerId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting answer verification attachments:', error);
    throw error;
  }
}

/**
 * Updates the file_process_status for a specific uploaded file.
 * @param fileId The ID of the file
 * @param status The new status string (e.g., 'process', 'done', 'error')
 * @returns The updated file record (id and file_process_status)
 */
async function setFileProcessStatus(fileId: number, status: string) {
  const query = `
    UPDATE uploaded_files
    SET file_process_status = $1
    WHERE id = $2
    RETURNING id, file_process_status;
  `;
  try {
    const result = await pool.query(query, [status, fileId]);
    return result.rows[0];
  } catch (error) {
    console.error(`Error setting file_process_status for file ${fileId}:`, error);
    throw error;
  }
}

// =====================================================
// ========== AI SUGGESTIONS FUNCTIONS ==========
// =====================================================
// These functions handle AI-generated suggestions for Q&A
// Separate from main chat flow - used in Q&A Detail page
// =====================================================

/**
 * Creates the AI suggestions tables if they don't exist
 */
async function initializeAISuggestionsTables() {
  try {
    // Create ai_suggestions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id SERIAL PRIMARY KEY,
        verified_answer_id INT REFERENCES verified_answers(id) ON DELETE CASCADE,
        source_type VARCHAR(50) NOT NULL DEFAULT 'create_question',
        original_chat_message TEXT,
        original_ai_response TEXT,
        ai_generated_answer TEXT NOT NULL,
        ai_model_used VARCHAR(100),
        ai_confidence FLOAT DEFAULT 0.0,
        sources_used JSONB DEFAULT '[]'::jsonb,
        human_final_answer TEXT,
        decision VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by VARCHAR(255)
      );
    `);

    // Create ai_learning_analysis table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_learning_analysis (
        id SERIAL PRIMARY KEY,
        ai_suggestion_id INT NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
        conflict_type VARCHAR(100),
        conflict_details TEXT,
        severity VARCHAR(50) DEFAULT 'minor',
        similarity_score FLOAT,
        key_differences JSONB DEFAULT '[]'::jsonb,
        suggested_prompt_fix TEXT,
        suggested_routing TEXT,
        error_tags TEXT[],
        predicted_group VARCHAR(255),
        group_confidence FLOAT CHECK (group_confidence >= 0 AND group_confidence <= 1),
        analyzed_at TIMESTAMP DEFAULT NOW(),
        analyzed_by VARCHAR(100) DEFAULT 'auto'
      );
    `);

    // Migration: Add new columns if they don't exist (for existing tables)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_learning_analysis' AND column_name='predicted_group') THEN
          ALTER TABLE ai_learning_analysis ADD COLUMN predicted_group VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_learning_analysis' AND column_name='group_confidence') THEN
          ALTER TABLE ai_learning_analysis ADD COLUMN group_confidence FLOAT CHECK (group_confidence >= 0 AND group_confidence <= 1);
        END IF;
        -- Add ai_answer_embedding column for fast Hybrid Judge
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_suggestions' AND column_name='ai_answer_embedding') THEN
          ALTER TABLE ai_suggestions ADD COLUMN ai_answer_embedding VECTOR(2048);
        END IF;
      END $$;
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_suggestions_verified_answer ON ai_suggestions(verified_answer_id);
      CREATE INDEX IF NOT EXISTS idx_ai_suggestions_decision ON ai_suggestions(decision);
      CREATE INDEX IF NOT EXISTS idx_ai_learning_analysis_suggestion ON ai_learning_analysis(ai_suggestion_id);
    `);
    
    // Create indexes for new columns (separate to handle existing table)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_learning_predicted_group ON ai_learning_analysis(predicted_group);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_learning_group_confidence ON ai_learning_analysis(group_confidence);`);

    console.log('✅ AI Suggestions tables initialized');
  } catch (error) {
    console.error('Error initializing AI suggestions tables:', error);
    throw error;
  }
}

/**
 * Save an AI-generated suggestion for a question
 * @param verifiedAnswerId The ID of the verified_answers record
 * @param aiGeneratedAnswer The answer AI generated
 * @param sourceType 'chat_verify' or 'create_question'
 * @param options Additional options
 */
async function saveAISuggestion(
  verifiedAnswerId: number,
  aiGeneratedAnswer: string,
  sourceType: 'chat_verify' | 'create_question' = 'create_question',
  options?: {
    originalChatMessage?: string;
    originalAiResponse?: string;
    aiModelUsed?: string;
    aiConfidence?: number;
    sourcesUsed?: any[];
    aiAnswerEmbedding?: number[];  // 🆕 Pre-computed embedding for fast Hybrid Judge
  }
) {
  try {
    // Include embedding if provided
    const embeddingParam = options?.aiAnswerEmbedding && options.aiAnswerEmbedding.length === 2048
      ? `[${options.aiAnswerEmbedding.join(',')}]`
      : null;
    
    const result = await pool.query(
      `INSERT INTO ai_suggestions (
        verified_answer_id, ai_generated_answer, source_type,
        original_chat_message, original_ai_response, 
        ai_model_used, ai_confidence, sources_used, ai_answer_embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
      RETURNING id`,
      [
        verifiedAnswerId,
        aiGeneratedAnswer,
        sourceType,
        options?.originalChatMessage || null,
        options?.originalAiResponse || null,
        options?.aiModelUsed || null,
        options?.aiConfidence || 0,
        JSON.stringify(options?.sourcesUsed || []),
        embeddingParam
      ]
    );
    
    console.log(`✅ AI suggestion saved for question ${verifiedAnswerId}${embeddingParam ? ' (with embedding)' : ''}`);
    return { success: true, suggestionId: result.rows[0].id };
  } catch (error) {
    console.error('Error saving AI suggestion:', error);
    throw error;
  }
}

/**
 * Get AI suggestion for a specific question
 * @param verifiedAnswerId The ID of the verified_answers record
 */
async function getAISuggestion(verifiedAnswerId: number) {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_suggestions 
       WHERE verified_answer_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [verifiedAnswerId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting AI suggestion:', error);
    throw error;
  }
}

/**
 * Update AI suggestion decision after human review
 * @param suggestionId The AI suggestion ID
 * @param decision 'accepted' | 'rejected'
 * @param humanFinalAnswer The final answer after human review
 * @param reviewedBy Username of the reviewer
 */
async function updateAISuggestionDecision(
  suggestionId: number,
  decision: 'accepted' | 'rejected',
  humanFinalAnswer: string,
  reviewedBy: string
) {
  try {
    await pool.query(
      `UPDATE ai_suggestions 
       SET decision = $1, human_final_answer = $2, reviewed_at = NOW(), reviewed_by = $3
       WHERE id = $4`,
      [decision, humanFinalAnswer, reviewedBy, suggestionId]
    );
    
    console.log(`✅ AI suggestion ${suggestionId} decision updated to: ${decision}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating AI suggestion decision:', error);
    throw error;
  }
}

/**
 * Save AI learning analysis for a suggestion
 * This is used to track AI mistakes and improve the model
 */
async function saveAILearningAnalysis(
  suggestionId: number,
  analysis: {
    conflictType?: string;
    conflictDetails?: string;
    severity?: 'minor' | 'major' | 'critical';
    similarityScore?: number;
    keyDifferences?: any[];
    suggestedPromptFix?: string;
    suggestedRouting?: string;
    errorTags?: string[];
    analyzedBy?: string;
    predictedGroup?: string;
    groupConfidence?: number;
  }
) {
  try {
    const result = await pool.query(
      `INSERT INTO ai_learning_analysis (
        ai_suggestion_id, conflict_type, conflict_details, severity,
        similarity_score, key_differences, suggested_prompt_fix,
        suggested_routing, error_tags, analyzed_by, predicted_group, group_confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        suggestionId,
        analysis.conflictType || null,
        analysis.conflictDetails || null,
        analysis.severity || 'minor',
        analysis.similarityScore || null,
        JSON.stringify(analysis.keyDifferences || []),
        analysis.suggestedPromptFix || null,
        analysis.suggestedRouting || null,
        analysis.errorTags || [],
        analysis.analyzedBy || 'auto',
        analysis.predictedGroup || null,
        analysis.groupConfidence || null
      ]
    );
    
    console.log(`✅ AI learning analysis saved for suggestion ${suggestionId}`);
    return { success: true, analysisId: result.rows[0].id };
  } catch (error) {
    console.error('Error saving AI learning analysis:', error);
    throw error;
  }
}

/**
 * Get AI performance summary (for dashboard)
 */
async function getAIPerformanceSummary(days: number = 30) {
  try {
    const result = await pool.query(
      `SELECT 
        ai_model_used,
        COUNT(*) as total_suggestions,
        COUNT(CASE WHEN decision = 'accepted' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN decision = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN decision = 'pending' THEN 1 END) as pending_count
       FROM ai_suggestions
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY ai_model_used`
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting AI performance summary:', error);
    throw error;
  }
}

/**
 * Get common conflict patterns from AI learning analysis
 */
async function getAIConflictPatterns() {
  try {
    const result = await pool.query(
      `SELECT 
        conflict_type,
        severity,
        COUNT(*) as occurrence_count
       FROM ai_learning_analysis
       WHERE conflict_type IS NOT NULL
       GROUP BY conflict_type, severity
       ORDER BY occurrence_count DESC`
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting AI conflict patterns:', error);
    throw error;
  }
}

/**
 * Get Knowledge Group distribution and confidence analysis
 * For AI classification analytics - with Pending/Rejected stats
 */
async function getKnowledgeGroupAnalytics() {
  try {
    // First, ensure we have the necessary indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_learning_predicted_group_confidence 
      ON ai_learning_analysis(predicted_group, group_confidence);
      
      CREATE INDEX IF NOT EXISTS idx_ai_suggestions_decision 
      ON ai_suggestions(decision);
      
      CREATE INDEX IF NOT EXISTS idx_verified_answers_tags 
      ON verified_answers USING GIN(tags);
    `);
    
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN ala.predicted_group = 'Health' THEN 'Health & Wellness'
          ELSE ala.predicted_group
        END as predicted_group,
        COUNT(DISTINCT va.id) as total_questions,
        COUNT(*) as total_predictions,
        ROUND(AVG(ala.group_confidence)::numeric, 3) as avg_confidence,
        COUNT(DISTINCT CASE WHEN ais.decision = 'pending' THEN va.id END) as pending_count,
        COUNT(DISTINCT CASE WHEN ais.decision = 'accepted' THEN va.id END) as accepted_count,
        COUNT(DISTINCT CASE WHEN ais.decision = 'rejected' THEN va.id END) as rejected_count,
        COUNT(*) FILTER (WHERE ala.group_confidence >= 0.80) as high_conf_count,
        COUNT(*) FILTER (WHERE ala.group_confidence < 0.50) as low_conf_count
      FROM ai_learning_analysis ala
      INNER JOIN ai_suggestions ais ON ala.ai_suggestion_id = ais.id
      INNER JOIN verified_answers va ON ais.verified_answer_id = va.id
      WHERE ala.predicted_group IS NOT NULL
      GROUP BY CASE 
        WHEN ala.predicted_group = 'Health' THEN 'Health & Wellness'
        ELSE ala.predicted_group
      END
      ORDER BY total_questions DESC, rejected_count DESC
      LIMIT 100
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting knowledge group analytics:', error);
    throw error;
  }
}

/**
 * Get confidence distribution histogram
 */
async function getConfidenceDistribution() {
  try {
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN group_confidence >= 0.80 THEN 'High (≥0.80)'
          WHEN group_confidence >= 0.60 THEN 'Medium (0.60-0.79)'
          ELSE 'Low (<0.60)'
        END as range,
        COUNT(*) as count
      FROM ai_learning_analysis
      WHERE predicted_group IS NOT NULL
      GROUP BY range
      ORDER BY range DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting confidence distribution:', error);
    throw error;
  }
}

/**
 * Get Department Request & Verification Statistics
 * Shows request count and verified count per department
 * - Request = จำนวนคำถามที่ request ไปยังแต่ละแผนก (จาก verified_answers.requested_departments)
 * - Verified = จำนวนการ verify ที่แต่ละแผนกทำ (จาก answer_verifications WHERE verification_type = 'verification')
 */
async function getDepartmentUserStatistics() {
  try {
    // Requests: นับจาก verified_answers WHERE verification_type = 'request'
    // Verifications: นับจาก answer_verifications WHERE verification_type = 'verification' (ไม่เอา 'self')
    const result = await pool.query(`
      WITH 
      -- นับ Requests จาก verified_answers WHERE verification_type = 'request'
      request_counts AS (
        SELECT 
          TRIM(dept) as department,
          COUNT(*) as cnt
        FROM verified_answers va,
        LATERAL UNNEST(va.requested_departments) as dept
        WHERE va.verification_type = 'request'
          AND TRIM(dept) IS NOT NULL 
          AND TRIM(dept) != ''
          AND LOWER(TRIM(dept)) != 'self'
        GROUP BY TRIM(dept)
      ),
      -- นับ Verifications จาก answer_verifications WHERE verification_type = 'verification' (ไม่เอา 'self')
      verify_counts AS (
        SELECT 
          TRIM(dept) as department,
          COUNT(*) as cnt
        FROM answer_verifications av,
        LATERAL UNNEST(av.requested_departments) as dept
        WHERE av.verification_type = 'verification'
          AND TRIM(dept) IS NOT NULL 
          AND TRIM(dept) != ''
          AND LOWER(TRIM(dept)) != 'self'
        GROUP BY TRIM(dept)
      ),
      -- รวม departments ทั้งหมด
      all_depts AS (
        SELECT department FROM request_counts
        UNION
        SELECT department FROM verify_counts
      )
      SELECT 
        ad.department,
        COALESCE(rc.cnt, 0)::int as requests,
        COALESCE(vc.cnt, 0)::int as verifications
      FROM all_depts ad
      LEFT JOIN request_counts rc ON ad.department = rc.department
      LEFT JOIN verify_counts vc ON ad.department = vc.department
      ORDER BY requests DESC, verifications DESC
    `);
    
    console.log('Department stats result:', result.rows);
    
    return result.rows.map(row => ({
      department: row.department,
      request_users: parseInt(row.requests) || 0,
      verify_users: parseInt(row.verifications) || 0,
      total_active_users: (parseInt(row.requests) || 0) + (parseInt(row.verifications) || 0)
    }));
  } catch (error) {
    console.error('Error getting department user statistics:', error);
    throw error;
  }
}

// =====================================================
// ========== END AI SUGGESTIONS FUNCTIONS ==========
// =====================================================

// These startup cleanup functions can be run if needed.
export {
  // User Functions
  createUser,
  createGuestUser,
  getUserByUsername,
  getUserByUserId,
  getUserByEmail,
  setUserActiveStatus,
  getUserActiveStatus,
  getUserRole,
  setUserRole,
  
  // Chat Functions
  pool as default,
  newChatHistory,
  storeChatHistory,
  listChatHistory,
  readChatHistory,
  deleteChatHistory,
  setCurrentChatId,
  getCurrentChatId,
  setChatMode,
  getChatMode,
  setChatModel,
  getChatModel,

  // File Functions
  uploadFile,
  getFile,
  getFileByObjectName,
  getFileInfoByObjectName,
  deleteFile,
  getFilesByChatId,
  addActiveUserToFile,
  removeActiveUserFromFile,
  getDocSearchStatus,
  setDocSearchStatus,
  setFileProcessStatus,

  // Verified Answers Functions (จากเดิม verifiedAnswers.ts)
  saveVerifiedAnswer,
  searchVerifiedAnswers,
  searchVerifiedAnswersHybrid,
  getAnswerVerifications,
  filterQuestionsByType,
  countQuestionsByType,
  triggerNotificationsForQuestion,

  // Question Attachments Functions
  saveQuestionAttachment,
  getQuestionAttachments,
  getQuestionAttachmentData,
  deleteQuestionAttachment,
  saveVerificationAttachments,
  getVerificationAttachments,
  getAnswerVerificationAttachments,

  // Hot Tags Function
  getHotTags,

  // AI Suggestions Functions (NEW - Q&A AI Suggests)
  initializeAISuggestionsTables,
  saveAISuggestion,
  getAISuggestion,
  updateAISuggestionDecision,
  saveAILearningAnalysis,
  getAIPerformanceSummary,
  getAIConflictPatterns,
  getKnowledgeGroupAnalytics,
  getConfidenceDistribution,
  getDepartmentUserStatistics,

  // Deletion and Cleanup Functions
  deleteUserAndHistory,
  deleteInactiveGuestUsersAndChats,
  deleteAllGuestUsersAndChats,
};
