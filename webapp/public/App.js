// FILE: webapp/public/App.js
// React UI for Mindmap Generator & Editor - refined per user instructions

const App = () => {
    // --- State Variables ---
    const [bookName, setBookName] = React.useState('');
    const [authorName, setAuthorName] = React.useState('');
    const [editorContent, setEditorContent] = React.useState('');
    const [status, setStatus] = React.useState({ message: 'App loaded. Ready to generate or load existing mindmap.', type: 'info' });
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditorLoading, setIsEditorLoading] = React.useState(false);
    const [selectedConciseness, setSelectedConciseness] = React.useState('concise');
    const [wordCount, setWordCount] = React.useState('');
    const [mindmapKey, setMindmapKey] = React.useState(Date.now());
    const saveTimeoutRef = React.useRef(null);
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

    // --- Layout: left panel default ratio and collapse state ---
    const defaultLeftWidth = 35; // percent
    const [leftCollapsed, setLeftCollapsed] = React.useState(false);

    const containerRef = React.useRef(null);

    const toggleLeftCollapsed = () => {
        setLeftCollapsed(prev => !prev);
    };

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
        userEditRef.current = false;
        setEditorContent(newMd);
        if (opts.save) {
            await saveEditorContent(newMd);
        } else if (opts.refresh) {
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
        const newMax = curMax > 0 ? 0 : 600;
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
        if (!userEditRef.current) {
            return () => {
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            };
        }
        if (editorContent.trim() !== '') {
            saveTimeoutRef.current = setTimeout(() => {
                saveEditorContent(editorContent);
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
    const leftPanelStyle = {
        width: leftCollapsed ? 0 : `${defaultLeftWidth}%`,
        minWidth: leftCollapsed ? 0 : '240px',
        padding: leftCollapsed ? '0px' : '16px',
        borderRight: leftCollapsed ? 'none' : '1px solid #e6e9ee',
        overflow: 'hidden',
        display: leftCollapsed ? 'none' : 'flex',
        flexDirection: 'column',
        transition: 'width 220ms ease, padding 180ms ease, opacity 180ms ease',
        opacity: leftCollapsed ? 0 : 1,
    };

    return (
        <div ref={containerRef} className="app-root" style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', fontSize: '13px' }}>
            {/* Left Panel */}
            <div className="left-panel" style={leftPanelStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h1 style={{ margin: 0, fontSize: '1rem' }}>Mindmap</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button type="button" onClick={() => setLeftCollapsed(true)} style={{ padding: '6px 8px', background: 'transparent', border: '1px solid #e6eef5', borderRadius: '6px', fontSize: '0.85rem' }}>Hide</button>
                    </div>
                </div>

                <form onSubmit={handleGenerate} style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(15,23,42,0.04)', display: 'grid', gap: '8px', marginTop: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label htmlFor="providerSelect" style={{ fontSize: '0.78rem' }}>LLM Provider</label>
                            <select id="providerSelect" value={selectedProvider} onChange={handleProviderChange} disabled={isLoading} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.85rem' }}>
                                {Object.keys(llmOptions).map(provider => (<option key={provider} value={provider}>{provider}</option>))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="modelSelect" style={{ fontSize: '0.78rem' }}>Model</label>
                            <select id="modelSelect" value={selectedModel} onChange={handleModelChange} disabled={isLoading || !llmOptions[selectedProvider] || llmOptions[selectedProvider].length === 0} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.85rem' }}>
                                {llmOptions[selectedProvider] && llmOptions[selectedProvider].length > 0 ? llmOptions[selectedProvider].map(model => (<option key={model} value={model}>{model}</option>)) : (<option value="" disabled>No models available</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label htmlFor="concisenessSelect" style={{ fontSize: '0.78rem' }}>Summary</label>
                            <select id="concisenessSelect" value={selectedConciseness} onChange={handleConcisenessChange} disabled={isLoading} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.85rem' }}>
                                <option value="concise">Concise</option>
                                <option value="balanced">Balanced</option>
                                <option value="comprehensive">Comprehensive</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="wordCountInput" style={{ fontSize: '0.78rem' }}>Target Words</label>
                            <input type="number" id="wordCountInput" name="wordCount" placeholder="e.g., 4000" value={wordCount} onChange={handleWordCountChange} disabled={isLoading} min="100" style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.85rem' }} />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="bookNameInput" style={{ fontSize: '0.78rem' }}>Book Name</label>
                        <input type="text" id="bookNameInput" name="bookName" placeholder="e.g., Atomic Habits" value={bookName} onChange={(e) => setBookName(e.target.value)} disabled={isLoading} required style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.9rem' }} />
                    </div>

                    <div>
                        <label htmlFor="authorNameInput" style={{ fontSize: '0.78rem' }}>Author Name</label>
                        <input type="text" id="authorNameInput" name="authorName" placeholder="e.g., James Clear" value={authorName} onChange={(e) => setAuthorName(e.target.value)} disabled={isLoading} required style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.9rem' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                        <button type="submit" disabled={isLoading || !bookName.trim() || !authorName.trim() || !selectedModel} style={{ padding: '8px 10px', cursor: (isLoading || !bookName.trim() || !authorName.trim() || !selectedModel) ? 'not-allowed' : 'pointer', backgroundColor: isLoading ? '#94a3b8' : '#0ea5a4', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.9rem' }}>
                            {isLoading ? 'Generating...' : 'Generate'}
                        </button>
                        <button type="button" onClick={handleLoadEditor} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid #e6eef5', borderRadius: '6px', fontSize: '0.9rem' }}>{isEditorLoading ? 'Loading...' : 'Reload'}</button>
                        <button type="button" onClick={handleDownloadInteractive} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid #e6eef5', borderRadius: '6px', fontSize: '0.9rem' }}>Download</button>
                    </div>
                </form>

                {status.message && !leftCollapsed && (
                    <div className={`status-message ${status.type}`} style={{ padding: '8px', borderRadius: '6px', border: '1px solid', borderColor: status.type === 'error' ? '#f5c6cb' : (status.type === 'success' ? '#c3e6cb' : '#bee5eb'), backgroundColor: status.type === 'error' ? '#fff1f2' : (status.type === 'success' ? '#ecfdf5' : '#f0f9ff'), color: status.type === 'error' ? '#721c24' : (status.type === 'success' ? '#065f46' : '#0c5460'), marginTop: '8px' }}>
                        {status.message}
                    </div>
                )}

                <div className="edit-section" style={{ flexGrow: 1, display: leftCollapsed ? 'none' : 'flex', flexDirection: 'column', marginTop: '8px' }}>
                    <h2 style={{ margin: '6px 0', fontSize: '0.95rem' }}>Markdown</h2>
                    <textarea
                        id="md-editor"
                        value={editorContent}
                        onChange={(e) => { userEditRef.current = true; setEditorContent(e.target.value); }}
                        placeholder="Edit PLAIN Markdown content here... (Changes will auto-save and update the mindmap)"
                        disabled={isEditorLoading}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box', padding: '8px',
                            fontFamily: 'monospace', fontSize: '0.82rem',
                            border: '1px solid #e6eef5', borderRadius: '6px',
                            flexGrow: 1,
                            resize: 'vertical',
                            minHeight: '120px'
                        }}
                    />
                </div>
            </div>

            {/* Divider (visual only) */}
            <div className="divider" style={{ width: leftCollapsed ? 0 : '10px', transition: 'width 180ms ease, opacity 180ms ease', opacity: leftCollapsed ? 0 : 1 }} />

            {/* Right Panel */}
            <div className="right-panel" style={{ flex: 1, height: '100vh', overflow: 'hidden', position: 'relative', background: '#fff' }}>
                <div className="toolbar-overlay" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '28px', zIndex: 50, padding: '8px 12px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', boxShadow: '0 6px 20px rgba(15,23,42,0.08)', display: 'flex', gap: '8px', alignItems: 'center', border: '1px solid rgba(15,23,42,0.05)' }}>
                    <button type="button" onClick={handleExpandAll} title="Expand all" style={{ padding: '6px 8px', background: 'transparent', border: '1px solid rgba(15,23,42,0.06)', borderRadius: '8px' }}>Expand</button>
                    <button type="button" onClick={handleCollapseToLevel2} title="Collapse to level 2" style={{ padding: '6px 8px', background: 'transparent', border: '1px solid rgba(15,23,42,0.06)', borderRadius: '8px' }}>Collapse</button>
                    <button type="button" onClick={() => handleAdjustLevel(-1)} title="Decrease level" style={{ padding: '6px 8px', background: 'transparent', border: '1px solid rgba(15,23,42,0.06)', borderRadius: '8px' }}>-</button>
                    <button type="button" onClick={() => handleAdjustLevel(1)} title="Increase level" style={{ padding: '6px 8px', background: 'transparent', border: '1px solid rgba(15,23,42,0.06)', borderRadius: '8px' }}>+</button>
                    <button type="button" onClick={handleToggleWrap} title="Toggle wrap" style={{ padding: '6px 8px', background: 'transparent', border: '1px solid rgba(15,23,42,0.06)', borderRadius: '8px' }}>{isWrapped ? 'Disable Wrap' : 'Wrap'}</button>
                    <div style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#555' }}>
                        {`Level: ${currentInitialExpandLevel === -1 ? '-1 (all)' : currentInitialExpandLevel}`}
                    </div>
                </div>

                {/* Expand handle visible when left panel is collapsed */}
                {leftCollapsed && (
                    <div className="expand-handle" onClick={() => setLeftCollapsed(false)} style={{ position: 'absolute', left: 0, top: 24, zIndex: 80, width: '20px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0ea5a4', color: 'white', borderTopRightRadius: '8px', borderBottomRightRadius: '8px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.12)' }}>
                        <div style={{ transform: 'translateX(1px)', fontSize: '18px', lineHeight: 1 }}>›</div>
                    </div>
                )}

                <div style={{ position: 'absolute', inset: 0 }}>
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