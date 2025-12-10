import pkg from 'pg';
import dotenv from 'dotenv';
import * as Minio from 'minio'; // Import MinIO client
// Load environment variables from .env file
dotenv.config();
const { Pool } = pkg;
console.log(process.env.DATABASE_URL);
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
    embedding VECTOR(1024),
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
    }
    catch (error) {
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
        }
        else {
            console.log(`MinIO: Bucket '${minioBucketName}' already exists.`);
        }
    }
    catch (error) {
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
        }
        catch (error) {
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
        console.log('DB: Create dummy chat with system user user id : 0');
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
        await pool.query(createVerifiedAnswersIndexQuery);
        console.log('DB: Verified answers index created or already exists');
        // Drop old constraint if exists and add new one
        try {
            await pool.query(`
        ALTER TABLE answer_verifications 
        DROP CONSTRAINT IF EXISTS answer_verifications_rating_check;
      `);
            console.log('DB: Dropped old rating constraint');
        }
        catch (e) {
            console.log('DB: Could not drop old constraint (may not exist):', e.message);
        }
        // Add new constraint for rating (-1, 0, 1)
        try {
            await pool.query(`
        ALTER TABLE answer_verifications 
        ADD CONSTRAINT answer_verifications_rating_check 
        CHECK (rating IN (-1, 0, 1));
      `);
            console.log('DB: Added new rating constraint for answer_verifications');
        }
        catch (e) {
            console.log('DB: Constraint already exists or error:', e.message);
        }
        await pool.query(createAnswerVerificationsTableQuery);
        console.log('DB: Answer verifications table created or already exists');
        await pool.query(createAnswerVerificationsIndexQuery);
        console.log('DB: Answer verifications index created or already exists');
        // Create comments table
        await pool.query(createCommentsTableQuery);
        console.log('DB: Comments table created or already exists');
        await pool.query(createCommentsIndexQuery);
        console.log('DB: Comments index created or already exists');
        // Create comment attachments table
        await pool.query(createCommentAttachmentsTableQuery);
        console.log('DB: Comment attachments table created or already exists');
        await pool.query(createCommentAttachmentsIndexQuery);
        console.log('DB: Comment attachments index created or already exists');
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
      END
      $$;
    `);
        console.log('DB: verification_type, requested_departments, and due_date columns added');
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
        await pool.query(alterUsersTableQuery);
        console.log('DB: Foreign key added to users table');
        console.log('✅ Database initialization complete!');
    }
    catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}
// --- Initialize services on startup ---
(async () => {
    try {
        await initializeDatabase();
        console.log('✅ Database initialization complete');
    }
    catch (error) {
        console.error('❌ FATAL: Database initialization failed:', error);
        process.exit(1);
    }
})();
(async () => {
    try {
        await ensureMinIOBucketExists();
        console.log('✅ MinIO bucket initialization complete');
    }
    catch (error) {
        console.error('⚠️ Warning: MinIO bucket initialization failed:', error);
        // Don't exit for MinIO, it's less critical
    }
})();
// --- MinIO File Operation Functions ---
/**
 * Uploads a file to MinIO and creates a corresponding record in the database.
 * @returns An object containing the database ID and the MinIO object name of the uploaded file record.
 */
async function uploadFile(userId, chatId, fileName, fileBuffer, mimeType, fileSize) {
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
    }
    catch (error) {
        console.error('Error during file upload process:', error);
        // Attempt to clean up MinIO object if DB insert fails
        try {
            await minioClient.removeObject(minioBucketName, objectName);
        }
        catch (cleanupError) {
            console.error(`Failed to clean up MinIO object '${objectName}' after DB error:`, cleanupError);
        }
        throw error;
    }
}
/**
 * Retrieves a file stream from MinIO based on its database ID.
 * @returns A readable stream of the file data.
 */
async function getFile(fileId) {
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
    }
    catch (error) {
        console.error(`Error getting file '${objectName}' from MinIO:`, error);
        throw error;
    }
}
/**
 * Retrieves a file stream from MinIO based on its object name.
 * @param {string} objectName The unique identifier for the object in MinIO.
 * @returns {Promise<NodeJS.ReadableStream>} A readable stream of the file data.
 */
async function getFileByObjectName(objectName) {
    try {
        const stream = await minioClient.getObject(minioBucketName, objectName);
        console.log(`MinIO: Retrieving file stream for object '${objectName}'.`);
        return stream;
    }
    catch (error) {
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
async function getFileInfoByObjectName(objectName) {
    const query = 'SELECT file_name, mime_type FROM uploaded_files WHERE object_name = $1';
    try {
        const result = await pool.query(query, [objectName]);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error getting file info by object name:', error);
        throw error;
    }
}
/**
 * Deletes a file from MinIO and its record from the database.
 * The `ON DELETE CASCADE` will handle related embeddings.
 */
async function deleteFile(fileId) {
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
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting file ${fileId}:`, error);
        throw error;
    }
    finally {
        client.release();
    }
}
// --- User and Chat Functions (Original + Updated) ---
async function createUser(username, passwordHash, email) {
    const query = 'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email';
    const values = [username, passwordHash, email];
    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}
