const express = require('express');
const router = express.Router();
const { supabase } = require('../middleware/auth');

// GET /:id/preview/*path  — serve workspace files from container
router.get('/:id/preview/*path', async (req, res, next) => {
  try {
    const filePath = Array.isArray(req.params.path)
      ? req.params.path.join('/')
      : (req.params.path || req.params[0] || 'index.html');

    const { data: proj, error } = await supabase
      .from('projects')
      .select('container_id')
      .eq('id', req.params.id)
      .single();

    if (error || !proj) return res.status(404).json({ error: 'Project not found' });

    const Docker = require('dockerode');
    const docker = new Docker({
      socketPath: process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock',
    });
    const container = docker.getContainer(proj.container_id);

    // Read the file from inside the container
    const exec = await container.exec({
      Cmd: ['cat', `/workspace/${filePath}`],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true });
    let fileContent = Buffer.alloc(0);

    stream.on('data', (chunk) => {
      // Docker multiplexed stream: first 8 bytes are header
      const payload = chunk.length > 8 ? chunk.slice(8) : chunk;
      fileContent = Buffer.concat([fileContent, payload]);
    });

    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // Detect mime type from extension
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
      html: 'text/html',
      css:  'text/css',
      js:   'application/javascript',
      json: 'application/json',
      png:  'image/png',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      svg:  'image/svg+xml',
      ico:  'image/x-icon',
      txt:  'text/plain',
    };

    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // allow iframe
    res.send(fileContent);

  } catch (err) {
    next(err);
  }
});

module.exports = router;
