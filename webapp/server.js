// FILE: webapp/server.js
require('dotenv').config(); // Load .env variables first
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const flash = require('connect-flash'); // Optional: for flash messages

// --- User Storage (In-Memory - REPLACE FOR PRODUCTION) ---
let users = []; // Structure: { id: '...', source: 'local'/'google', googleId: '...', email: '...', passwordHash: '...', name: '...' }
let nextUserId = 1;

// --- Load Prompt Template ---
const promptFilePath = path.join(__dirname, 'mindmap_prompt.txt');
let basePromptTemplate = ''; // Initialize
try {
    basePromptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    console.log(`Prompt template loaded successfully from ${promptFilePath}`);
} catch (err) {
    console.error(`WARNING: Could not read prompt template file at ${promptFilePath}. Generation might fail.`, err);
}

// --- LLM Clients (Keep if needed, ensure keys are in .env) ---
const deepseekClient = process.env.DEEPSEEK_API_KEY ? new OpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
}) : null;

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;

if (!deepseekClient) console.warn("DeepSeek client not initialized (DEEPSEEK_API_KEY missing?)");
if (!openaiClient) console.warn("OpenAI client not initialized (OPENAI_API_KEY missing?)");

// --- Express App Setup ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- Session Configuration ---
// WARNING: Using default MemoryStore is not suitable for production.
// Use a proper session store like connect-mongo or connect-redis.
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_change_me', // Fallback, but .env is preferred
    resave: false,
    saveUninitialized: false, // Don't save sessions until login
    cookie: {
        // secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (requires HTTPS)
        maxAge: 1000 * 60 * 60 * 24 // 1 day session duration
    }
}));

// --- Passport Configuration ---
app.use(passport.initialize());
app.use(passport.session());
app.use(flash()); // Initialize connect-flash

// Local Strategy (Email/Password)
passport.use(new LocalStrategy(
    { usernameField: 'username' }, // 'username' field in the form should contain the email
    async (email, password, done) => {
        console.log(`Attempting local login for: ${email}`);
        const user = users.find(u => u.email === email && u.source === 'local');
        if (!user) {
            console.log(`Local login failed: User not found for ${email}`);
            return done(null, false, { message: 'Incorrect email or password.' });
        }
        try {
            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if (isMatch) {
                console.log(`Local login successful for: ${email}`);
                return done(null, user);
            } else {
                console.log(`Local login failed: Password mismatch for ${email}`);
                return done(null, false, { message: 'Incorrect email or password.' });
            }
        } catch (err) {
            console.error(`Bcrypt error during login for ${email}:`, err);
            return done(err);
        }
    }
));

// Google OAuth 2.0 Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback", // Must match Google Cloud Console Redirect URI
        scope: ['profile', 'email'] // Request profile and email info
    },
    (accessToken, refreshToken, profile, done) => {
        console.log('Google profile received:', profile.displayName, profile.emails[0]?.value);
        // Find or create user
        let user = users.find(u => u.googleId === profile.id && u.source === 'google');
        if (user) {
            console.log(`Google user found: ${user.email}`);
            return done(null, user);
        } else {
            // If no Google user, check if email exists from local signup
             let existingEmailUser = users.find(u => u.email === profile.emails[0]?.value);
             if (existingEmailUser) {
                 console.warn(`Email ${profile.emails[0]?.value} already exists from a different source. Linking attempt or error?`);
                 // Decide how to handle this: merge accounts, show error, etc.
                 // For now, prevent creating a duplicate email entry via Google.
                 return done(null, false, { message: `Email ${profile.emails[0]?.value} is already registered. Try logging in with your original method.` });
             }

            // Create new Google user
            const newUser = {
                id: `user_${nextUserId++}`,
                source: 'google',
                googleId: profile.id,
                email: profile.emails[0]?.value, // Primary email
                name: profile.displayName,
                passwordHash: null // No password for OAuth users
            };
            users.push(newUser);
            console.log(`New Google user created: ${newUser.email}`);
            return done(null, newUser);
        }
    }
    ));
} else {
    console.warn("Google OAuth credentials not found in .env. Google login disabled.");
}


