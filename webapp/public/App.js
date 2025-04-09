// FILE: webapp/public/App.js
// webapp/public/App.js

const App = () => {
    // --- State Variables ---
    const [bookName, setBookName] = React.useState('');
    const [authorName, setAuthorName] = React.useState('');
    const [editorContent, setEditorContent] = React.useState(''); // Holds PLAIN markdown
    const [status, setStatus] = React.useState({ message: 'App loaded. Load editor or generate a new mindmap.', type: 'info' }); // type: 'info', 'success', 'error'
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [isEditorSaving, setIsEditorSaving] = React.useState(false);

    // --- *** NEW STATE for iframe cache busting *** ---
    const [mindmapKey, setMindmapKey] = React.useState(Date.now()); // Initialize with timestamp

    // --- LLM Selection State ---
    const llmOptions = {
        DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
        OpenAI: ['gpt-4o-mini', 'gpt-4o']
    };
    const [selectedProvider, setSelectedProvider] = React.useState(Object.keys(llmOptions)[0]);
    const [selectedModel, setSelectedModel] = React.useState(llmOptions[selectedProvider][0]);

    // --- Handlers ---

    // Handle Provider Change
    const handleProviderChange = (e) => {
        const newProvider = e.target.value;
        setSelectedProvider(newProvider);
        // Reset model to the first available for the new provider
        setSelectedModel(llmOptions[newProvider][0]);
    };

    // Handle Model Change
    const handleModelChange = (e) => {
        setSelectedModel(e.target.value);
    };

    // Handle prompt generation
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
                // Send bookName, authorName, and selected LLM info
                body: JSON.stringify({
                    bookName,
                    authorName,
                    provider: selectedProvider,
                    model: selectedModel
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }

            setStatus({ message: 'Mindmap generated successfully! Loading editor and updating view...', type: 'success' });
            await handleLoadEditor(); // Load editor content after generation
            // --- *** UPDATE mindmapKey to refresh iframe *** ---
            setMindmapKey(Date.now());
            // --- *** END UPDATE *** ---
             setStatus({ message: `Mindmap generated with ${selectedProvider} (${selectedModel})! View updated.`, type: 'success' });


        } catch (err) {
            console.error('Generation failed:', err);
            setStatus({ message: `Generation failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle loading mindmap-plain.md into the editor
    const handleLoadEditor = async () => {
        setIsEditorLoading(true);
        // Keep existing status unless just loading
        // setStatus({ message: 'Loading mindmap content into editor...', type: 'info' });
        try {
             // Always try to fetch mindmap-plain.md
            const response = await fetch(`/mindmap-plain.md?t=${new Date().getTime()}`); // Cache buster
            if (!response.ok) {
                // If plain fails, try the fenced one as a fallback (might happen on first ever run)
                 const fallbackResponse = await fetch(`/mindmap.md?t=${new Date().getTime()}`);
                 if (!fallbackResponse.ok) {
                    // If both fail, it likely hasn't been generated yet.
                    throw new Error(`No mindmap content found (mindmap-plain.md or mindmap.md). Please generate one.`);
                 }
                 console.warn("mindmap-plain.md not found, loading mindmap.md into editor (may include fences).");
                 let mdContent = await fallbackResponse.text();
                 // Attempt to strip fences if loading the fallback
                 const fenceStart = '```markdown\n';
                 const fenceEnd = '\n```';
                 if (mdContent.startsWith(fenceStart) && mdContent.endsWith(fenceEnd)) {
                    mdContent = mdContent.substring(fenceStart.length, mdContent.length - fenceEnd.length).trim();
                 }
                 setEditorContent(mdContent);

            } else {
                // Successfully loaded plain content
                const mdContent = await response.text();
                setEditorContent(mdContent);
            }

            // Update status only if not already showing success/error from generate/save
             setStatus(prevStatus => ({
                message: prevStatus.type === 'success' || prevStatus.type === 'error'
                    ? prevStatus.message // Keep the important message
                    : 'Loaded mindmap content into editor.', // Set neutral load message
                type: prevStatus.type || 'success' // Keep status type or set success
            }));

        } catch (err) {
            console.error('Failed to load editor content:', err);
            setStatus({ message: `Failed to load mindmap content for editor: ${err.message}`, type: 'error' });
            setEditorContent(''); // Clear editor on error
        } finally {
            setIsEditorLoading(false);
        }
    };

    // Handle saving editor content (PLAIN markdown) to server
    const handleSaveEditor = async () => {
        // Use editorContent which should be PLAIN markdown
        const plainMdContent = editorContent;
        if (!plainMdContent.trim()) {
             setStatus({ message: 'Editor is empty. Nothing to save.', type: 'error' });
             return;
        }
        setIsEditorSaving(true);
        setStatus({ message: 'Saving editor content and regenerating mindmap...', type: 'info' });

        try {
            const response = await fetch('/save-md', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send the PLAIN markdown content from the editor
                body: JSON.stringify({ mdContent: plainMdContent }),
            });
            const data = await response.json();

             if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }

            setStatus({ message: 'Editor content saved & mindmap regenerated successfully! Updating view...', type: 'success' });
             // --- *** UPDATE mindmapKey to refresh iframe *** ---
             setMindmapKey(Date.now());
             // --- *** END UPDATE *** ---
            setStatus({ message: 'Editor content saved & mindmap view updated!', type: 'success' });

        } catch (err) {
             console.error('Save failed:', err);
             setStatus({ message: `Save failed: ${err.message}`, type: 'error' });
        } finally {
             setIsEditorSaving(false);
        }
    };

     // --- Effect to load editor and refresh iframe on initial mount ---
     React.useEffect(() => {
       handleLoadEditor(); // Load editor content
       setMindmapKey(Date.now()); // Ensure iframe loads initial state
     }, []); // Empty dependency array ensures this runs only once on mount

    // --- Render ---
    return (
        // Use flexbox for side-by-side layout
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>

            {/* Left Panel: Controls & Editor */}
            <div style={{ width: '40%', minWidth: '400px', padding: '20px', borderRight: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <h1>Mindmap Generator</h1>

                {/* Input Form */}
                <form onSubmit={handleGenerate} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #eee', borderRadius: '5px', flexShrink: 0 }}>
                    {/* LLM Provider Selection */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="providerSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>LLM Provider:</label>
                        <select id="providerSelect" value={selectedProvider} onChange={handleProviderChange} disabled={isLoading} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}>
                            {Object.keys(llmOptions).map(provider => ( <option key={provider} value={provider}>{provider}</option> ))}
                        </select>
                    </div>
                    {/* LLM Model Selection */}
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="modelSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Model:</label>
                        <select id="modelSelect" value={selectedModel} onChange={handleModelChange} disabled={isLoading} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}>
                            {llmOptions[selectedProvider].map(model => ( <option key={model} value={model}>{model}</option> ))}
                        </select>
                    </div>
                     {/* Book Name Input */}
                     <div style={{ marginBottom: '15px' }}>
                         <label htmlFor="bookNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Book Name:</label>
                         <input type="text" id="bookNameInput" name="bookName" placeholder="e.g., Atomic Habits" value={bookName} onChange={(e) => setBookName(e.target.value)} disabled={isLoading} required style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }} />
                     </div>
                     {/* Author Name Input */}
                     <div style={{ marginBottom: '15px' }}>
                         <label htmlFor="authorNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Author Name:</label>
                         <input type="text" id="authorNameInput" name="authorName" placeholder="e.g., James Clear" value={authorName} onChange={(e) => setAuthorName(e.target.value)} disabled={isLoading} required style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }} />
                     </div>
                    <button
                        type="submit"
                        disabled={isLoading || !bookName.trim() || !authorName.trim()}
                        style={{
                            padding: '10px 15px',
                            cursor: (isLoading || !bookName.trim() || !authorName.trim()) ? 'not-allowed' : 'pointer',
                            backgroundColor: isLoading ? '#ccc' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '1rem'
                         }}
                    >
                        {isLoading ? 'Generating...' : 'Generate Mindmap'}
                    </button>
                </form>

                {/* Status Display */}
                 {status.message && (
                     <div
                         style={{
                             padding: '10px',
                             marginBottom: '15px',
                             borderRadius: '4px',
                             border: '1px solid',
                             flexShrink: 0, // Prevent status from shrinking
                             borderColor: status.type === 'error' ? '#f5c6cb' : (status.type === 'success' ? '#c3e6cb' : '#bee5eb'),
                             backgroundColor: status.type === 'error' ? '#f8d7da' : (status.type === 'success' ? '#d4edda' : '#d1ecf1'),
                             color: status.type === 'error' ? '#721c24' : (status.type === 'success' ? '#155724' : '#0c5460'),
                          }}
                         className={`status-message ${status.type}`}
                     >
                         {status.message}
                     </div>
                 )}

                <hr style={{ margin: '20px 0', flexShrink: 0 }}/>

                {/* Editor Section */}
                {/* Make editor flex-grow to take remaining space */}
                <div className="edit-section" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    <h2 style={{ flexShrink: 0 }}>Edit Mindmap Markdown (Plain)</h2>
                    <div className="edit-buttons" style={{ marginBottom: '10px', flexShrink: 0 }}>
                        <button
                            onClick={handleLoadEditor}
                            disabled={isEditorLoading || isEditorSaving}
                            style={{ marginRight: '10px', padding: '8px 12px', cursor: (isEditorLoading || isEditorSaving) ? 'wait' : 'pointer' }}
                        >
                            {isEditorLoading ? 'Loading...' : 'Load/Refresh Editor'}
                        </button>
                        <button
                            onClick={handleSaveEditor}
                            disabled={isEditorSaving || isEditorLoading || !editorContent.trim()}
                            style={{ padding: '8px 12px', cursor: (isEditorSaving || isEditorLoading || !editorContent.trim()) ? 'not-allowed' : 'pointer' }}
                         >
                            {isEditorSaving ? 'Saving...' : 'Save & Re-Convert'}
                        </button>
                    </div>
                    {/* Make textarea grow */}
                    <div style={{ flexGrow: 1, display: 'flex' }}>
                        <textarea
                            id="md-editor"
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            placeholder="Load or edit PLAIN Markdown content here... (Fences ```markdown ... ``` will be added on save)"
                            disabled={isEditorLoading || isEditorSaving}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '10px',
                                fontFamily: 'monospace',
                                fontSize: '0.9em',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                flexGrow: 1, // Take up available vertical space
                                resize: 'none' // Disable manual resize handle
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Right Panel: Mindmap View */}
            <div style={{ width: '60%', height: '100vh', overflow: 'hidden', borderLeft: '1px solid #eee' /* Optional separator */ }}>
                 {/* --- *** EMBEDDED IFRAME *** --- */}
                 <iframe
                    // Unique key prop forces iframe recreation on key change, stronger than src change sometimes
                    key={mindmapKey}
                    // Use the mindmapKey in the src to force reload on change
                    src={`/mindmap.html?v=${mindmapKey}`}
                    title="Interactive Mindmap"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    // sandbox="allow-scripts allow-same-origin" // Uncomment if stricter security needed, but test interactivity
                >
                    Your browser does not support iframes. Please use the link to view the mindmap.
                </iframe>
                 {/* --- *** END IFRAME *** --- */}
            </div>

        </div>
    );
};

// --- Mount the App ---
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);