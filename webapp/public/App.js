// FILE: webapp/public/App.js
// React UI for Mindmap Generator & Editor with toolbar controls for markmap options (JSX)

const App = () => {
    // --- State Variables ---
    const [bookName, setBookName] = React.useState('');
    const [authorName, setAuthorName] = React.useState('');
    const [editorContent, setEditorContent] = React.useState(''); // Holds PLAIN markdown
    const [status, setStatus] = React.useState({ message: 'App loaded. Ready to generate or load existing mindmap.', type: 'info' });
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [selectedConciseness, setSelectedConciseness] = React.useState('concise');
    const [wordCount, setWordCount] = React.useState('');
    const [mindmapKey, setMindmapKey] = React.useState(Date.now());
    const saveTimeoutRef = React.useRef(null);
    // Flag to mark when editorContent changes were user-initiated vs programmatic
    const userEditRef = React.useRef(false);

    // --- LLM Selection State ---
    const llmOptions = {
        Google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
        OpenAI: ['gpt-5-mini', 'o4-mini', 'gpt-4.1-mini'],
    };
    const defaultProvider = Object.keys(llmOptions)[0];
    const [selectedProvider, setSelectedProvider] = React.useState(defaultProvider);
    const defaultModel = llmOptions[defaultProvider]?.[0] || '';
    const [selectedModel, setSelectedModel] = React.useState(defaultModel);

    // --- Toolbar State ---
    const [currentInitialExpandLevel, setCurrentInitialExpandLevel] = React.useState(2);
    const [isWrapped, setIsWrapped] = React.useState(false);

    // --- Utility: YAML serializer (simple) ---
    const yamlSerialize = (obj, indent = 2) => {
        const lines = [];
        const pad = (n) => ' '.repeat(n);
        const serialize = (value, level, keyName) => {
            if (Array.isArray(value)) {
                lines.push(`${pad(level)}${keyName}:`);
                value.forEach(item => {
                    lines.push(`${pad(level + indent)}- ${item}`);
                });
            } else if (value && typeof value === 'object') {
                if (keyName) lines.push(`${pad(level)}${keyName}:`);
                Object.entries(value).forEach(([k, v]) => {
                    serialize(v, level + (keyName ? indent : 0), k);
                });
            } else {
                const v = value === null || value === undefined ? '' : String(value);
                lines.push(`${pad(level)}${keyName}: ${v}`);
            }
        };
        Object.entries(obj).forEach(([k, v]) => serialize(v, indent, k));
        return lines.join('\n');
    };

    // --- Parse markmap frontmatter from markdown (simple) ---
    const parseMarkmapFromMd = (md) => {
        const fmMatch = md.match(/^\s*---\s*[\r\n]+([\s\S]*?)\r?\n---\s*\r?\n?/);
        if (!fmMatch) return {};
        const fm = fmMatch[1];
        const lines = fm.split(/\r?\n/);
        let inMarkmap = false;
        let baseIndent = 0;
        const opts = {};
        let currentArrayKey = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!inMarkmap) {
                if (/^\s*markmap:\s*$/.test(line)) {
                    inMarkmap = true;
                    baseIndent = line.match(/^\s*/)[0].length;
                }
                continue;
            } else {
                if (/^\s*$/.test(line)) continue;
                const indent = line.match(/^\s*/)[0].length;
                if (indent <= baseIndent) break;
                const trimmed = line.trim();
                const arrayItemMatch = trimmed.match(/^- (.+)$/);
                if (arrayItemMatch && currentArrayKey) {
                    opts[currentArrayKey].push(parseValue(arrayItemMatch[1]));
                } else {
                    const kvMatch = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
                    if (kvMatch) {
                        const key = kvMatch[1];
                        let val = kvMatch[2];
                        if (val === '') {
                            opts[key] = [];
                            currentArrayKey = key;
                        } else {
                            currentArrayKey = null;
                            opts[key] = parseValue(val);
                        }
                    } else {
                        currentArrayKey = null;
                    }
                }
            }
        }
        return opts;
    };

    const parseValue = (str) => {
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str, 10);
        if (/^(true|false)$/i.test(str)) return str.toLowerCase() === 'true';
        return str.replace(/^["'](.+)["']$/, '$1');
    };

    const buildMarkdownWithMarkmap = (mdContent, newMarkmap) => {
        const contentWithoutFM = mdContent.replace(/^\s*---\s*[\r\n]+([\s\S]*?)\r?\n---\s*\r?\n?/, '');
        const fm = `---\nmarkmap:\n${yamlSerialize(newMarkmap, 2)}\n---\n\n`;
        return fm + contentWithoutFM;
    };

    const getMarkmapOptions = () => {
        try {
            return parseMarkmapFromMd(editorContent);
        } catch (err) {
            console.warn('Failed parsing markmap from editor content', err);
            return {};
        }
    };

    const updateMarkmapOptions = async (newOptions, opts = { save: true, refresh: true }) => {
        const merged = { ...getMarkmapOptions(), ...newOptions };
        const newMd = buildMarkdownWithMarkmap(editorContent, merged);
        // Mark this as a programmatic update so the auto-save effect does not double-save
        userEditRef.current = false;
        setEditorContent(newMd);
        if (opts.save) {
            // When saving programmatically, rely on saveEditorContent to refresh the mindmap,
            // so avoid calling setMindmapKey here to prevent double-refresh.
            await saveEditorContent(newMd);
        } else if (opts.refresh) {
            // Refresh view without saving to disk
            setMindmapKey(Date.now());
        }
        setCurrentInitialExpandLevel(typeof merged.initialExpandLevel === 'number' ? merged.initialExpandLevel : 2);
        setIsWrapped(Boolean(merged.maxWidth && merged.maxWidth > 0));
    };

    // --- Toolbar Handlers ---
    const handleExpandAll = () => {
        updateMarkmapOptions({ initialExpandLevel: -1 });
        setStatus({ message: 'Set mindmap to expand all nodes (initialExpandLevel: -1).', type: 'success' });
    };
    const handleCollapseToLevel2 = () => {
        updateMarkmapOptions({ initialExpandLevel: 2 });
        setStatus({ message: 'Collapsed mindmap to initialExpandLevel: 2.', type: 'success' });
    };
    const handleAdjustLevel = (delta) => {
        const opts = getMarkmapOptions();
        let cur = typeof opts.initialExpandLevel === 'number' ? opts.initialExpandLevel : 2;
        if (cur === -1) cur = 2;
        let next = cur + delta;
        if (next < 0) next = 0;
        updateMarkmapOptions({ initialExpandLevel: next });
        setStatus({ message: `Set initialExpandLevel to ${next}.`, type: 'success' });
    };
    const handleToggleWrap = () => {
        const opts = getMarkmapOptions();
        const curMax = typeof opts.maxWidth === 'number' ? opts.maxWidth : 0;
        const newMax = curMax > 0 ? 0 : 400;
        updateMarkmapOptions({ maxWidth: newMax });
        setStatus({ message: `Set node wrapping ${newMax > 0 ? 'enabled' : 'disabled'}.`, type: 'success' });
    };

    const handleDownloadInteractive = async () => {
        try {
            const res = await fetch(`/mindmap.html?v=${mindmapKey}`);
            if (!res.ok) throw new Error(`Failed to fetch mindmap.html: ${res.statusText}`);
            const html = await res.text();
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap-interactive.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setStatus({ message: 'Downloaded interactive mindmap HTML.', type: 'success' });
        } catch (err) {
            console.error(err);
            setStatus({ message: `Download failed: ${err.message}`, type: 'error' });
        }
    };

    // --- Provider/Model handlers ---
    const handleProviderChange = (e) => {
        const newProvider = e.target.value;
        setSelectedProvider(newProvider);
        const newDefaultModel = llmOptions[newProvider]?.[0] || '';
        setSelectedModel(newDefaultModel);
    };
    const handleModelChange = (e) => setSelectedModel(e.target.value);
    const handleConcisenessChange = (e) => setSelectedConciseness(e.target.value);
    const handleWordCountChange = (e) => setWordCount(e.target.value);

    // --- Load editor content ---
    const handleLoadEditor = async () => {
        setIsEditorLoading(true);
        try {
            const response = await fetch(`/mindmap-plain.md?t=${Date.now()}`);
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("mindmap-plain.md not found, editor will be empty.");
                    setEditorContent('');
                    setStatus(prev => ({
                        message: prev.type === 'error' ? prev.message : 'No existing mindmap content found to load into editor.',
                        type: prev.type === 'error' ? 'error' : 'info'
                    }));
                } else {
                    throw new Error(`Failed to load plain markdown: ${response.statusText}`);
                }
            } else {
                const mdContent = await response.text();
                setEditorContent(mdContent);
                const opts = parseMarkmapFromMd(mdContent);
                setCurrentInitialExpandLevel(typeof opts.initialExpandLevel === 'number' ? opts.initialExpandLevel : 2);
                setIsWrapped(Boolean(opts.maxWidth && opts.maxWidth > 0));
                setStatus(prev => ({
                    message: prev.type === 'success' || prev.type === 'error' ? prev.message : 'Loaded mindmap content into editor.',
                    type: prev.type === 'success' || prev.type === 'error' ? prev.type : 'success'
                }));
            }
        } catch (err) {
            console.error('Failed to load editor content:', err);
            setStatus({ message: `Failed to load mindmap content for editor: ${err.message}`, type: 'error' });
            setEditorContent('');
        } finally {
            setIsEditorLoading(false);
        }
    };

    // --- Generate mindmap via backend ---
    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!bookName.trim() || !authorName.trim()) {
            setStatus({ message: 'Please enter both Book Name and Author Name.', type: 'error' });
            return;
        }
        if (!selectedModel) {
            setStatus({ message: `Please select a model for the ${selectedProvider} provider.`, type: 'error' });
            return;
        }
        setIsLoading(true);
        setStatus({ message: `Generating mindmap using ${selectedProvider} (${selectedModel})... Please wait.`, type: 'info' });
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookName,
                    authorName,
                    provider: selectedProvider,
                    model: selectedModel,
                    conciseness: selectedConciseness,
                    wordCount: wordCount,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }
            setStatus({ message: 'Mindmap generated! Loading editor and refreshing view...', type: 'success' });
            await handleLoadEditor();
            setMindmapKey(Date.now());
            setStatus({ message: data.message || `Mindmap generated with ${selectedProvider} (${selectedModel})! View updated.`, type: 'success' });
        } catch (err) {
            console.error('Generation failed:', err);
            setStatus({ message: `Generation failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // --- Save editor content (debounced) ---
    const saveEditorContent = React.useCallback(async (contentToSave) => {
        if (!contentToSave.trim()) {
            setStatus({ message: 'Editor is empty. Nothing to save.', type: 'info' });
            return;
        }
        setStatus({ message: 'Saving editor content and regenerating mindmap...', type: 'info' });
        try {
            const response = await fetch('/save-md', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mdContent: contentToSave }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || `Server error: ${response.statusText}`);
            }
            setStatus({ message: 'Saved & re-converted successfully! Refreshing view...', type: 'success' });
            setMindmapKey(Date.now());
            // Mark that the latest change is persisted (not a pending user edit)
            userEditRef.current = false;
            setStatus({ message: data.message || 'Editor content saved & mindmap view updated!', type: 'success' });
        } catch (err) {
            console.error('Save failed:', err);
            setStatus({ message: `Save failed: ${err.message}`, type: 'error' });
        }
    }, []);

    // --- Effects ---
    React.useEffect(() => {
        handleLoadEditor();
        setMindmapKey(Date.now());
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    React.useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        // Only auto-save when the change was user-initiated
        if (!userEditRef.current) {
            return () => {
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            };
        }
        if (editorContent.trim() !== '') {
            saveTimeoutRef.current = setTimeout(() => {
                saveEditorContent(editorContent);
                // After an auto-save, clear the user-edit flag
                userEditRef.current = false;
            }, 1000);
        }
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [editorContent, saveEditorContent]);

    React.useEffect(() => {
        if (llmOptions[selectedProvider] && llmOptions[selectedProvider].length > 0) {
            if (!llmOptions[selectedProvider].includes(selectedModel)) {
                setSelectedModel(llmOptions[selectedProvider][0]);
            }
        } else {
            setSelectedModel('');
        }
    }, [selectedProvider, selectedModel]);

    // --- Render ---
    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
            {/* Left Panel */}
            <div style={{ width: '40%', minWidth: '450px', padding: '20px', borderRight: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <h1 style={{ flexShrink: 0 }}>Mindmap Generator & Editor</h1>

                <form onSubmit={handleGenerate} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #eee', borderRadius: '5px', backgroundColor: '#f9f9f9', flexShrink: 0 }}>
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="providerSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>LLM Provider:</label>
                        <select id="providerSelect" value={selectedProvider} onChange={handleProviderChange} disabled={isLoading} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}>
                            {Object.keys(llmOptions).map(provider => (<option key={provider} value={provider}>{provider}</option>))}
                        </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="modelSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Model:</label>
                        <select id="modelSelect" value={selectedModel} onChange={handleModelChange} disabled={isLoading || !llmOptions[selectedProvider] || llmOptions[selectedProvider].length === 0} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}>
                            {llmOptions[selectedProvider] && llmOptions[selectedProvider].length > 0 ? llmOptions[selectedProvider].map(model => (<option key={model} value={model}>{model}</option>)) : (<option value="" disabled>No models available</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="concisenessSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Summary Style:</label>
                        <select id="concisenessSelect" value={selectedConciseness} onChange={handleConcisenessChange} disabled={isLoading} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}>
                            <option value="concise">Concise</option>
                            <option value="balanced">Balanced</option>
                            <option value="comprehensive">Comprehensive</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="wordCountInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Target Word Count (Optional):</label>
                        <input type="number" id="wordCountInput" name="wordCount" placeholder="e.g., 4000 (default: model limit)" value={wordCount} onChange={handleWordCountChange} disabled={isLoading} min="100" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }} />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="bookNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Book Name:</label>
                        <input type="text" id="bookNameInput" name="bookName" placeholder="e.g., Atomic Habits" value={bookName} onChange={(e) => setBookName(e.target.value)} disabled={isLoading} required style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }} />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="authorNameInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Author Name:</label>
                        <input type="text" id="authorNameInput" name="authorName" placeholder="e.g., James Clear" value={authorName} onChange={(e) => setAuthorName(e.target.value)} disabled={isLoading} required style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }} />
                    </div>

                    <button type="submit" disabled={isLoading || !bookName.trim() || !authorName.trim() || !selectedModel} style={{ padding: '10px 15px', cursor: (isLoading || !bookName.trim() || !authorName.trim() || !selectedModel) ? 'not-allowed' : 'pointer', backgroundColor: isLoading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem' }}>
                        {isLoading ? 'Generating...' : 'Generate Mindmap'}
                    </button>
                </form>

                {status.message && (
                    <div style={{ padding: '12px', marginBottom: '15px', borderRadius: '4px', border: '1px solid', flexShrink: 0, borderColor: status.type === 'error' ? '#f5c6cb' : (status.type === 'success' ? '#c3e6cb' : '#bee5eb'), backgroundColor: status.type === 'error' ? '#f8d7da' : (status.type === 'success' ? '#d4edda' : '#d1ecf1'), color: status.type === 'error' ? '#721c24' : (status.type === 'success' ? '#155724' : '#0c5460') }} className={`status-message ${status.type}`}>
                        {status.message}
                    </div>
                )}

                <hr style={{ margin: '20px 0', flexShrink: 0 }} />

                <div className="edit-section" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    <h2 style={{ flexShrink: 0, marginBottom: '10px' }}>Edit Mindmap Markdown (Plain Text)</h2>
                    <div style={{ flexGrow: 1, display: 'flex' }}>
                        <textarea
                            id="md-editor"
                            value={editorContent}
                            onChange={(e) => { userEditRef.current = true; setEditorContent(e.target.value); }}
                            placeholder="Edit PLAIN Markdown content here... (Changes will auto-save and update the mindmap)"
                            disabled={isEditorLoading}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box', padding: '10px',
                                fontFamily: 'monospace', fontSize: '0.9em',
                                border: '1px solid #ccc', borderRadius: '4px',
                                flexGrow: 1,
                                resize: 'none'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div style={{ width: '60%', height: '100vh', overflow: 'hidden', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={handleExpandAll}>Expand All</button>
                    <button type="button" onClick={handleCollapseToLevel2}>Collapse to Lvl 2</button>
                    <button type="button" onClick={() => handleAdjustLevel(-1)}>-</button>
                    <button type="button" onClick={() => handleAdjustLevel(1)}>+</button>
                    <button type="button" onClick={handleToggleWrap}>{isWrapped ? 'Disable Wrap' : 'Wrap Long Text'}</button>
                    <button type="button" onClick={handleDownloadInteractive}>Download Interactive HTML</button>
                    <div style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#555' }}>
                        {`Expand Level: ${currentInitialExpandLevel === -1 ? '-1 (all)' : currentInitialExpandLevel}`}
                    </div>
                </div>

                <div style={{ flex: 1 }}>
                    <iframe key={mindmapKey} src={`/mindmap.html?v=${mindmapKey}`} title="Interactive Mindmap Preview" style={{ width: '100%', height: '100%', border: 'none' }}>
                        Your browser doesn't support iframes. The mindmap cannot be displayed here.
                    </iframe>
                </div>
            </div>
        </div>
    );
};

// --- Mount the App ---
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);