// Serialize user ID into the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session using the ID
passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user); // Pass the full user object or null if not found
});


// --- Static Files ---
// Serve static files FROM the 'public' directory within 'webapp'
// AND the new 'auth' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/auth', express.static(path.join(__dirname, 'auth'))); // Serve auth files under /auth path

// --- Middleware ---

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    console.log('Access denied (not authenticated). Redirecting to login.');
    res.redirect('/login-page'); // Redirect to the login page if not logged in
}

// --- Authentication Routes ---

// GET Login Page
app.get('/login-page', (req, res) => {
     if (req.isAuthenticated()) {
       return res.redirect('/'); // If already logged in, go to main app
     }
     // Pass flash messages to the template if using connect-flash
     // const errorMessages = req.flash('error');
     // res.render('login', { messages: errorMessages }); // Assuming using a template engine
     res.sendFile(path.join(__dirname, 'auth', 'login.html')); // Serve static HTML
});


// POST Login (Local Strategy)
app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) { return next(err); }
        if (!user) {
            // Send back specific error message from strategy or a generic one
            const message = info?.message || 'Login failed. Please check credentials.';
            return res.status(401).json({ success: false, message: message });
        }
        req.logIn(user, (err) => { // Establish session
            if (err) { return next(err); }
            console.log(`User ${user.email} logged in successfully.`);
            return res.json({ success: true, message: 'Login successful!', redirectUrl: '/' });
        });
    })(req, res, next);
});


// POST Signup (Local Strategy)
app.post('/signup', async (req, res, next) => {
    const { name, username: email, password } = req.body; // username from form is email
    console.log(`Attempting signup for: ${email}`);

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }
    if (password.length < 6) { // Basic validation
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }


    // Check if user already exists (local or google)
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        console.log(`Signup failed: Email ${email} already exists.`);
        return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    try {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const newUser = {
            id: `user_${nextUserId++}`,
            source: 'local',
            googleId: null,
            email: email,
            passwordHash: passwordHash,
            name: name
        };
        users.push(newUser);
        console.log(`New local user created: ${newUser.email}. Current users:`, users.map(u=>({id: u.id, email: u.email, source: u.source}))); // Log users for debugging

        // Log in the new user immediately after signup
        req.logIn(newUser, (err) => {
            if (err) {
                console.error("Error logging in after signup:", err);
                // Don't fail the signup, but maybe redirect with a message
                return res.json({ success: true, message: 'Signup successful, but auto-login failed. Please log in manually.', redirectUrl: '/login-page' });

            }
            console.log(`User ${newUser.email} signed up and logged in successfully.`);
             return res.json({ success: true, message: 'Signup successful!', redirectUrl: '/' });
        });

    } catch (err) {
        console.error('Error during signup hashing or saving:', err);
        return res.status(500).json({ success: false, message: 'Server error during sign up.' });
    }
});


// GET Logout
app.post('/logout', (req, res, next) => {
    const userEmail = req.user ? req.user.email : 'Unknown user';
    req.logout((err) => { // passport 0.6+ requires callback
        if (err) {
            console.error(`Error during logout for ${userEmail}:`, err);
            return next(err);
         }
        req.session.destroy((err) => { // Destroy the session completely
             if (err) {
                 console.error(`Error destroying session for ${userEmail}:`, err);
                 // Proceed with redirect even if session destroy fails?
             }
             console.log(`${userEmail} logged out.`);
             res.clearCookie('connect.sid'); // Optional: clear the session cookie
             res.json({ success: true, message: 'Logged out successfully.', redirectUrl: '/login-page' });
         });
    });
});


