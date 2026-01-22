import { readFileSync } from 'fs';
import os from 'os';

if (os.arch() !== 'x64') {
  console.log(`Skipping test on non-x64 architecture: we don't build docker images on others`);
  process.exit(0);
}

const json = JSON.parse(readFileSync('dist/tengo/software/custom-docker.sw.json', 'utf8'));
const { docker } = json;

if (!docker) throw new Error('Missing docker section');
if (!docker.tag) throw new Error('Missing docker.tag');
if (!docker.entrypoint) throw new Error('Missing docker.entrypoint');
if (JSON.stringify(docker.entrypoint) !== JSON.stringify(['ep-arg1', 'ep-arg2'])) {
  throw new Error(`Invalid entrypoint: ${JSON.stringify(docker.entrypoint)}`);
}
if (JSON.stringify(docker.cmd) !== JSON.stringify(['cmd-arg1', 'cmd-arg2'])) {
  throw new Error(`Invalid cmd: ${JSON.stringify(docker.cmd)}`);
}
