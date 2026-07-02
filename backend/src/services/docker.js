const Docker = require('dockerode');

const docker = new Docker({
  socketPath: process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock'
});

const IMAGE = process.env.WORKSPACE_IMAGE || 'claudable-workspace:latest';

async function createWorkspace(projectId) {
  try {
    const old = docker.getContainer(`claudable-${projectId}`);
    await old.remove({ force: true });
  } catch (_) {}

  const container = await docker.createContainer({
    Image: IMAGE,
    name: `claudable-${projectId}`,
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
  console.log('Container started:', container.id.slice(0,12));
  return container.id;
}

async function execInContainer(containerId, cmd) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
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
  try {
    const output = await execInContainer(containerId, [
      'find', '/workspace', '-type', 'f',
      '-not', '-path', '*/.git/*',
      '-not', '-name', '.gitkeep',
    ]);
    const files = output.trim().split('\n').filter(Boolean);
    console.log('Files found:', files);
    return files;
  } catch (e) {
    console.error('listWorkspaceFiles error:', e.message);
    return [];
  }
}

async function writeFileInContainer(containerId, filename, content) {
  const safeContent = content.replace(/'/g, "'\\''");
  await execInContainer(containerId, [
    'bash', '-c',
    `mkdir -p "$(dirname '/workspace/${filename}')" && printf '%s' '${safeContent}' > '/workspace/${filename}'`
  ]);
  console.log('Written:', filename);
}

async function removeWorkspace(containerId) {
  const container = docker.getContainer(containerId);
  try { await container.stop({ t: 3 }); } catch (_) {}
  try { await container.remove({ force: true }); } catch (_) {}
}

module.exports = { execInContainer,
  createWorkspace,
  listWorkspaceFiles,
  writeFileInContainer,
  removeWorkspace
};
