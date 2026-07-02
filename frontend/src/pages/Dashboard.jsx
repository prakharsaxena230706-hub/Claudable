import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderOpen, LogOut } from 'lucide-react';
import { getProjects, createProject, deleteProject } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const { signOut }             = useAuth();
  const nav                     = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setProjects(await getProjects());
    } catch (e) {
      console.error('Failed to load projects:', e);
      setError('Could not load projects. Is the backend running?');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const p = await createProject(name.trim(), desc.trim());
      setProjects(prev => [p, ...prev]);
      setName('');
      setDesc('');
      nav(`/project/${p.id}`, { state: { project: p } });
    } catch (err) {
      console.error('Create project error:', err);
      setError(err.message || 'Failed to create project. Is Docker running?');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this project and its container?')) return;
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete project.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Claudable</h1>
            <p style={{ fontSize: 13, color: '#555', margin: '4px 0 0' }}>AI-powered cloud workspace</p>
          </div>
          <button onClick={() => { signOut(); nav('/'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
              border: '1px solid #333', color: '#888', borderRadius: 8, padding: '6px 12px',
              cursor: 'pointer', fontSize: 13 }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: '#2a0a0a', border: '1px solid #7f1d1d', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            ⚠️ {error}
            <button onClick={() => setError('')}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate}
          style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
            padding: '1.25rem', marginBottom: 28 }}>
          <p style={{ fontSize: 13, color: '#aaa', marginBottom: 12, margin: '0 0 12px' }}>New project</p>
          <input placeholder="Project name" required value={name}
            onChange={e => setName(e.target.value)} style={inp} />
          <input placeholder="Description (optional)" value={desc}
            onChange={e => setDesc(e.target.value)} style={{ ...inp, marginTop: 8 }} />
          <button type="submit" disabled={creating || !name.trim()}
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
              background: creating ? '#4c1d95' : '#7c3aed', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', cursor: creating ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 500, opacity: creating ? 0.7 : 1 }}>
            <Plus size={14} /> {creating ? 'Creating workspace…' : 'Create project'}
          </button>
          {creating && (
            <p style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
              Starting Docker container — this may take 10–20 seconds…
            </p>
          )}
        </form>

        {/* Project list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map(p => (
            <div key={p.id}
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
                padding: '1rem 1.25rem', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{p.project_name}</p>
                <p style={{ color: '#555', fontSize: 12, margin: '4px 0 0' }}>
                  {p.description || 'No description'} · {p.status}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => nav(`/project/${p.id}`, { state: { project: p } })}
                  style={{ ...iconBtn, color: '#a78bfa', borderColor: '#4c1d95' }}>
                  <FolderOpen size={14} /> Open
                </button>
                <button onClick={() => handleDelete(p.id)}
                  style={{ ...iconBtn, color: '#f87171', borderColor: '#7f1d1d' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <p style={{ color: '#444', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
              No projects yet — create one above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const inp = {
  width: '100%', padding: '9px 12px', background: '#111', border: '1px solid #333',
  borderRadius: 8, color: '#fff', fontSize: 13, boxSizing: 'border-box',
};
const iconBtn = {
  display: 'flex', alignItems: 'center', gap: 5, background: 'transparent',
  border: '1px solid', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
};
