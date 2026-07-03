import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '';
const WS   = import.meta.env.VITE_WS_URL  || '';
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getProjects() {
  const res = await fetch(`${BASE}/api/projects`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProject(project_name, description) {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ project_name, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE}/api/projects/${id}`, {
    method: 'DELETE', headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProjectFiles(id) {
  const res = await fetch(`${BASE}/api/projects/${id}/files`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getHistory(projectId) {
  const res = await fetch(`${BASE}/api/sessions/${projectId}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function connectWs(onMessage) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const ws = new WebSocket(`${WS}/ws?token=${token}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror   = (e) => console.error('WS error', e);
  return ws;
}