// GET Google Authentication Initiation
app.get('/auth/google',
    (req, res, next) => {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return res.status(500).send("Google OAuth is not configured on the server.");
        }
        next();
    },
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// GET Google Authentication Callback
app.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login-page?loginError=' + encodeURIComponent('Google login failed. Please try again or use another method.'), // Redirect on failure
        failureFlash: true // Enable flash messages on failure
    }),
    (req, res) => {
        // Successful authentication
        console.log(`Google login successful for ${req.user.email}, redirecting to /.`);
        res.redirect('/'); // Redirect to the main application page
    }
);

// --- API Routes ---

// Get Logged-in User Info
app.get('/api/user', ensureAuthenticated, (req, res) => {
    // Send back relevant user info (don't send password hash!)
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        source: req.user.source
    });
});


// --- Application Routes (Protected) ---

// Serve the main app page (index.html which loads App.js)
app.get('/', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// GENERATE Mindmap from LLM (Protected)
app.post('/generate', ensureAuthenticated, async (req, res) => {
    try {
        const { bookName, authorName, provider, model, conciseness, wordCount } = req.body;
        console.log(`User ${req.user.email} requested generate: Book="${bookName}", Author="${authorName}", Provider="${provider}", Model="${model}", Conciseness="${conciseness}", WordCount="${wordCount || 'Default'}"`);

        if (!bookName || !authorName || !provider || !model) {
            return res.status(400).json({ success: false, error: 'Missing required fields.' });
        }
         if (!basePromptTemplate) {
            console.error("Prompt template is not loaded. Cannot generate.");
            return res.status(500).json({ success: false, error: 'Server configuration error: Prompt template missing.' });
        }


        // Construct dynamic conciseness note
        let concisenessLevel = conciseness || 'concise';
        let noteText;
        const targetWordCount = parseInt(wordCount, 10);
        if (!isNaN(targetWordCount) && targetWordCount > 0) {
            noteText = `Remember it must be ${concisenessLevel} in ${targetWordCount} words.`;
        } else {
            noteText = `Remember it must be ${concisenessLevel} up to 5000 words.`;
        }

        const finalPrompt = basePromptTemplate
            .replace('${bookName}', bookName)
            .replace('${authorName}', authorName)
            .replace('${concisenessNote}', noteText);

        let client;
        let systemMessage = 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format, strictly adhering to the output format requirements.';

        if (provider === 'DeepSeek' && deepseekClient) {
            client = deepseekClient;
        } else if (provider === 'OpenAI' && openaiClient) {
            client = openaiClient;
        } else {
             return res.status(400).json({ success: false, error: `Selected provider "${provider}" is not available or configured.` });
        }

        console.log(`Calling ${provider} model: ${model}`);
        const completion = await client.chat.completions.create({
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: finalPrompt },
            ],
            model: model,
            max_tokens: 8000,
            temperature: 0.7,
        });

        const llmMarkdownOutput = completion.choices[0].message.content;
        if (!llmMarkdownOutput || llmMarkdownOutput.trim() === '') {
            throw new Error('LLM returned empty content.');
        }

        // Process and Save LLM Output (Same logic as before)
         const trimmedOutput = llmMarkdownOutput.trim();
         let fencedMarkdownContent;
         let plainMarkdownContent;
         const fenceStart = '```markdown';
         const fenceEnd = '```';

         if (trimmedOutput.startsWith(fenceStart) && trimmedOutput.endsWith(fenceEnd)) {
             fencedMarkdownContent = llmMarkdownOutput;
             const firstNewlineIndex = fencedMarkdownContent.indexOf('\n');
             const lastFenceIndex = fencedMarkdownContent.lastIndexOf(fenceEnd);
             if (firstNewlineIndex !== -1 && lastFenceIndex > firstNewlineIndex) {
                 plainMarkdownContent = fencedMarkdownContent.substring(firstNewlineIndex + 1, lastFenceIndex).trim();
             } else {
                 plainMarkdownContent = trimmedOutput.substring(fenceStart.length, trimmedOutput.length - fenceEnd.length).trim();
                 console.warn("Could not precisely find content between fences, using basic extraction.");
             }
             console.log('LLM output correctly fenced.');
         } else {
             console.warn('WARN: LLM output did not strictly start/end with ```markdown ... ```. Saving raw output as plain.');
             plainMarkdownContent = llmMarkdownOutput;
             fencedMarkdownContent = `${fenceStart}\n${llmMarkdownOutput}\n${fenceEnd}`;
         }

         // Define user-specific paths (or use a database) - VERY simplified example
         // For now, overwrite the shared files - Needs improvement for multi-user
         const mindmapDir = __dirname; // Saving in the main webapp dir for now
         const mindmapMdPath = path.join(mindmapDir, 'mindmap.md');
         const mindmapPlainMdPath = path.join(mindmapDir, 'mindmap-plain.md');
         const mindmapHtmlPath = path.join(mindmapDir, 'mindmap.html');

         fs.writeFileSync(mindmapMdPath, fencedMarkdownContent, 'utf8');
         console.log(`Saved fenced markdown to: ${mindmapMdPath}`);
         fs.writeFileSync(mindmapPlainMdPath, plainMarkdownContent, 'utf8');
         console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log(`Generated mindmap HTML: ${mindmapHtmlPath}`);

        res.json({ success: true, message: `Mindmap for "${bookName}" generated successfully using ${provider} (${model})!` });

    } catch (err) {
        console.error(`Error in /generate route for user ${req.user.email}:`, err.stack || err);
        let errorMessage = err.message;
        if (err.response && err.response.data) {
             errorMessage = JSON.stringify(err.response.data);
         } else if (err.status === 401) {
             errorMessage = "API Authentication error.";
         } else if (err.status === 429) {
             errorMessage = "API Rate limit exceeded or quota reached.";
         }
        res.status(500).json({ success: false, error: `Generation failed: ${errorMessage}` });
    }
});

