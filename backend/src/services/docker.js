const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { exec: cpExec } = require('child_process');

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(__dirname, '..', '..', 'data', 'projects');

const docker = new Docker({
  socketPath: process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock'
});

const IMAGE = process.env.WORKSPACE_IMAGE || 'node:20-slim';
const SHARED_CONTAINER_NAME = 'claudable-shared-workspace';

let dockerAvailable = process.platform === 'win32'
  ? true
  : fs.existsSync('/var/run/docker.sock');

async function initDocker() {
  try {
    await docker.ping();
    dockerAvailable = true;
    console.log('✓ Docker daemon is reachable');
  } catch (err) {
    dockerAvailable = false;
    console.warn('⚠️ Docker daemon is unreachable. Falling back to local filesystem workspace mode.');
  }
}
initDocker();

async function createWorkspace(projectId) {
  if (!dockerAvailable) {
    console.log(`[LocalFS] Creating workspace directory for project ${projectId}`);
    const localDir = path.resolve(PROJECTS_DIR, projectId);
    await fs.promises.mkdir(localDir, { recursive: true });
    return `local-fs:${projectId}`;
  }
  try {
    const container = docker.getContainer(SHARED_CONTAINER_NAME);
    const info = await container.inspect();
    if (!info.State.Running) {
      console.log(`Starting stopped shared container: ${SHARED_CONTAINER_NAME}`);
      await container.start();
    }
  } catch (err) {
    console.log(`Creating shared workspace container: ${SHARED_CONTAINER_NAME} using image ${IMAGE}`);
    try {
      const container = await docker.createContainer({
        Image: IMAGE,
        name: SHARED_CONTAINER_NAME,
        Env: [`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`],
        WorkingDir: '/workspace',
        Tty: false,
        OpenStdin: false,
        Cmd: ['tail', '-f', '/dev/null'],
        HostConfig: {
          AutoRemove: false,
          Memory: 512 * 1024 * 1024,
          NanoCpus: 1e9,
        },
      });
      await container.start();
      console.log('Shared container started:', container.id.slice(0, 12));
    } catch (createErr) {
      console.error('Failed to create/start shared container:', createErr.message);
      throw createErr;
    }
  }
  
  return `${SHARED_CONTAINER_NAME}:${projectId}`;
}

async function ensureContainerRunning(containerId) {
  const [realContainerId] = containerId.split(':');
  const targetContainerId = realContainerId || containerId;
  if (targetContainerId === 'local-fs') {
    return true;
  }
  try {
    const container = docker.getContainer(targetContainerId);
    const info = await container.inspect();
    if (!info.State.Running) {
      console.log(`Starting stopped container: ${targetContainerId}`);
      await container.start();
    }
    return true;
  } catch (err) {
    console.error(`ensureContainerRunning failed for ${targetContainerId}:`, err.message);
    if (targetContainerId === SHARED_CONTAINER_NAME) {
      console.log(`Attempting to recreate missing shared container: ${SHARED_CONTAINER_NAME}`);
      try {
        const container = await docker.createContainer({
          Image: IMAGE,
          name: SHARED_CONTAINER_NAME,
          Env: [`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`],
          WorkingDir: '/workspace',
          Tty: false,
          OpenStdin: false,
          Cmd: ['tail', '-f', '/dev/null'],
          HostConfig: {
            AutoRemove: false,
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1e9,
          },
        });
        await container.start();
        console.log('Shared container recreated and started:', container.id.slice(0, 12));
        return true;
      } catch (createErr) {
        console.error('Failed to recreate shared container:', createErr.message);
        return false;
      }
    }
    return false;
  }
}

