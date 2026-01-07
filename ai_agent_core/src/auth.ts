import express from 'express';
import bcrypt from 'bcrypt';
import { getChatMode, getChatModel } from './db.js'; // Import DB functions
import pool, { createUser, getUserByUsername, getUserByEmail, listChatHistory, getCurrentChatId, readChatHistory, setCurrentChatId, setUserActiveStatus, deleteUserAndHistory } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { Session } from 'inspector/promises';

const router = express.Router();


// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // Check if username already exists
    const existingUserByUsername = await getUserByUsername(username);
    if (existingUserByUsername) {
      return res.status(400).json({ error: 'username_exists' });
    }

    // Check if email already exists
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return res.status(400).json({ error: 'email_exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user into the database
    const newUser = await createUser(username, hashedPassword, email);

    // await createUserFolder(newUser.id);

    // Redirect to login page upon successful registration
    res.status(201).json({ success: true }); // Send JSON success response
  } catch (error) {
    console.error('Error registering user:', error);
    // Redirect back to register page with a generic error
    res.status(500).json({ error: 'server_error' }); // Send JSON error response
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password,socketId } = req.body;

    // Check if the user exists
    const user = await getUserByUsername(username);
    if (!user) {
      // User not found
      return res.status(401).json({ error: 'invalid_credentials' }); // Use 401 Unauthorized
    }
    await setUserActiveStatus(user.id, true);

    // Compare the password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      // Incorrect password
      return res.status(401).json({ error: 'invalid_credentials' }); // Use 401 Unauthorized
    }

    if (req.session.user) {
      if (req.session.user.isGuest === true) {
        await deleteUserAndHistory(req.session.user.id);
        req.session.user.isGuest = false;
        // await deleteUserFolder(req.session.user.id);
      }
      else{
      return res.status(400).json({ error: 'Already logged in' });
    }
    }

    // Create a session
    req.session.user = { id: user.id, username: user.username, socketId: socketId, isGuest: false };
    console.log(`Auth: Session created for user ${user.username} (ID: ${user.id})`)

    // await createUserFolder(user.id); // comment it in new patch

    try {
      const chatHistories = await listChatHistory(user.id);
      (req.session.user as any).chatIds = chatHistories.map((chat: any) => chat.id);
    } catch (err) {
      console.error('Error fetching chat histories during login:', err);
      (req.session.user as any).chatIds = [];
    }

    try {
      const currentChatId = await getCurrentChatId(user.id);
      (req.session.user as any).currentChatId = currentChatId ?? null;
    } catch (err) {
      console.error('Error fetching current chat during login:', err);
      (req.session.user as any).currentChatId = null;
    }
    
    // Fetch and set mode/model based on the determined currentChatId
    const finalCurrentChatId = (req.session.user as any).currentChatId; // Get the ID set in session
    if (finalCurrentChatId) {
      try {
        const chatMode = await getChatMode(finalCurrentChatId);
        const chatModel = await getChatModel(finalCurrentChatId);
        (req.session.user as any).currentChatMode = chatMode ?? null;
        (req.session.user as any).currentChatModel = chatModel ?? null;
      } catch (err) {
        console.error('Error fetching chat mode/model during login:', err);
        (req.session.user as any).currentChatMode = null;
        (req.session.user as any).currentChatModel = null;
      }
    } else {
      (req.session.user as any).currentChatMode = null;
      (req.session.user as any).currentChatModel = null;
    }

    // Login successful, send success response
    res.status(200).json({ success: true, userId: user.id, username: user.username });
  } catch (error) {
    console.error('Error logging in:', error);
    // Redirect back to login page with a generic error
    res.status(500).json({ error: 'server_error' }); // Send JSON error response
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.use(express.static(path.join(__dirname, '..', 'public')));

// Render login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});
// Render registration page
router.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, "..", "/public", "register.html"));
});


// Logout endpoint
router.get('/logout', async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId){
    res.redirect('/')
    // res.status(400).json({ error: 'No session please login' });
  }
  else{
    await setCurrentChatId(userId, null);
    await setUserActiveStatus(userId, false);
    req.session.user.isGuest = true;
  }
  req.session.destroy((err: any) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    if (userId !== undefined) {
    }
    res.redirect('/');
  });
});

// EndSession endpoint
router.get('/endsession', async (req, res) => {
  const userId = req.session.user?.id;
  const is_guest = req.session.user?.isGuest;
  if (!userId){
    res.status(400).json({ error: 'No session please login' });
  }
  else{
    // await setCurrentChatId(userId, null);
    // await setUserActiveStatus(userId, false);
  }
  if (is_guest) {
    console.log(`Deleting guest ${userId}`);
    await deleteUserAndHistory(userId);
    // await deleteUserFolder(userId);
    req.session.destroy((err: any) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      if (userId !== undefined) {
      }
      return;
    });
    // await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

router.get('/session', (req, res) => {
  const userId = req.session.user?.id;
  if (!userId){
    // res.status(500).json({ error: 'No session please login' });
    console.log('Auth: No session please login')
    res.status(200).json({ error: 'No session please login' });
  }
  else{
  console.log(req.session.user);
  if (req.session.user) {
    res.json({
      loggedIn: true,
      username: req.session.user.username,
      userId: req.session.user.id,
      isGuest: (req.session.user as any).isGuest ?? true,
      chatIds: (req.session.user as any).chatIds ?? [],
      currChatId: (req.session.user as any).currentChatId ?? null,
      currentChatMode: (req.session.user as any).currentChatMode ?? null, // Return mode
      currentChatModel: (req.session.user as any).currentChatModel ?? null // Return model
    });
  } else {
    res.json({ loggedIn: false });
  }
}
});

export default router;