async function createGuestUser(username) {
    const query = `
    INSERT INTO users (username, is_guest)
    VALUES ($1, TRUE)
    RETURNING id, username, is_guest
  `;
    const values = [username];
    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error creating guest user:', error);
        throw error;
    }
}
async function getUserByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    const values = [username];
    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error getting user by username:', error);
        throw error;
    }
}
async function getUserByUserId(userId) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const values = [userId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error getting user by id:', error);
        throw error;
    }
}
async function getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const values = [email];
    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error getting user by email:', error);
        throw error;
    }
}
async function newChatHistory(userId, selectedDocSearchMethod) {
    const query = 'INSERT INTO chat_history (user_id, message, doc_search_method) VALUES ($1, \'\', $2) RETURNING id';
    const values = [userId, selectedDocSearchMethod];
    try {
        const result = await pool.query(query, values);
        return result.rows[0].id;
    }
    catch (error) {
        console.error('Error creating new chat history:', error);
        throw error;
    }
}
async function storeChatHistory(chatId, message) {
    const query = 'UPDATE chat_history SET message = $1 WHERE id = $2';
    const values = [message, chatId];
    try {
        await pool.query(query, values);
        console.log(`DB: Chat history ${chatId} updated`);
    }
    catch (error) {
        console.error('Error storing chat history:', error);
        throw error;
    }
}
async function listChatHistory(userId) {
    const query = 'SELECT id, timestamp FROM chat_history WHERE user_id = $1 ORDER BY timestamp ASC';
    const values = [userId];
    try {
        const result = await pool.query(query, values);
        return result.rows;
    }
    catch (error) {
        console.error('Error listing chat history:', error);
        throw error;
    }
}
async function readChatHistory(chatId) {
    const query = 'SELECT message, timestamp, chat_mode, chat_model, doc_search_method FROM chat_history WHERE id = $1';
    const values = [chatId];
    try {
        const result = await pool.query(query, values);
        return result.rows;
    }
    catch (error) {
        console.error('Error reading chat history:', error);
        throw error;
    }
}
/**
 * UPDATED: Deletes chat history and all associated files from MinIO.
 */