// SAVE Edited Markdown from Editor (Protected)
app.post('/save-md', ensureAuthenticated, async (req, res) => {
    try {
        const { mdContent } = req.body;
        if (mdContent === undefined || mdContent === null) {
            return res.status(400).json({ success: false, error: 'No mdContent provided' });
        }
        console.log(`User ${req.user.email} is saving markdown content.`);

        const mdWithFences = "```markdown\n" + mdContent.trim() + "\n```";

        // Again, using shared files - needs user-specific storage in production
         const mindmapDir = __dirname;
         const mindmapMdPath = path.join(mindmapDir, 'mindmap.md');
         const mindmapPlainMdPath = path.join(mindmapDir, 'mindmap-plain.md');
         const mindmapHtmlPath = path.join(mindmapDir, 'mindmap.html');

        fs.writeFileSync(mindmapPlainMdPath, mdContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);
        fs.writeFileSync(mindmapMdPath, mdWithFences, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log(`Regenerated mindmap HTML: ${mindmapHtmlPath}`);

        res.json({ success: true, message: 'Markdown saved and mindmap.html regenerated!' });
    } catch (err) {
        console.error(`Error in /save-md for user ${req.user.email}:`, err.stack || err);
        res.status(500).json({ success: false, error: `Save failed: ${err.message}` });
    }
});

// SERVE the generated mindmap.html (Protected, with cache busting)
app.get('/mindmap.html', ensureAuthenticated, (req, res) => {
    // Using shared file path
    const mindmapPath = path.join(__dirname, 'mindmap.html');
    fs.access(mindmapPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`Mindmap file not found or not readable: ${mindmapPath}`);
             res.status(404).send('<!DOCTYPE html><html><head><title>Mindmap Not Found</title><style>body{font-family:sans-serif;padding:20px;color:#555;}</style></head><body><h1>Mindmap Not Generated Yet</h1><p>Please use the form to generate a mindmap first, or check server logs.</p></body></html>');
        } else {
             console.log(`Serving mindmap file for user ${req.user.email}: ${mindmapPath}`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(mindmapPath);
        }
    });
});

