import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function productionFiles(source) {
  const relative = path.relative(root, source);
  return !relative.split(path.sep).includes('test');
}

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(root, 'apps'), path.join(dist, 'apps'), { recursive: true, filter: productionFiles });
await fs.cp(path.join(root, 'packages'), path.join(dist, 'packages'), { recursive: true, filter: productionFiles });
console.log('构建完成：dist/');