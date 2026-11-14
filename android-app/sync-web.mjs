import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)));
const sourceDir = resolve(appDir, '..');
const targetDir = join(appDir, 'www');
const excluded = new Set(['.git', 'android-app', 'functions', 'node_modules']);

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
  if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
  await cp(join(sourceDir, entry.name), join(targetDir, entry.name), { recursive: true });
}
console.log(`Synced website files to ${targetDir}`);