// SERVE the plain markdown content for the editor (Protected, with cache busting)
app.get('/mindmap-plain.md', ensureAuthenticated, (req, res) => {
     // Using shared file path
    const plainMdPath = path.join(__dirname, 'mindmap-plain.md');
    fs.access(plainMdPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.warn(`Plain mindmap file not found for user ${req.user.email}: ${plainMdPath}. Sending empty.`);
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
             res.status(404).send(''); // Send empty on failure
        } else {
             console.log(`Serving plain markdown file for user ${req.user.email}: ${plainMdPath}`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.sendFile(plainMdPath);
        }
    });
});


// --- Helper Function ---
// Needs markmap-lib installed: npm install markmap-lib
const { Transformer } = require('markmap-lib');

async function fetchText(url) {
    // Node 18+ has fetch built-in
    try {
        const fetch = await import('node-fetch').then(mod => mod.default); // Dynamic import for CJS
        console.log(`Workspaceing dependency: ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
        }
        return res.text();
     } catch (fetchError) {
        console.error(`Error using node-fetch for ${url}: ${fetchError.message}`);
         // Fallback or rethrow depending on Node version and setup
         // For Node 18+, built-in fetch might work if node-fetch fails
         if (typeof global.fetch === 'function') {
            console.log(`Retrying fetch for ${url} using global fetch`);
            const res = await global.fetch(url);
            if (!res.ok) throw new Error(`Global fetch failed for ${url}: ${res.status}`);
            return res.text();
        } else {
             throw new Error(`Cannot fetch ${url}. No suitable fetch mechanism found.`);
        }
    }
}


function buildHtml({ rootData, scripts, css, markmapOptions = {} }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Markmap</title>
  <style>
${css}
  </style>
</head>
<body>
  <svg id="mindmap"></svg>
  ${scripts.map((js) => `<script>${js}</script>`).join("\n")}
  <script>
    (function() {
      if (window.markmap && window.markmap.Markmap && window.markmap.deriveOptions) {
        var root = ${JSON.stringify(rootData)};
        var options = ${JSON.stringify(markmapOptions)};
        window.mm = window.markmap.Markmap.create(
          "svg#mindmap",
          window.markmap.deriveOptions(options),
          root
        );
      } else {
        console.error("Markmap library not loaded correctly.");
        var el = document.getElementById('mindmap');
        if (el) {
           el.outerHTML = '<p style="color:red; font-family: sans-serif; padding: 20px;">Error: Markmap library failed to load. Cannot render mindmap. Check browser console.</p>';
        }
      }
    })();
  </script>
</body>
</html>`;
}


// Convert Script Function (adapted from webapp/convert.js)
async function runConvertScript(inputFile, outputFile) {
     const absoluteInputFile = path.resolve(__dirname, inputFile);
     const absoluteOutputFile = path.resolve(__dirname, outputFile);
     console.log(`Converting: ${absoluteInputFile} -> ${absoluteOutputFile}`);

     let rawContent;
     try {
         rawContent = fs.readFileSync(absoluteInputFile, "utf8");
     } catch (err) {
         console.error(`Error reading input file "${absoluteInputFile}" for conversion: ${err.message}`);
         // Create an empty HTML file or one with an error message
         const errorHtml = buildHtml({ rootData: { t: 'r', d: 0, c: [{ t: 'p', d: 1, c: [{ t: 't', d: 2, p: { content: `Error: Could not read input file ${inputFile}` } }] }] }, scripts: [], css: 'body { color: red; }' });
         fs.writeFileSync(absoluteOutputFile, errorHtml, 'utf8');
         throw new Error(`Failed to read input file: ${inputFile}`); // Propagate error
     }

     // --- Robust Markdown Extraction Logic (from original convert.js) ---
     let md;
     let actualStartIndex = -1;
     let startIndexMarker = -1;
     const markers = ['```markdown', '```\n', '```\r\n'];

     for (const marker of markers) {
         startIndexMarker = rawContent.indexOf(marker);
         if (startIndexMarker !== -1) {
             if (marker === '```markdown') {
                 let endOfLine = rawContent.indexOf('\n', startIndexMarker);
                 if (endOfLine === -1) endOfLine = rawContent.length;
                 actualStartIndex = endOfLine + 1;
             } else {
                 actualStartIndex = startIndexMarker + marker.length;
             }
             console.log(`Found start marker "${marker}" at index ${startIndexMarker}. Content starts after index ${actualStartIndex -1}.`);
             break;
         }
     }

     if (actualStartIndex === -1) {
         console.warn("WARN: Could not find starting ``` marker in input. Attempting to process raw content. Conversion may fail.");
         md = rawContent; // Process raw content as fallback
     } else {
         const endIndexMarker = rawContent.lastIndexOf('```');
         if (endIndexMarker !== -1 && endIndexMarker >= actualStartIndex) {
             console.log(`Found last end marker " \`\`\` " at index ${endIndexMarker}. Extracting content.`);
             md = rawContent.substring(actualStartIndex, endIndexMarker).trim();
         } else if (endIndexMarker !== -1 && endIndexMarker < actualStartIndex) {
              console.error("ERROR: Found end ``` marker, but it appears *before* the detected start of content. Cannot extract reliably.");
              md = ""; // Extraction failed
         } else {
             console.warn("WARN: Found starting ``` marker but no closing ``` marker. Extracting from start marker to end of file.");
             md = rawContent.substring(actualStartIndex).trim();
         }
     }
      if (md.trim() === "") {
          console.warn("WARN: Extracted markdown content is empty. The resulting mindmap will be empty or show an error.");
      }
    // --- End Extraction Logic ---


    let root, features;
    try {
        const transformer = new Transformer();
        ({ root, features } = transformer.transform(md || "")); // Use extracted 'md', default to empty string if null/undefined
        console.log("Markdown transformed successfully for conversion.");
    } catch (err) {
        console.error(`Error transforming Markdown during conversion: ${err.message}`);
         root = { t: 'r', d: 0, c: [{ t: 'p', d: 1, c: [{ t: 't', d: 2, p: { content: `Error: Failed to process Markdown from ${path.basename(inputFile)}` } }] }] };
    }

    const defaultCSS = `
      body { margin: 0; padding: 0; background-color: #f8f9fa; }
      svg#mindmap { display: block; width: 100vw; height: 100vh; background-color: white; }
    `;

    const cdnUrls = [
        "[https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js](https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js)",
        "[https://cdn.jsdelivr.net/npm/markmap-view@0.18.10/dist/browser/index.js](https://cdn.jsdelivr.net/npm/markmap-view@0.18.10/dist/browser/index.js)",
    ];

    const scripts = [];
    try {
        console.log("Fetching Markmap JS libraries from CDN for conversion...");
        for (const url of cdnUrls) {
            const js = await fetchText(url);
            scripts.push(js);
        }
        console.log("Markmap JS libraries fetched successfully for conversion.");
    } catch (err) {
        console.error(`CRITICAL Error fetching dependencies from CDN during conversion: ${err.message}. HTML will be generated, but the mindmap might not render.`);
        // Continue, but client-side rendering will likely fail
    }

    console.log("Building HTML output for conversion...");
    const html = buildHtml({
        rootData: root,
        scripts,
        css: defaultCSS,
        markmapOptions: { initialExpandLevel: 2, duration: 500 },
    });

    try {
        fs.writeFileSync(absoluteOutputFile, html, "utf8");
        console.log(`Success! HTML mindmap converted: ${absoluteOutputFile}`);
    } catch (err) {
        console.error(`Error writing converted output file "${absoluteOutputFile}": ${err.message}`);
        throw new Error(`Failed to write output file: ${outputFile}`); // Propagate error
    }
}


// --- Error Handling ---
// Basic 404
app.use((req, res, next) => {
    res.status(404).send("Sorry, can't find that!");
});

// Basic error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack);
    res.status(500).send('Something broke!');
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webapp server listening on port ${PORT}`);
    console.log(`Access the app at ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'fallback_secret_change_me') {
        console.warn('WARN: SESSION_SECRET is not set or is using the default fallback in .env. Please set a strong secret for security.');
    }
});