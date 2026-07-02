import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Files, Eye, EyeOff, RefreshCw, X, ExternalLink } from 'lucide-react';
import { connectWs, getHistory, getProjectFiles } from '../lib/api.js';

export default function ProjectPage() {
  const { id }                          = useParams();
  const { state }                       = useLocation();
  const project                         = state?.project;
  const nav                             = useNavigate();

  const [messages, setMsgs]             = useState([]);
  const [stream, setStream]             = useState('');
  const [prompt, setPrompt]             = useState('');
  const [files, setFiles]               = useState([]);
  const [running, setRunning]           = useState(false);
  const [error, setError]               = useState('');
  const [preview, setPreview]           = useState(false);
  const [previewKey, setPreviewKey]     = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent]   = useState('');
  const [viewerOpen, setViewerOpen]     = useState(false);
  const [loadingFile, setLoadingFile]   = useState(false);

  const wsRef     = useRef(null);
  const bottomRef = useRef(null);
  const streamRef = useRef('');

  // Strip /workspace/ prefix for clean display
  const trimPath = (p) => p.replace(/^\/workspace\//, '');

  const previewUrl = `/api/projects/${id}/preview/index.html`;

  useEffect(() => {
  let cancelled = false;

  getHistory(id).then(h => { if (!cancelled) setMsgs(h); }).catch(console.error);
  getProjectFiles(id).then(f => { if (!cancelled) setFiles(f.files || []); }).catch(console.error);

  // Guard: only connect once
  if (wsRef.current) return;

  connectWs((msg) => {
    if (msg.type === 'stream_chunk') {
      streamRef.current += msg.chunk;
      setStream(s => s + msg.chunk);
    }
    if (msg.type === 'stream_end') {
      setRunning(false);
      const finalMsg = streamRef.current;
      setMsgs(prev => [...prev, { role: 'assistant', message: finalMsg }]);
      streamRef.current = '';
      setStream('');
      // Refresh files once, then refresh preview once
      getProjectFiles(id).then(f => {
        setFiles(f.files || []);
      }).then(() => {
        setPreviewKey(k => k + 1); // only bump ONCE after files load
      });
    }
    if (msg.type === 'error') {
      setRunning(false);
      setStream('');
      streamRef.current = '';
      setError(msg.message || 'Something went wrong.');
    }
  }).then(ws => {
    if (cancelled) { ws.close(); return; }
    wsRef.current = ws;
  }).catch(console.error);

  return () => {
    cancelled = true;
    wsRef.current?.close();
    wsRef.current = null;
  };
}, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stream]);

  function sendPrompt() {
    if (!prompt.trim() || running || !wsRef.current) return;
    setError('');
    wsRef.current.send(JSON.stringify({
      type: 'run_prompt',
      projectId: id,
      containerId: project?.container_id,
      prompt,
    }));
    setMsgs(prev => [...prev, { role: 'user', message: prompt }]);
    setPrompt('');
    setRunning(true);
    setStream('');
    streamRef.current = '';
  }

  // Click a file → show its content in the viewer panel
  async function openFile(rawPath) {
    const path = trimPath(rawPath);
    setSelectedFile(path);
    setViewerOpen(true);
    setPreview(false);
    setLoadingFile(true);
    setFileContent('');
    try {
      const res = await fetch(`/api/projects/${id}/preview/${path}`);
      const text = await res.text();
      setFileContent(text);
    } catch (e) {
      setFileContent(`// Error loading file: ${e.message}`);
    } finally {
      setLoadingFile(false);
    }
  }

  const hasHtml = files.some(f => trimPath(f).endsWith('.html'));

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f0f', color: '#fff' }}>

      {/* ── Left: File Panel ── */}
      <div style={{ width: 220, borderRight: '1px solid #222', padding: '1rem',
        overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <button onClick={() => nav('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
            border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, marginBottom: 20,
            padding: 0 }}>
          <ArrowLeft size={14} /> Dashboard
        </button>

        <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Files size={11} /> Files
        </p>

        {files.length === 0
          ? <p style={{ fontSize: 12, color: '#444' }}>No files yet — ask AI to build something!</p>
          : files.map((f, i) => {
              const name = trimPath(f);
              const isActive = selectedFile === name && viewerOpen;
              return (
                <button key={i} onClick={() => openFile(f)}
                  style={{ display: 'block', width: '100%', textAlign: 'left',
                    background: isActive ? '#1e1e2e' : 'transparent',
                    border: `1px solid ${isActive ? '#7c3aed' : 'transparent'}`,
                    borderRadius: 6, padding: '5px 8px', marginBottom: 3,
                    fontSize: 11, color: isActive ? '#c4b5fd' : '#7dd3fc',
                    fontFamily: 'monospace', cursor: 'pointer', wordBreak: 'break-all' }}>
                  {name}
                </button>
              );
            })}

        {/* Live Preview button */}
        {hasHtml && (
          <>
            <button onClick={() => { setPreview(p => !p); setViewerOpen(false); setSelectedFile(null); }}
              style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
                background: preview ? '#7c3aed' : '#1a1a1a', border: '1px solid #333',
                color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                fontSize: 12, width: '100%' }}>
              {preview ? <EyeOff size={13} /> : <Eye size={13} />}
              {preview ? 'Hide Preview' : 'Live Preview'}
            </button>

            {preview && (
              <button onClick={() => setPreviewKey(k => k + 1)}
                style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                  background: '#111', border: '1px solid #2a2a2a', color: '#666',
                  borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                  fontSize: 12, width: '100%' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Right: Main Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #222', fontSize: 14,
          fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0 }}>
          <span>{project?.project_name || 'Project'}</span>
          {preview && (
            <a href={previewUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: '#7dd3fc', textDecoration: 'none' }}>
              <ExternalLink size={11} /> Open in new tab
            </a>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Chat ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: 16 }}>

            {messages.length === 0 && !stream && (
              <div style={{ color: '#444', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
                <p>👋 Start by describing what you want to build.</p>
                <p style={{ marginTop: 8, fontSize: 12 }}>
                  Try: "Create a todo app with vanilla JS and save it as index.html"
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%' }}>
                <div style={{ background: m.role === 'user' ? '#4c1d95' : '#1a1a1a',
                  border: m.role === 'assistant' ? '1px solid #2a2a2a' : 'none',
                  borderRadius: 10, padding: '10px 14px', fontSize: 13,
                  fontFamily: m.role === 'assistant' ? 'monospace' : 'inherit',
                  whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {m.message}
                </div>
              </div>
            ))}

            {stream && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '80%', background: '#111',
                border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 14px',
                fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                lineHeight: 1.6, color: '#4ade80' }}>
                {stream}<span style={{ opacity: 0.5 }}>█</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── File Viewer Panel (Phase 5) ── */}
          {viewerOpen && selectedFile && (
            <div style={{ width: '45%', borderLeft: '1px solid #222',
              display: 'flex', flexDirection: 'column', background: '#0d0d0d', flexShrink: 0 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #222',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: '#7dd3fc', fontFamily: 'monospace' }}>
                  {selectedFile}
                </span>
                <button onClick={() => { setViewerOpen(false); setSelectedFile(null); }}
                  style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>
              <pre style={{ flex: 1, overflowY: 'auto', margin: 0, padding: '1rem',
                fontSize: 12, lineHeight: 1.7, fontFamily: 'monospace',
                color: loadingFile ? '#555' : '#d4d4d4',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {loadingFile ? 'Loading…' : fileContent}
              </pre>
            </div>
          )}

          {/* ── Live Preview iframe (Phase 4) ── */}
          {preview && !viewerOpen && (
            <div style={{ width: '45%', borderLeft: '1px solid #222',
              display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #222',
                fontSize: 11, color: '#555', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span>Live Preview</span>
                <span style={{ color: '#22c55e', fontSize: 10 }}>● live</span>
              </div>
              <iframe
                key={previewKey}
                src={previewUrl}
                style={{ flex: 1, border: 'none', background: '#fff' }}
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              />
            </div>
          )}
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{ margin: '0 1rem', padding: '10px 14px', background: '#2a0a0a',
            border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12, color: '#fca5a5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0 }}>
            ⚠️ {error}
            <button onClick={() => setError('')}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── Input ── */}
        <div style={{ padding: '1rem', borderTop: '1px solid #222',
          display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea rows={3}
            placeholder={running ? 'AI is building…' : 'Describe what you want to build… (Enter to send, Shift+Enter for newline)'}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={running}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }}
            style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', borderRadius: 10,
              color: running ? '#666' : '#fff', fontSize: 13, padding: '10px 12px',
              resize: 'none', fontFamily: 'inherit' }} />
          <button onClick={sendPrompt} disabled={running || !prompt.trim()}
            style={{ padding: '10px 14px', background: running ? '#2a2a2a' : '#7c3aed',
              border: 'none', borderRadius: 10, cursor: running ? 'not-allowed' : 'pointer',
              color: '#fff', opacity: running ? 0.5 : 1, flexShrink: 0 }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