async function deleteChatHistory(chatId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Get all object names for the given chat ID before deleting
        const res = await client.query('SELECT object_name FROM uploaded_files WHERE chat_history_id = $1', [chatId]);
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
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting chat history:', error);
        throw error;
    }
    finally {
        client.release();
    }
}
async function setChatMode(chatId, chatMode) {
    const query = 'UPDATE chat_history SET chat_mode = $1 WHERE id = $2';
    const values = [chatMode, chatId];
    try {
        await pool.query(query, values);
        console.log(`DB: Chat mode for history ${chatId} updated to ${chatMode}`);
    }
    catch (error) {
        console.error('Error setting chat mode:', error);
        throw error;
    }
}
async function getChatMode(chatId) {
    const query = 'SELECT chat_mode FROM chat_history WHERE id = $1';
    const values = [chatId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0]?.chat_mode ?? null;
    }
    catch (error) {
        console.error('Error getting chat mode:', error);
        throw error;
    }
}
async function setChatModel(chatId, chatModel) {
    const query = 'UPDATE chat_history SET chat_model = $1 WHERE id = $2';
    const values = [chatModel, chatId];
    try {
        await pool.query(query, values);
        console.log(`DB: Chat model for history ${chatId} updated to ${chatModel}`);
    }
    catch (error) {
        console.error('Error setting chat model:', error);
        throw error;
    }
}
async function getChatModel(chatId) {
    const query = 'SELECT chat_model FROM chat_history WHERE id = $1';
    const values = [chatId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0]?.chat_model ?? null;
    }
    catch (error) {
        console.error('Error getting chat model:', error);
        throw error;
    }
}
async function setUserActiveStatus(userId, isActive) {
    const query = 'UPDATE users SET is_active = $1 WHERE id = $2';
    const values = [isActive, userId];
    try {
        await pool.query(query, values);
    }
    catch (error) {
        console.error('Error setting user active status:', error);
        throw error;
    }
}
async function getUserActiveStatus(userId) {
    const query = 'SELECT is_active FROM users WHERE id = $1';
    const values = [userId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0]?.is_active ?? false;
    }
    catch (error) {
        console.error('Error getting user active status:', error);
        throw error;
    }
}
async function setCurrentChatId(userId, chatId) {
    const query = 'UPDATE users SET current_chat_id = $1 WHERE id = $2';
    const values = [chatId, userId];
    try {
        await pool.query(query, values);
    }
    catch (error) {
        console.error('Error setting current chat ID:', error);
        throw error;
    }
}
async function getCurrentChatId(userId) {
    const query = 'SELECT current_chat_id FROM users WHERE id = $1';
    const values = [userId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0]?.current_chat_id ?? null;
    }
    catch (error) {
        console.error('Error getting current chat ID:', error);
        throw error;
    }
}
/**
 * UPDATED: Deletes a user, their chat history, and all their files from MinIO.
 */
async function deleteUserAndHistory(userId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Get all object names for the user's files before deleting from DB
        const res = await client.query('SELECT object_name FROM uploaded_files WHERE user_id = $1', [userId]);
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
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting user and chat history:', error);
        throw error;
    }
    finally {
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
        const res = await client.query('SELECT id FROM users WHERE is_guest = TRUE AND is_active = FALSE');
        const userIds = res.rows.map(row => row.id);
        if (userIds.length > 0) {
            console.log(`DB: Found ${userIds.length} inactive guest users to delete.`);
            for (const userId of userIds) {
                // Use the comprehensive delete function
                await deleteUserAndHistory(userId);
            }
            console.log('DB: Finished deleting inactive guest users.');
        }
    }
    catch (error) {
        console.error('Error during inactive guest user cleanup:', error);
        throw error;
    }
    finally {
        client.release();
    }
}
async function getUserRole(userId) {
    const query = 'SELECT role FROM users WHERE id = $1';
    const values = [userId];
    try {
        const result = await pool.query(query, values);
        return result.rows[0]?.role ?? null;
    }
    catch (error) {
        console.error('Error getting user role:', error);
        throw error;
    }
}
async function setUserRole(userId, role) {
    const query = 'UPDATE users SET role = $1 WHERE id = $2';
    const values = [role, userId];
    try {
        await pool.query(query, values);
        console.log(`DB: Role for user ${userId} updated to ${role}`);
    }
    catch (error) {
        console.error('Error setting user role:', error);
        throw error;
    }
}
// ===================================
// === VERIFIED ANSWERS FUNCTIONS ===
// ===================================
/**
 * ① บันทึกคำตอบที่ verified
 * Saves a verified answer with question embedding and rating verification
 */
