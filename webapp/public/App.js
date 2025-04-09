// webapp/public/App.js

const App = () => {
    // --- State Variables ---
    // Remove the old 'prompt' state
    // const [prompt, setPrompt] = React.useState('');
    const [bookName, setBookName] = React.useState(''); // New state for book name
    const [authorName, setAuthorName] = React.useState(''); // New state for author name
    const [editorContent, setEditorContent] = React.useState('');
    const [status, setStatus] = React.useState({ message: '', type: '' }); // type: 'info', 'success', 'error'
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [isEditorSaving, setIsEditorSaving] = React.useState(false);

    // --- Handlers ---

    // Handle prompt generation
    const handleGenerate = async (e) => {
        e.preventDefault(); // Prevent default form submission
        // Validate new inputs
        if (!bookName.trim() || !authorName.trim()) {
            setStatus({ message: 'Please enter both Book Name and Author Name.', type: 'error' });
            return;
        }
        setIsLoading(true);
        setStatus({ message: 'Generating mindmap... Please wait.', type: 'info' });

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send bookName and authorName instead of the old prompt
                body: JSON.stringify({ bookName, authorName }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }

            setStatus({ message: 'Mindmap generated successfully! Reloading editor content...', type: 'success' });
            // Automatically load the new content into the editor
            await handleLoadEditor(); // Call load after successful generation
            setStatus({ message: 'Mindmap generated successfully! Editor updated.', type: 'success' });


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
            // Add a cache-busting query parameter
            const response = await fetch(`/mindmap.md?t=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`Could not fetch mindmap.md: ${response.statusText}`);
            }
            const mdContent = await response.text();
            setEditorContent(mdContent);
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

    // --- Render ---
    return (
        <div>
            <h1>Mindmap Generator</h1>

            {/* Input Form */}
            <form onSubmit={handleGenerate}>
                {/* Book Name Input */}
                <div style={{ marginBottom: '15px' }}> {/* Added margin */}
                    <label htmlFor="bookNameInput">Book Name:</label>
                    <input
                        type="text"
                        id="bookNameInput"
                        name="bookName"
                        placeholder="e.g., Atomic Habits"
                        value={bookName}
                        onChange={(e) => setBookName(e.target.value)}
                        disabled={isLoading}
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} // Basic styling
                    />
                </div>

                {/* Author Name Input */}
                 <div style={{ marginBottom: '15px' }}> {/* Added margin */}
                    <label htmlFor="authorNameInput">Author Name:</label>
                    <input
                        type="text"
                        id="authorNameInput"
                        name="authorName"
                        placeholder="e.g., James Clear"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        disabled={isLoading}
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} // Basic styling
                    />
                 </div>

                 {/* Removed the large textarea */}
                {/*
                <label htmlFor="promptInput">Enter your custom prompt:</label>
                <textarea
                    id="promptInput"
                    name="prompt"
                    rows="8"
                    placeholder="Example: Create a comprehensive mindmap about the benefits of React..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isLoading}
                />
                 */}
                <button type="submit" disabled={isLoading || !bookName.trim() || !authorName.trim()}>
                    {isLoading ? 'Generating...' : 'Generate Mindmap'}
                </button>
            </form>

            {/* Status Display */}
            {status.message && (
                 <div className={`status-message ${status.type}`}>
                     {status.message}
                 </div>
            )}

            <hr />

            {/* Links Section */}
            <div className="links">
                <h2>Generated Files</h2>
                 <p>
                    View the generated files (they will open in a new tab):
                 </p>
                <p>
                    <b>Markdown:</b>
                    {/* Add cache-busting query param */}
                    <a href={`/mindmap.md?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                        Open mindmap.md
                    </a>
                </p>
                <p>
                    <b>HTML Mindmap:</b>
                     {/* Add cache-busting query param */}
                    <a href={`/mindmap.html?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                        Open mindmap.html
                    </a>
                </p>
            </div>

            <hr />

            {/* Editor Section */}
            <div className="edit-section">
                <h2>Edit Mindmap Markdown</h2>
                <div className="edit-buttons">
                    <button onClick={handleLoadEditor} disabled={isEditorLoading || isEditorSaving}>
                        {isEditorLoading ? 'Loading...' : 'Load Current mindmap.md'}
                    </button>
                    <button onClick={handleSaveEditor} disabled={isEditorSaving || isEditorLoading}>
                        {isEditorSaving ? 'Saving...' : 'Save & Re-Convert mindmap.md'}
                    </button>
                </div>
                <div>
                    <textarea
                        id="md-editor"
                        rows="20"
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="Load or edit Markdown content here..."
                        disabled={isEditorLoading || isEditorSaving}
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