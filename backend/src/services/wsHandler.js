const { runClaudeCode } = require('./openrouter');
const { supabase }      = require('../middleware/auth');

function send(ws, type, payload) {
  if (ws.readyState === 1)
    ws.send(JSON.stringify({ type, ...payload }));
}

async function handleWsConnection(ws, req) {
  const url   = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    send(ws, 'error', { message: 'Unauthorised' });
    return ws.close();
  }

  const userId = data.user.id;
  send(ws, 'connected', { userId });
  console.log('WS connected for user:', userId);

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'run_prompt') {
      const { projectId, containerId, prompt } = msg;

      console.log('=== run_prompt received ===');
      console.log('projectId:', projectId);
      console.log('containerId:', containerId?.slice(0,12));
      console.log('prompt:', prompt);

      if (!containerId) {
        return send(ws, 'error', { message: 'No container ID — delete and recreate the project.' });
      }

      const { data: proj } = await supabase
        .from('projects').select('id')
        .eq('id', projectId).eq('user_id', userId).single();

      if (!proj) {
        return send(ws, 'error', { message: 'Project not found.' });
      }

      let fullResponse = '';
      send(ws, 'stream_start', { projectId });

     try {
        await runClaudeCode(containerId, prompt, (stream, chunk) => {
          fullResponse += chunk;
          send(ws, 'stream_chunk', { stream, chunk });
        });

        // 1. Success path completes stream cleanly
        send(ws, 'stream_end', { projectId });

        await supabase.from('chat_sessions').insert([
          { project_id: projectId, role: 'user',      message: prompt },
          { project_id: projectId, role: 'assistant', message: fullResponse },
        ]);

      } catch (err) {
        console.error('Claude Code error:', err.message);
        
        // 2. CRITICAL FIX: Tell frontend to stop the spinner/running state
        send(ws, 'stream_end', { projectId }); 
        
        // 3. Send the actual descriptive error payload
        send(ws, 'error', { 
          message: err.message || 'An error occurred while generating or saving code files.' 
        });
      }
    }
  });

  ws.on('close', () => console.log('WS closed for user:', userId));
}

module.exports = { handleWsConnection };
