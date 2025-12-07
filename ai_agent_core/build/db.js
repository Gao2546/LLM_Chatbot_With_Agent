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
    try {
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
        await pool.query(alterUsersTableQuery);
        console.log('DB: Foreign key added to users table');
    }
    catch (error) {
        console.error('Error creating tables:', error);
    }
}
// --- Initialize services on startup ---
await initializeDatabase();
await ensureMinIOBucketExists();
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
// --- EXPORTS ---
export { 
// User Functions
createUser, createGuestUser, getUserByUsername, getUserByUserId, getUserByEmail, setUserActiveStatus, getUserActiveStatus, getUserRole, setUserRole, 
// Chat Functions
pool as default, newChatHistory, storeChatHistory, listChatHistory, readChatHistory, deleteChatHistory, setCurrentChatId, getCurrentChatId, setChatMode, getChatMode, setChatModel, getChatModel, 
// File Functions (New)
uploadFile, getFile, getFileByObjectName, // <-- Added new function here
getFileInfoByObjectName, // <-- Added new function here
deleteFile, getFilesByChatId, addActiveUserToFile, removeActiveUserFromFile, getDocSearchStatus, setDocSearchStatus, 
// Deletion and Cleanup Functions
deleteUserAndHistory, deleteInactiveGuestUsersAndChats, deleteAllGuestUsersAndChats, };