async function execInContainer(containerId, cmd) {
  const [realContainerId, projectId] = containerId.split(':');
  const targetContainerId = realContainerId || containerId;

  if (targetContainerId === 'local-fs' || !dockerAvailable) {
    const targetProjectId = projectId || containerId.replace('local-fs:', '');
    const workingDir = path.resolve(PROJECTS_DIR, targetProjectId);
    await fs.promises.mkdir(workingDir, { recursive: true });

    const program = cmd[0];

    if (program === 'mkdir') {
      const dirPath = cmd[cmd.length - 1];
      const relative = dirPath.replace(/^\/workspace\/[^/]+/, '').replace(/^\/workspace/, '');
      const absolute = path.join(workingDir, relative);
      await fs.promises.mkdir(absolute, { recursive: true });
      return '';
    }

    if (program === 'find') {
      const getFiles = async (dir) => {
        let results = [];
        const list = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const file of list) {
          const resPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            if (file.name !== '.git' && file.name !== 'node_modules') {
              results = results.concat(await getFiles(resPath));
            }
          } else {
            if (file.name !== '.gitkeep') {
              results.push(resPath);
            }
          }
        }
        return results;
      };
      try {
        const absoluteFiles = await getFiles(workingDir);
        const virtualFiles = absoluteFiles.map(f => {
          const relative = path.relative(workingDir, f).replace(/\\/g, '/');
          return `/workspace/${targetProjectId}/${relative}`;
        });
        return virtualFiles.join('\n');
      } catch (err) {
        return '';
      }
    }

    if (program === 'cat') {
      const virtualPath = cmd[1];
      const relative = virtualPath.replace(/^\/workspace\/[^/]+/, '').replace(/^\/workspace/, '');
      const absolute = path.join(workingDir, relative);
      return fs.promises.readFile(absolute, 'utf8');
    }

    if (program === 'test') {
      const virtualPath = cmd[cmd.length - 1];
      const relative = virtualPath.replace(/^\/workspace\/[^/]+/, '').replace(/^\/workspace/, '');
      const absolute = path.join(workingDir, relative);
      try {
        const stat = await fs.promises.stat(absolute);
        if (stat.isFile()) return '';
      } catch (err) {
        throw new Error('File not found');
      }
    }

    if (program === 'bash') {
      const bashCmd = cmd[cmd.length - 1];
      const resolvedBashCmd = bashCmd
        .replace(new RegExp(`/workspace/${targetProjectId}`, 'g'), workingDir.replace(/\\/g, '/'))
        .replace(/\/workspace/g, workingDir.replace(/\\/g, '/'));

      return new Promise((resolve, reject) => {
        cpExec(resolvedBashCmd, { cwd: workingDir }, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout || stderr || '');
        });
      });
    }

    const cmdStr = cmd.join(' ');
    return new Promise((resolve, reject) => {
      cpExec(cmdStr, { cwd: workingDir }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout || stderr || '');
      });
    });
  }

  await ensureContainerRunning(targetContainerId);
  const container = docker.getContainer(targetContainerId);

  const workingDir = projectId ? `/workspace/${projectId}` : '/workspace';

  // Ensure target folder exists inside container if projectId is used
  if (projectId) {
    const initExec = await container.exec({
      Cmd: ['mkdir', '-p', workingDir],
      AttachStdout: true,
      AttachStderr: true,
    });
    const initStream = await initExec.start({ hijack: true, stdin: false });
    await new Promise((resolve) => initStream.on('end', resolve));
  }

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: workingDir,
  });

  return new Promise(async (resolve, reject) => {
    const stream = await exec.start({ hijack: true, stdin: false });
    let output = '';
    stream.on('data', (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        if (chunk.length < offset + 8) {
          output += chunk.slice(offset).toString();
          break;
        }
        const size = chunk.readUInt32BE(offset + 4);
        output += chunk.slice(offset + 8, offset + 8 + size).toString();
        offset += 8 + size;
      }
    });
    stream.on('end', () => resolve(output));
    stream.on('error', reject);
  });
}

