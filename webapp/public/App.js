// FILE: webapp/public/App.js
// Uses React hooks for state and effects

const App = () => {
    // --- Auth State ---
    const [user, setUser] = React.useState(null); // Holds logged-in user info { email, name, id, source }
    const [authLoading, setAuthLoading] = React.useState(true); // Check auth status on load

    // --- App State (existing) ---
    const [bookName, setBookName] = React.useState('');
    const [authorName, setAuthorName] = React.useState('');
    const [editorContent, setEditorContent] = React.useState('');
    const [status, setStatus] = React.useState({ message: 'Checking authentication...', type: 'info' });
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [selectedConciseness, setSelectedConciseness] = React.useState('concise');
    const [wordCount, setWordCount] = React.useState('');
    const [isEditorSaving, setIsEditorSaving] = React.useState(false);
    const [mindmapKey, setMindmapKey] = React.useState(Date.now());
    const llmOptions = {
        DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
        OpenAI: ['gpt-4.1-mini', 'o3-mini', ]
    };
    const [selectedProvider, setSelectedProvider] = React.useState(Object.keys(llmOptions)[0]);
    const [selectedModel, setSelectedModel] = React.useState(llmOptions[selectedProvider][0]);

    // --- Effect Hook for Initial Auth Check & Load ---
    React.useEffect(() => {
        const checkAuthAndLoad = async () => {
            setAuthLoading(true);
            try {
                const response = await fetch('/api/user'); // Fetch user data
                if (response.ok) {
                    const userData = await response.json();
                    setUser(userData);
                    setStatus({ message: `Welcome, ${userData.name}! Loading existing mindmap...`, type: 'info' });
                    await handleLoadEditor(); // Load editor content *after* successful auth
                    setMindmapKey(Date.now()); // Ensure iframe loads initial state correctly *after* auth
                } else if (response.status === 401 || response.status === 403) { // Unauthorized or Forbidden
                    console.log("User not authenticated, redirecting to login.");
                    setUser(null);
                    window.location.href = '/login-page'; // Redirect if not logged in
                } else {
                    throw new Error(`Failed to fetch user data: ${response.statusText}`);
                }
            } catch (err) {
                console.error('Authentication check failed:', err);
                setStatus({ message: 'Failed to verify authentication. Please try logging in.', type: 'error' });
                setUser(null);
                // Consider redirecting here too, or let the UI show a message
                // window.location.href = '/login-page';
            } finally {
                setAuthLoading(false);
            }
        };
        checkAuthAndLoad();
    }, []); // Run only once on mount

    // --- Handlers (Mostly unchanged, but now assume user is logged in) ---

    const handleProviderChange = (e) => {
        const newProvider = e.target.value;
        setSelectedProvider(newProvider);
        setSelectedModel(llmOptions[newProvider][0]);
    };
    const handleModelChange = (e) => setSelectedModel(e.target.value);
    const handleConcisenessChange = (e) => setSelectedConciseness(e.target.value);
    const handleWordCountChange = (e) => setWordCount(e.target.value);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!bookName.trim() || !authorName.trim()) {
            setStatus({ message: 'Please enter both Book Name and Author Name.', type: 'error' });
            return;
        }
        setIsLoading(true);
        setStatus({ message: `Generating mindmap using ${selectedProvider} (${selectedModel})... Please wait.`, type: 'info' });
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookName, authorName, provider: selectedProvider, model: selectedModel,
                    conciseness: selectedConciseness, wordCount: wordCount,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || `Server error: ${response.statusText}`);
            setStatus({ message: 'Mindmap generated! Loading editor and refreshing view...', type: 'success' });
            await handleLoadEditor();
            setMindmapKey(Date.now());
            setStatus({ message: data.message || `Mindmap generated! View updated.`, type: 'success' });
        } catch (err) {
            console.error('Generation failed:', err);
            setStatus({ message: `Generation failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

     const handleLoadEditor = async () => {
        // No need to check auth here, it's done on initial load
        setIsEditorLoading(true);
        try {
            const response = await fetch(`/mindmap-plain.md?t=${Date.now()}`);
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("mindmap-plain.md not found, editor will be empty.");
                    setEditorContent('');
                     setStatus(prev => ({ message: prev.type === 'error' ? prev.message : 'No existing mindmap content found.', type: prev.type === 'error' ? 'error' : 'info'}));
                } else {
                    throw new Error(`Failed to fetch plain markdown: ${response.statusText}`);
                }
            } else {
                const mdContent = await response.text();
                setEditorContent(mdContent);
                setStatus(prev => ({ message: (prev.type === 'success' || prev.type === 'error') ? prev.message : 'Loaded mindmap content into editor.', type: (prev.type === 'success' || prev.type === 'error') ? prev.type : 'success'}));
            }
        } catch (err) {
            console.error('Failed to load editor content:', err);
            setStatus({ message: `Failed to load mindmap content for editor: ${err.message}`, type: 'error' });
            setEditorContent('');
        } finally {
            setIsEditorLoading(false);
        }
    };


    const handleSaveEditor = async () => {
        const plainMdContent = editorContent;
        if (!plainMdContent.trim()) {
            setStatus({ message: 'Editor is empty. Nothing to save.', type: 'info' });
            return;
        }
        setIsEditorSaving(true);
        setStatus({ message: 'Saving editor content and regenerating mindmap...', type: 'info' });
        try {
            const response = await fetch('/save-md', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mdContent: plainMdContent }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || `Server error: ${response.statusText}`);
            setStatus({ message: 'Saved & re-converted successfully! Refreshing view...', type: 'success' });
            setMindmapKey(Date.now());
            setStatus({ message: data.message || 'Editor content saved & mindmap view updated!', type: 'success' });
        } catch (err) {
            console.error('Save failed:', err);
            setStatus({ message: `Save failed: ${err.message}`, type: 'error' });
        } finally {
            setIsEditorSaving(false);
        }
    };

    // --- Logout Handler ---
     const handleLogout = async () => {
        setStatus({ message: 'Logging out...', type: 'info' });
        try {
            const response = await fetch('/logout', { method: 'POST' });
            const data = await response.json();
            if (response.ok && data.success) {
                setUser(null); // Clear user state
                window.location.href = data.redirectUrl || '/login-page'; // Redirect to login
            } else {
                throw new Error(data.message || 'Logout failed');
            }
        } catch (err) {
            console.error('Logout failed:', err);
            setStatus({ message: `Logout failed: ${err.message}`, type: 'error' });
        }
    };


    // --- Conditional Rendering ---
    if (authLoading) {
        return <div style={{ padding: '40px', textAlign: 'center', fontSize: '1.2em' }}>Loading Application...</div>;
    }

    // If not authenticated after check (should have been redirected, but as a fallback)
    if (!user) {
         // Maybe show a link to login page instead of just blank
         return <div style={{ padding: '40px', textAlign: 'center' }}>
             <h1>Authentication Required</h1>
             <p>Please <a href="/login-page">log in</a> to use the application.</p>
             {status.message && status.type === 'error' && <p style={{color: 'red'}}>{status.message}</p>}
         </div>;
    }


    // --- Render Authenticated App ---
    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', position: 'relative' /* Needed for absolute positioning of user info */ }}>

            {/* User Info & Logout Button */}
            <div className="user-info">
                <span>Logged in as: <strong>{user.name || user.email}</strong> ({user.source})</span>
                <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>


            {/* Left Panel: Controls & Editor */}
            <div style={{ width: '40%', minWidth: '450px', padding: '20px', borderRight: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '50px' /* Add padding to avoid overlap with user-info */ }}>
                <h1 style={{ flexShrink: 0 }}>Mindmap Generator & Editor</h1>

                {/* Input Form */}
                <form onSubmit={handleGenerate} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #eee', borderRadius: '5px', backgroundColor: '#f9f9f9', flexShrink: 0 }}>
                    {/* Provider Select */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="providerSelect">LLM Provider:</label>
                        <select id="providerSelect" value={selectedProvider} onChange={handleProviderChange} disabled={isLoading}>
                            {Object.keys(llmOptions).map(provider => (<option key={provider} value={provider}>{provider}</option>))}
                        </select>
                    </div>
                     {/* Model Select */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="modelSelect">Model:</label>
                        <select id="modelSelect" value={selectedModel} onChange={handleModelChange} disabled={isLoading}>
                           {llmOptions[selectedProvider].map(model => (<option key={model} value={model}>{model}</option>))}
                        </select>
                    </div>
                     {/* Conciseness Select */}
                     <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="concisenessSelect">Summary Style:</label>
                        <select id="concisenessSelect" value={selectedConciseness} onChange={handleConcisenessChange} disabled={isLoading}>
                            <option value="concise">Concise</option>
                            <option value="balanced">Balanced</option>
                            <option value="comprehensive">Comprehensive</option>
                        </select>
                     </div>
                     {/* Word Count Input */}
                    <div style={{ marginBottom: '15px' }}>
                         <label htmlFor="wordCountInput">Target Word Count (Optional):</label>
                         <input type="number" id="wordCountInput" name="wordCount" placeholder="e.g., 4000 (default: up to 5000)"
                             value={wordCount} onChange={handleWordCountChange} disabled={isLoading} min="100" />
                     </div>
                    {/* Book Name */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="bookNameInput">Book Name:</label>
                        <input type="text" id="bookNameInput" name="bookName" placeholder="e.g., Atomic Habits" value={bookName} onChange={(e) => setBookName(e.target.value)} disabled={isLoading} required />
                    </div>
                    {/* Author Name */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="authorNameInput">Author Name:</label>
                        <input type="text" id="authorNameInput" name="authorName" placeholder="e.g., James Clear" value={authorName} onChange={(e) => setAuthorName(e.target.value)} disabled={isLoading} required />
                    </div>
                    {/* Submit Button */}
                    <button type="submit" disabled={isLoading || !bookName.trim() || !authorName.trim()} style={{ backgroundColor: isLoading ? '#ccc' : '#007bff', color: 'white' }}>
                        {isLoading ? 'Generating...' : 'Generate Mindmap'}
                    </button>
                </form>

                 {/* Status Display */}
                 {status.message && (
                    <div style={{ padding: '12px', marginBottom: '15px', borderRadius: '4px', border: '1px solid', flexShrink: 0,
                         borderColor: status.type === 'error' ? '#f5c6cb' : (status.type === 'success' ? '#c3e6cb' : '#bee5eb'),
                         backgroundColor: status.type === 'error' ? '#f8d7da' : (status.type === 'success' ? '#d4edda' : '#d1ecf1'),
                         color: status.type === 'error' ? '#721c24' : (status.type === 'success' ? '#155724' : '#0c5460'),
                    }}>
                         {status.message}
                     </div>
                 )}

                <hr style={{ margin: '20px 0', flexShrink: 0 }}/>

                {/* Editor Section */}
                <div className="edit-section" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    <h2 style={{ flexShrink: 0, marginBottom: '10px' }}>Edit Mindmap Markdown</h2>
                    <div className="edit-buttons" style={{ marginBottom: '10px', flexShrink: 0 }}>
                        <button onClick={handleLoadEditor} disabled={isEditorLoading || isEditorSaving} style={{ cursor: (isEditorLoading || isEditorSaving) ? 'wait' : 'pointer' }}>
                            {isEditorLoading ? 'Loading...' : 'Load/Refresh Editor'}
                        </button>
                        <button onClick={handleSaveEditor} disabled={isEditorSaving || isEditorLoading || !editorContent.trim()} style={{ cursor: (isEditorSaving || isEditorLoading || !editorContent.trim()) ? 'not-allowed' : 'pointer', backgroundColor: (isEditorSaving || isEditorLoading) ? '#ccc' : '#28a745', color:'white', border:'none' }}>
                            {isEditorSaving ? 'Saving...' : 'Save & Re-Convert'}
                        </button>
                    </div>
                    {/* Textarea */}
                    <div style={{ flexGrow: 1, display: 'flex' }}>
                         <textarea id="md-editor" value={editorContent} onChange={(e) => setEditorContent(e.target.value)}
                             placeholder="Load or edit PLAIN Markdown content here..."
                             disabled={isEditorLoading || isEditorSaving}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'monospace', fontSize: '0.9em',
                                 border: '1px solid #ccc', borderRadius: '4px', flexGrow: 1, resize: 'none'
                            }}
                         />
                    </div>
                </div>
            </div>

            {/* Right Panel: Mindmap View (Iframe) */}
            <div style={{ width: '60%', height: '100vh', overflow: 'hidden', borderLeft: '1px solid #eee' }}>
                <iframe key={mindmapKey} src={`/mindmap.html?v=${mindmapKey}`} title="Interactive Mindmap Preview"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                 >
                     Your browser doesn't support iframes.
                 </iframe>
            </div>
        </div>
    );
};

// --- Mount the App ---
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);