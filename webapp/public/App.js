// FILE: webapp/public/App.js
// webapp/public/App.js

const App = () => {
    // --- State Variables ---
    const [bookName, setBookName] = React.useState('');
    const [authorName, setAuthorName] = React.useState('');
    const [editorContent, setEditorContent] = React.useState('');
    const [status, setStatus] = React.useState({ message: '', type: '' }); // type: 'info', 'success', 'error'
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [isEditorSaving, setIsEditorSaving] = React.useState(false);

    // --- LLM Selection State ---
    const llmOptions = {
        DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
        OpenAI: ['gpt-4o-mini', 'gpt-4o']
    };
    const [selectedProvider, setSelectedProvider] = React.useState(Object.keys(llmOptions)[0]); // Default to first provider
    const [selectedModel, setSelectedModel] = React.useState(llmOptions[selectedProvider][0]); // Default to first model of default provider

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

            setStatus({ message: 'Mindmap generated successfully! Reloading editor content...', type: 'success' });
            await handleLoadEditor(); // Call load after successful generation
            // Final success message after loading
             setStatus({ message: `Mindmap generated successfully using ${selectedProvider} (${selectedModel})! Editor updated.`, type: 'success' });


        } catch (err) {
            console.error('Generation failed:', err);
            setStatus({ message: `Generation failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle loading mindmap.md into the editor
    const handleLoadEditor = async () => {
        setIsEditorLoading(true);
        setStatus({ message: 'Loading mindmap.md...', type: 'info' });
        try {
            const response = await fetch(`/mindmap.md?t=${new Date().getTime()}`); // Cache buster
            if (!response.ok) {
                throw new Error(`Could not fetch mindmap.md: ${response.statusText} (Status: ${response.status})`);
            }
            const mdContent = await response.text();
            setEditorContent(mdContent);
             // Clear status on successful load or set success message
             setStatus({ message: 'Loaded mindmap.md into editor.', type: 'success' });
        } catch (err) {
            console.error('Failed to load editor content:', err);
            setStatus({ message: `Failed to load mindmap.md: ${err.message}`, type: 'error' });
            setEditorContent(''); // Clear editor on error
        } finally {
            setIsEditorLoading(false);
        }
    };

    // Handle saving editor content to mindmap.md
    const handleSaveEditor = async () => {
        if (!editorContent.trim()) {
             setStatus({ message: 'Editor is empty. Nothing to save.', type: 'error' });
             return;
        }
        setIsEditorSaving(true);
        setStatus({ message: 'Saving mindmap.md and reconverting...', type: 'info' });

        try {
            const response = await fetch('/save-md', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mdContent: editorContent }),
            });
            const data = await response.json();

             if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }

            setStatus({ message: 'Mindmap saved and re-generated successfully!', type: 'success' });
        } catch (err) {
             console.error('Save failed:', err);
             setStatus({ message: `Save failed: ${err.message}`, type: 'error' });
        } finally {
             setIsEditorSaving(false);
        }
    };

     // --- Effect to load editor on initial mount ---
     React.useEffect(() => {
        handleLoadEditor();
     }, []); // Empty dependency array ensures this runs only once on mount

    // --- Render ---
    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '800px', margin: 'auto' }}>
            <h1>Mindmap Generator</h1>

            {/* Input Form */}
            <form onSubmit={handleGenerate} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #eee', borderRadius: '5px' }}>
                {/* LLM Provider Selection */}
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="providerSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>LLM Provider:</label>
                    <select
                        id="providerSelect"
                        value={selectedProvider}
                        onChange={handleProviderChange}
                        disabled={isLoading}
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                    >
                        {Object.keys(llmOptions).map(provider => (
                            <option key={provider} value={provider}>{provider}</option>
                        ))}
                    </select>
                </div>

                 {/* LLM Model Selection */}
                 <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="modelSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Model:</label>
                    <select
                        id="modelSelect"
                        value={selectedModel}
                        onChange={handleModelChange}
                        disabled={isLoading}
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                    >
                        {llmOptions[selectedProvider].map(model => (
                            <option key={model} value={model}>{model}</option>
                        ))}
                    </select>
                 </div>

                {/* Book Name Input */}
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="bookNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Book Name:</label>
                    <input
                        type="text"
                        id="bookNameInput"
                        name="bookName"
                        placeholder="e.g., Atomic Habits"
                        value={bookName}
                        onChange={(e) => setBookName(e.target.value)}
                        disabled={isLoading}
                        required // Make fields required
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Author Name Input */}
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="authorNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Author Name:</label>
                    <input
                        type="text"
                        id="authorNameInput"
                        name="authorName"
                        placeholder="e.g., James Clear"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        disabled={isLoading}
                        required // Make fields required
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !bookName.trim() || !authorName.trim()}
                    style={{ padding: '10px 15px', cursor: isLoading ? 'wait' : 'pointer' }}
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
                        borderColor: status.type === 'error' ? '#f5c6cb' : (status.type === 'success' ? '#c3e6cb' : '#bee5eb'),
                        backgroundColor: status.type === 'error' ? '#f8d7da' : (status.type === 'success' ? '#d4edda' : '#d1ecf1'),
                        color: status.type === 'error' ? '#721c24' : (status.type === 'success' ? '#155724' : '#0c5460'),
                     }}
                    className={`status-message ${status.type}`} // Keep class for potential CSS targeting
                >
                     {status.message}
                 </div>
            )}

            <hr style={{ margin: '20px 0' }}/>

            {/* Links Section */}
            <div className="links" style={{ marginBottom: '20px' }}>
                <h2>Generated Files</h2>
                 <p>View the generated files (they will open in a new tab, might need refresh after generating/saving):</p>
                <p style={{ marginBottom: '5px' }}>
                    <b>Markdown:</b>{' '}
                    {/* Add key to force re-render on status change potentially */}
                    <a key={`md-${status.message}`} href={`/mindmap.md?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                        Open mindmap.md
                    </a>
                </p>
                <p>
                    <b>HTML Mindmap:</b>{' '}
                    {/* Add key to force re-render on status change potentially */}
                    <a key={`html-${status.message}`} href={`/mindmap.html?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                         Open mindmap.html
                    </a>
                </p>
            </div>

            <hr style={{ margin: '20px 0' }}/>

            {/* Editor Section */}
            <div className="edit-section">
                <h2>Edit Mindmap Markdown</h2>
                <div className="edit-buttons" style={{ marginBottom: '10px' }}>
                    <button
                        onClick={handleLoadEditor}
                        disabled={isEditorLoading || isEditorSaving}
                        style={{ marginRight: '10px', padding: '8px 12px' }}
                    >
                        {isEditorLoading ? 'Loading...' : 'Load/Refresh Editor'}
                    </button>
                    <button
                        onClick={handleSaveEditor}
                        disabled={isEditorSaving || isEditorLoading || !editorContent.trim()} // Disable if empty
                        style={{ padding: '8px 12px' }}
                    >
                        {isEditorSaving ? 'Saving...' : 'Save & Re-Convert'}
                    </button>
                </div>
                <div>
                    <textarea
                        id="md-editor"
                        rows="25" // Increased rows
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="Load or edit Markdown content here..."
                        disabled={isEditorLoading || isEditorSaving}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'monospace', fontSize: '0.9em' }} // Monospace font for editing
                    />
                </div>
            </div>
        </div>
    );
};

// --- Mount the App ---
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);