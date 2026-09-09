// 开发模式：同时启动 API(4000) 与 Vite 前端(5173，代理 /api → 4000)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const node = process.execPath;

const viteBin = path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];

function run(name, args, opts = {}) {
  const child = spawn(node, args, { cwd: root, stdio: 'inherit', ...opts });
  child.on('exit', (code) => { console.log(`[${name}] exited with code ${code}`); });
  children.push(child);
}

run('server', ['server/src/index.ts']);
if (process.env.CLIENT_ONLY !== '1') {
  run('client', [viteBin, '--port', '5173', '--strictPort'], { cwd: path.join(root, 'client') });
}

process.on('SIGINT', () => { children.forEach((c) => c.kill('SIGINT')); process.exit(0); });
process.on('SIGTERM', () => { children.forEach((c) => c.kill('SIGTERM')); process.exit(0); });
