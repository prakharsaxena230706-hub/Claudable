require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const { WebSocketServer } = require('ws');
const { randomUUID: uuidv4 } = require('crypto');

const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/debug', (_, res) => {
  const fs = require('fs');
  const dockerService = require('./services/docker');
  res.json({
    dockerAvailable: dockerService.isDockerAvailable(),
    platform: process.platform,
    dockerSockExists: fs.existsSync('/var/run/docker.sock'),
    time: new Date().toISOString()
  });
});

const { authMiddleware, supabase }                             = require('./middleware/auth');
const { createWorkspace, listWorkspaceFiles, removeWorkspace,
        execInContainer, ensureContainerRunning }              = require('./services/docker');

app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  try {
    const { project_name, description } = req.body;
    if (!project_name) return res.status(400).json({ error: 'project_name required' });
    const projectId   = uuidv4();
    const containerId = await createWorkspace(projectId);
    const { data, error } = await supabase.from('projects').insert([{
      id: projectId, user_id: req.user.id,
      project_name, description: description || '',
      container_id: containerId, status: 'idle',
    }]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:id/files', authMiddleware, async (req, res) => {
  try {
    const { data: proj } = await supabase.from('projects').select('container_id')
      .eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!proj) return res.status(404).json({ error: 'Not found' });
    const files = await listWorkspaceFiles(proj.container_id);
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const { data: proj } = await supabase.from('projects').select('container_id')
      .eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!proj) return res.status(404).json({ error: 'Not found' });
    if (proj.container_id) await removeWorkspace(proj.container_id);
    await supabase.from('projects').delete().eq('id', req.params.id);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Change the route definition to a regular expression
// Replace your preview route with this improved version
app.get(/^\/api\/projects\/([^\/]+)\/preview\/(.*)/, async (req, res) => {
  try {
    const projectId   = req.params[0];
    const rawFilepath = req.params[1] || 'index.html';
    const filename    = rawFilepath.replace(/\.\./g, '').replace(/^\/+/, '') || 'index.html';

    const { data: proj } = await supabase
      .from('projects')
      .select('container_id')
      .eq('id', projectId)
      .single();

    if (!proj) return res.status(404).send('Project not found');

    const [realContainerId, projId] = proj.container_id.split(':');
    const targetContainerId = realContainerId || proj.container_id;

    if (targetContainerId && targetContainerId !== 'local-fs') {
      await ensureContainerRunning(targetContainerId);
    }

    if (targetContainerId === 'local-fs') {
      const path = require('path');
      const fs = require('fs');
      const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(__dirname, '..', 'data', 'projects');
      const absolutePath = path.join(PROJECTS_DIR, projId, filename);

      try {
        await fs.promises.access(absolutePath);
      } catch (e) {
        console.log(`[LocalFS] Preview file ${filename} not found. Running self-healing file restoration...`);
        await listWorkspaceFiles(proj.container_id);

        try {
          await fs.promises.access(absolutePath);
        } catch (e2) {
          return res.status(404).send(`
            <html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#888">
              <h3>No preview yet</h3>
              <p>File <code>${filename}</code> hasn't been generated. Ask the AI to create it!</p>
            </body></html>
          `);
        }
      }

      const content = await fs.promises.readFile(absolutePath);
      const ext  = filename.split('.').pop().toLowerCase();
      const mime = {
        html: 'text/html', css: 'text/css',
        js:   'application/javascript', json: 'application/json',
        png:  'image/png', jpg: 'image/jpeg',
        svg:  'image/svg+xml', txt: 'text/plain',
      }[ext] || 'text/plain';

      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      return res.send(content);
    }

    const Docker = require('dockerode');
    const docker = new Docker({
      socketPath: process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock'
    });

    const finalPath = projId ? `/workspace/${projId}/${filename}` : `/workspace/${filename}`;

    // First check the file exists
    const checkExec = await docker.getContainer(targetContainerId).exec({
      Cmd: ['test', '-f', finalPath],
      AttachStdout: true,
      AttachStderr: true,
    });
    const checkStream = await checkExec.start({ hijack: true });
    const checkInfo   = await new Promise(resolve => {
      checkStream.on('end', async () => {
        const info = await checkExec.inspect();
        resolve(info);
      });
    });

    if (checkInfo.ExitCode !== 0) {
      // Self-heal: attempt to restore files from database chat sessions, then re-check
      console.log(`Preview file ${filename} not found. Running self-healing file restoration...`);
      await listWorkspaceFiles(proj.container_id);

      const checkExec2 = await docker.getContainer(targetContainerId).exec({
        Cmd: ['test', '-f', finalPath],
        AttachStdout: true,
        AttachStderr: true,
      });
      const checkStream2 = await checkExec2.start({ hijack: true });
      const checkInfo2   = await new Promise(resolve => {
        checkStream2.on('end', async () => {
          const info = await checkExec2.inspect();
          resolve(info);
        });
      });

      if (checkInfo2.ExitCode !== 0) {
        return res.status(404).send(`
          <html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#888">
            <h3>No preview yet</h3>
            <p>File <code>${filename}</code> hasn't been generated. Ask the AI to create it!</p>
          </body></html>
        `);
      }
    }

    // Read the file
    const exec = await docker.getContainer(targetContainerId).exec({
      Cmd: ['cat', finalPath],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true });
    let content  = Buffer.alloc(0);

    await new Promise((resolve, reject) => {
      docker.modem.demuxStream(
        stream,
        { write: (chunk) => { content = Buffer.concat([content, chunk]); } },
        { write: () => {} }
      );
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const ext  = filename.split('.').pop().toLowerCase();
    const mime = {
      html: 'text/html', css: 'text/css',
      js:   'application/javascript', json: 'application/json',
      png:  'image/png', jpg: 'image/jpeg',
      svg:  'image/svg+xml', txt: 'text/plain',
    }[ext] || 'text/plain';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(content);

  } catch (e) {
    console.error('Preview error:', e.message);
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#f87">
        <h3>Preview Error</h3><pre>${e.message}</pre>
      </body></html>
    `);
  }
});

app.get('/api/sessions/:projectId', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('chat_sessions').select('*')
      .eq('project_id', req.params.projectId).order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

try {
  const { handleWsConnection } = require('./services/wsHandler');
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', handleWsConnection);
  console.log('✓ WebSocket ready');
} catch (err) {
  console.error('✗ WebSocket failed:', err.message);
}

app.use((err, req, res, _next) => {
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✓ Backend running on http://localhost:${PORT}`));
