import { readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const assets = {};
for (const [path, file, type] of [
  ['/', 'index.html', 'text/html'], ['/index.html', 'index.html', 'text/html'],
  ['/script.js', 'script.js', 'text/javascript'], ['/style.css', 'style.css', 'text/css']
]) assets[path] = { body: read(file), type: type + '; charset=utf-8' };
const store = read('worker/store.js').replaceAll('export ', '');
const handler = read('worker/index.js').replace("import { createD1Store, ApiError } from './store.js';", '').replace('export function', 'function');
const output = `${store}\n${handler}\nconst assets = ${JSON.stringify(assets)};\nexport default { fetch: createHandler(assets) };\n`;
mkdirSync(resolve(root, 'dist/server'), { recursive: true });
mkdirSync(resolve(root, 'dist/.openai'), { recursive: true });
writeFileSync(resolve(root, 'dist/server/index.js'), output);
cpSync(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
cpSync(resolve(root, 'drizzle'), resolve(root, 'dist/.openai/drizzle'), { recursive: true });
console.log('Worker and storefront built.');