async function saveVerifiedAnswer(question, answer, questionEmbedding, userId, rating, commenterName, comment, verificationType, requestedDepartments) {
    try {
        // First, check if this answer already exists (by question + answer)
        const existingAnswer = await pool.query(`SELECT id FROM verified_answers 
       WHERE question = $1 AND answer = $2 
       LIMIT 1`, [question, answer]);
        let answerId;
        if (existingAnswer.rows.length > 0) {
            // Answer already exists - get its ID
            answerId = existingAnswer.rows[0].id;
            // Update verification_type and requested_departments if provided
            if (verificationType || requestedDepartments) {
                await pool.query(`UPDATE verified_answers 
           SET verification_type = $1, requested_departments = $2
           WHERE id = $3`, [verificationType || 'self', requestedDepartments || [], answerId]);
            }
        }
        else {
            // Answer doesn't exist - create new one
            // Format embedding as PostgreSQL vector string (allow NULL if no embedding)
            let embeddingStr = null;
            if (questionEmbedding && questionEmbedding.length > 0) {
                embeddingStr = `[${questionEmbedding.join(',')}]`;
            }
            const result = await pool.query(`INSERT INTO verified_answers (question, answer, question_embedding, avg_rating, verified_count, rating_count, verification_type, requested_departments)
         VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
         RETURNING id`, [question, answer, embeddingStr, 0, verificationType || 'self', requestedDepartments || []]);
            answerId = result.rows[0].id;
        }
        // Determine actual rating based on verification type
        // If requesting verification from others, set rating to 0 (pending)
        const actualRating = verificationType === 'request' ? 0 : (rating ?? 1);
        // Check if this user already rated this answer
        if (userId && rating !== undefined) {
            const userRating = await pool.query(`SELECT id FROM answer_verifications 
         WHERE verified_answer_id = $1 AND user_id = $2 
         LIMIT 1`, [answerId, userId]);
            if (userRating.rows.length > 0) {
                // User already rated this answer - update instead of insert
                await pool.query(`UPDATE answer_verifications 
           SET rating = $1, commenter_name = $2, comment = $3, verification_type = $4, requested_departments = $5
           WHERE verified_answer_id = $6 AND user_id = $7`, [actualRating, commenterName || 'Anonymous', comment || '', verificationType || 'self', requestedDepartments || [], answerId, userId]);
            }
            else {
                // New rating from this user
                await pool.query(`INSERT INTO answer_verifications (verified_answer_id, user_id, rating, commenter_name, comment, verification_type, requested_departments)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [answerId, userId, actualRating, commenterName || 'Anonymous', comment || '', verificationType || 'self', requestedDepartments || []]);
            }
        }
        else if (rating !== undefined) {
            // Anonymous user - always allow new rating
            await pool.query(`INSERT INTO answer_verifications (verified_answer_id, user_id, rating, commenter_name, comment, verification_type, requested_departments)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [answerId, null, actualRating, commenterName || 'Anonymous', comment || '', verificationType || 'self', requestedDepartments || []]);
        }
        return { success: true, answerId };
    }
    catch (error) {
        console.error('Error saving verified answer:', error);
        throw error;
    }
}
/**
 * ② ค้นหาคำตอบคล้ายกัน (Vector Similarity)
 * Searches for verified answers using vector similarity
 */
async function searchVerifiedAnswers(questionEmbedding, threshold = 0.7, limit = 5) {
    try {
        // Validate embedding
        if (!questionEmbedding || questionEmbedding.length === 0) {
            console.warn('Empty embedding provided, returning empty results');
            return [];
        }
        // Format embedding as PostgreSQL vector string
        const embeddingStr = `[${questionEmbedding.join(',')}]`;
        const result = await pool.query(`SELECT 
        id,
        question,
        answer,
        avg_rating,
        verified_count,
        rating_count,
        1 - (question_embedding <-> $1) as similarity
       FROM verified_answers
       WHERE 1 - (question_embedding <-> $1) > $2
       ORDER BY similarity DESC, avg_rating DESC
       LIMIT $3`, [embeddingStr, threshold, limit]);
        return result.rows;
    }
    catch (error) {
        console.error('Error searching verified answers:', error);
        throw error;
    }
}
/**
 * ③ ดึงคะแนนและคอมเมนต์
 * Retrieves ratings and comments for a verified answer
 */
async function getAnswerVerifications(answerId) {
    try {
        const result = await pool.query(`SELECT commenter_name, rating, comment, created_at
       FROM answer_verifications
       WHERE verified_answer_id = $1
       ORDER BY created_at DESC`, [answerId]);
        return result.rows;
    }
    catch (error) {
        console.error('Error getting verifications:', error);
        throw error;
    }
}
/**
 * ④ อัปเดตคะแนนเฉลี่ย
 * Updates the average rating and statistics for a verified answer
 */
async function updateAnswerRating(answerId) {
    try {
        const result = await pool.query(`UPDATE verified_answers
       SET avg_rating = (
         SELECT AVG(rating) FROM answer_verifications WHERE verified_answer_id = $1
       ),
       verified_count = (
         SELECT COUNT(DISTINCT user_id) FROM answer_verifications WHERE verified_answer_id = $1 AND rating > 0
       ),
       rating_count = (
         SELECT COUNT(*) FROM answer_verifications WHERE verified_answer_id = $1
       ),
       last_updated_at = NOW()
       WHERE id = $1
       RETURNING avg_rating, verified_count, rating_count`, [answerId]);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error updating rating:', error);
        throw error;
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
    }
    catch (error) {
        console.error('Error deleting all guest users:', error);
        throw error;
    }
    finally {
        client.release();
    }
}
async function getFilesByChatId(chatId) {
    const query = `
    SELECT id, file_name, object_name, mime_type, file_size_bytes, active_users, uploaded_at 
    FROM uploaded_files 
    WHERE chat_history_id = $1 
    ORDER BY uploaded_at DESC
  `;
    try {
        const result = await pool.query(query, [chatId]);
        return result.rows;
    }
    catch (error) {
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
async function addActiveUserToFile(fileId, userId) {
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
    }
    catch (error) {
        console.error(`Error adding active user ${userId} to file ${fileId}:`, error);
        throw error;
    }
}
/**
 * Removes a user ID from the active_users array for a specific file.
 */
async function removeActiveUserFromFile(fileId, userId) {
    const query = `
    UPDATE uploaded_files
    SET active_users = array_remove(active_users, $1)
    WHERE id = $2
    RETURNING active_users;
  `;
    try {
        const result = await pool.query(query, [userId, fileId]);
        return result.rows[0]?.active_users || [];
    }
    catch (error) {
        console.error(`Error removing active user ${userId} from file ${fileId}:`, error);
        throw error;
    }
}
async function getDocSearchStatus(chatID) {
    const query = 'SELECT doc_search_method FROM chat_history WHERE id = $1';
    const values = [chatID];
    try {
        const result = await pool.query(query, values);
        console.log(`DB: Retrieved document search method for chat history ${chatID}: ${result.rows[0]?.doc_search_method ?? null}`);
        return result.rows[0]?.doc_search_method ?? null;
    }
    catch (error) {
        console.error('Error getting document search method:', error);
        throw error;
    }
}
async function setDocSearchStatus(chatID, method) {
    const query = 'UPDATE chat_history SET doc_search_method = $1 WHERE id = $2';
    const values = [method, chatID];
    try {
        await pool.query(query, values);
        console.log(`DB: Document search method for chat history ${chatID} updated to ${method}`);
    }
    catch (error) {
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
async function saveQuestionAttachment(questionId, fileName, fileData, mimeType, fileSizeBytes, uploadedBy) {
    try {
        const result = await pool.query(`INSERT INTO question_attachments (question_id, file_name, mime_type, file_data, file_size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`, [questionId, fileName, mimeType, fileData, fileSizeBytes, uploadedBy]);
        return result.rows[0].id;
    }
    catch (error) {
        console.error('Error saving question attachment:', error);
        throw error;
    }
}
/**
 * Gets all attachments for a question
 * @param questionId The ID of the question
 * @returns Array of attachment metadata (excluding file_data)
 */
async function getQuestionAttachments(questionId) {
    try {
        const result = await pool.query(`SELECT id, file_name, mime_type, file_size_bytes, uploaded_by, created_at 
       FROM question_attachments 
       WHERE question_id = $1 
       ORDER BY created_at DESC`, [questionId]);
        return result.rows;
    }
    catch (error) {
        console.error('Error getting question attachments:', error);
        throw error;
    }
}
/**
 * Gets a specific attachment file data
 * @param attachmentId The ID of the attachment
 * @returns Object with file_name, mime_type, and file_data (Buffer)
 */
async function getQuestionAttachmentData(attachmentId) {
    try {
        const result = await pool.query(`SELECT file_name, mime_type, file_data 
       FROM question_attachments 
       WHERE id = $1`, [attachmentId]);
        if (result.rows.length === 0) {
            throw new Error(`Attachment with ID ${attachmentId} not found`);
        }
        return result.rows[0];
    }
    catch (error) {
        console.error('Error getting question attachment data:', error);
        throw error;
    }
}
/**
 * Deletes an attachment from a question
 * @param attachmentId The ID of the attachment
 */
async function deleteQuestionAttachment(attachmentId) {
    try {
        await pool.query(`DELETE FROM question_attachments WHERE id = $1`, [attachmentId]);
        console.log(`DB: Attachment ${attachmentId} deleted`);
    }
    catch (error) {
        console.error('Error deleting question attachment:', error);
        throw error;
    }
}
/**
 * Save a comment attachment to the database
 * @param commentId The comment ID
 * @param fileName The file name
 * @param mimeType The MIME type
 * @param fileData The file data as Buffer
 * @param uploadedBy The user who uploaded the file
 * @returns The attachment ID
 */
async function saveCommentAttachment(commentId, fileName, mimeType, fileData, uploadedBy = 'Anonymous') {
    try {
        const result = await pool.query(`INSERT INTO comment_attachments (comment_id, file_name, mime_type, file_data, file_size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`, [commentId, fileName, mimeType, fileData, fileData.length, uploadedBy]);
        return result.rows[0].id;
    }
    catch (error) {
        console.error('Error saving comment attachment:', error);
        throw error;
    }
}
/**
 * Get all attachments for a specific comment
 * @param commentId The comment ID
 * @returns Array of attachment metadata
 */
async function getCommentAttachments(commentId) {
    try {
        const result = await pool.query(`SELECT id, file_name, mime_type, file_size_bytes, uploaded_by, created_at FROM comment_attachments WHERE comment_id = $1 ORDER BY created_at DESC`, [commentId]);
        return result.rows;
    }
    catch (error) {
        console.error('Error getting comment attachments:', error);
        throw error;
    }
}
/**
 * Get a specific comment attachment with file data
 * @param attachmentId The attachment ID
 * @returns Attachment data including file_data
 */
async function getCommentAttachmentData(attachmentId) {
    try {
        const result = await pool.query(`SELECT id, file_name, mime_type, file_size_bytes, file_data, uploaded_by, created_at FROM comment_attachments WHERE id = $1`, [attachmentId]);
        return result.rows[0] || null;
    }
    catch (error) {
        console.error('Error getting comment attachment data:', error);
        throw error;
    }
}
/**
 * Delete a comment attachment
 * @param attachmentId The attachment ID
 */
async function deleteCommentAttachment(attachmentId) {
    try {
        await pool.query(`DELETE FROM comment_attachments WHERE id = $1`, [attachmentId]);
        console.log(`DB: Comment attachment ${attachmentId} deleted`);
    }
    catch (error) {
        console.error('Error deleting comment attachment:', error);
        throw error;
    }
}
// These startup cleanup functions can be run if needed.
export { 
// User Functions
createUser, createGuestUser, getUserByUsername, getUserByUserId, getUserByEmail, setUserActiveStatus, getUserActiveStatus, getUserRole, setUserRole, 
// Chat Functions
pool as default, newChatHistory, storeChatHistory, listChatHistory, readChatHistory, deleteChatHistory, setCurrentChatId, getCurrentChatId, setChatMode, getChatMode, setChatModel, getChatModel, 
// File Functions
uploadFile, getFile, getFileByObjectName, getFileInfoByObjectName, deleteFile, 
// Verified Answers Functions (จากเดิม verifiedAnswers.ts)
saveVerifiedAnswer, searchVerifiedAnswers, getAnswerVerifications, updateAnswerRating, 
// Question Attachments Functions
saveQuestionAttachment, getQuestionAttachments, getQuestionAttachmentData, deleteQuestionAttachment, 
// Comment Attachments Functions
saveCommentAttachment, getCommentAttachments, getCommentAttachmentData, deleteCommentAttachment, 
// File Functions (New)
uploadFile, getFile, getFileByObjectName, // <-- Added new function here
getFileInfoByObjectName, // <-- Added new function here
deleteFile, getFilesByChatId, addActiveUserToFile, removeActiveUserFromFile, getDocSearchStatus, setDocSearchStatus, 
// Deletion and Cleanup Functions
deleteUserAndHistory, deleteInactiveGuestUsersAndChats, deleteAllGuestUsersAndChats, };