async function listWorkspaceFiles(containerId) {
  const [realContainerId, projectId] = containerId.split(':');
  const baseDir = projectId ? `/workspace/${projectId}` : '/workspace';

  try {
    let output = await execInContainer(containerId, [
      'find', baseDir, '-type', 'f',
      '-not', '-path', '*/.git/*',
      '-not', '-name', '.gitkeep',
    ]);
    
    let files = output.trim().split('\n').filter(Boolean);

    // Self-healing: if no files are found in the project's folder, but it's a shared container project,
    // check the database to see if we can restore files from chat sessions!
    if (files.length === 0 && projectId) {
      console.log(`Self-healing: No files found in container for project ${projectId}. Attempting to restore from DB...`);
      const { supabase } = require('../middleware/auth');
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (sessions && sessions.length > 0) {
        const fileVersions = {};
        for (const s of sessions) {
          if (s.role === 'assistant') {
            const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END===/g;
            let match;
            while ((match = fileRegex.exec(s.message)) !== null) {
              const filename = match[1].trim();
              fileVersions[filename] = match[2];
            }
          }
        }
        
        const filesToWrite = Object.keys(fileVersions);
        if (filesToWrite.length > 0) {
          console.log(`Restoring ${filesToWrite.length} files from chat history...`);
          for (const filename of filesToWrite) {
            await writeFileInContainer(containerId, filename, fileVersions[filename]);
          }
          // Re-run find to get the updated file list
          output = await execInContainer(containerId, [
            'find', baseDir, '-type', 'f',
            '-not', '-path', '*/.git/*',
            '-not', '-name', '.gitkeep',
          ]);
          files = output.trim().split('\n').filter(Boolean);
        }
      }
    }

    const cleanFiles = files.map(file => {
      if (projectId && file.startsWith(`/workspace/${projectId}`)) {
        return file.replace(`/workspace/${projectId}`, '/workspace');
      }
      return file;
    });
    console.log('Files found:', cleanFiles);
    return cleanFiles;
  } catch (e) {
    console.error('listWorkspaceFiles error:', e.message);
    return [];
  }
}

async function writeFileInContainer(containerId, filename, content) {
  const [realContainerId, projectId] = containerId.split(':');
  const targetContainerId = realContainerId || containerId;

  if (targetContainerId === 'local-fs' || !dockerAvailable) {
    const targetProjectId = projectId || containerId.replace('local-fs:', '');
    const workingDir = path.resolve(PROJECTS_DIR, targetProjectId);
    const cleanFilename = filename.startsWith('/workspace/') ? filename.slice(11) : filename;
    const absolutePath = path.join(workingDir, cleanFilename);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, content, 'utf8');
    console.log('[LocalFS] Written:', cleanFilename);
    return;
  }

  const baseDir = projectId ? `/workspace/${projectId}` : '/workspace';
  const cleanFilename = filename.startsWith('/workspace/') ? filename.slice(11) : filename;

  const safeContent = content.replace(/'/g, "'\\''");
  await execInContainer(containerId, [
    'bash', '-c',
    `mkdir -p "$(dirname '${baseDir}/${cleanFilename}')" && printf '%s' '${safeContent}' > '${baseDir}/${cleanFilename}'`
  ]);
  console.log('Written:', cleanFilename);
}

async function removeWorkspace(containerId) {
  const [realContainerId, projectId] = containerId.split(':');
  const targetContainerId = realContainerId || containerId;

  if (targetContainerId === 'local-fs' || !dockerAvailable) {
    const targetProjectId = projectId || containerId.replace('local-fs:', '');
    const workingDir = path.resolve(PROJECTS_DIR, targetProjectId);
    console.log(`[LocalFS] Removing directory for project ${targetProjectId}`);
    try {
      await fs.promises.rm(workingDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`[LocalFS] Failed to delete directory for project ${targetProjectId}:`, e.message);
    }
    return;
  }

  if (projectId) {
    console.log(`Removing directory for project ${projectId} inside shared container`);
    try {
      await execInContainer(containerId, ['rm', '-rf', `/workspace/${projectId}`]);
    } catch (e) {
      console.error(`Failed to delete directory for project ${projectId}:`, e.message);
    }
  } else {
    const container = docker.getContainer(containerId);
    try { await container.stop({ t: 3 }); } catch (_) {}
    try { await container.remove({ force: true }); } catch (_) {}
  }
}

module.exports = { execInContainer,
  createWorkspace,
  listWorkspaceFiles,
  writeFileInContainer,
  removeWorkspace,
  ensureContainerRunning,
  isDockerAvailable: () => dockerAvailable
};
