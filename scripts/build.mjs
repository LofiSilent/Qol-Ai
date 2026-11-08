import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MeshoptSimplifier } from 'meshoptimizer';
import { compactAvatar } from './compact-avatar.mjs';
import { compressAvatar } from './compress-avatar.mjs';

const BUILD = process.env.GITHUB_SHA?.slice(0, 8) || Date.now().toString(36);
const APP = process.env.APP === '1';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const entry of ['index.html', 'styles.css', 'trailer.css', 'sw.js', '_headers', 'js', 'data', 'assets', 'system-alert']) {
  await cp(`src/${entry}`, `dist/${entry}`, { recursive: true });
}

// Decode the same skeleton and motions, pruning only wardrobe already hidden at runtime.
const source = await readFile('src/assets/model/avatar.glb');
await MeshoptSimplifier.ready;
const compact = compactAvatar(source, { simplifier: MeshoptSimplifier, trim: { pantsBelowY: 0.45, hairRatio: Number(process.env.HAIR_RATIO || 0) } });
const compressed = await compressAvatar(compact.buffer);
const digest = createHash('sha256').update(compressed.buffer).digest('hex').slice(0, 12);
const modelPath = `assets/model/avatar-fast-${digest}.glb`;
await writeFile(`dist/${modelPath}`, compressed.buffer);
await rm('dist/assets/model/avatar.glb');
await rm('dist/assets/video/qol-trailer-v7-poster.png', { force: true });
let main = await readFile('dist/js/main.js', 'utf8');
main = main.replace('assets/model/avatar.glb?v=__BUILD__', modelPath);
await writeFile('dist/js/main.js', main);

// Same-origin dependencies work for both the website and the offline Android bundle.
for (const file of ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/environments/RoomEnvironment.js']) {
  await mkdir(join('dist/vendor/three', file, '..'), { recursive: true });
  await cp(join('node_modules/three', file === 'build/three.module.js' ? 'build/three.module.min.js' : file), join('dist/vendor/three', file));
}
await mkdir('dist/vendor/meshoptimizer', { recursive: true });
await cp('node_modules/meshoptimizer/meshopt_decoder.mjs', 'dist/vendor/meshoptimizer/meshopt_decoder.mjs');
await cp('node_modules/meshoptimizer/LICENSE.md', 'dist/vendor/meshoptimizer/LICENSE.md');
await cp('node_modules/three/LICENSE', 'dist/vendor/three/LICENSE');
const fontCSS = [];
for (const [name, weights] of Object.entries({ manrope: [400, 500, 600, 700, 800], unbounded: [500, 600, 700] })) {
  const pkg = `node_modules/@fontsource/${name}`;
  await cp(join(pkg, 'files'), `dist/vendor/fonts/${name}/files`, { recursive: true, filter: f => !/\.woff$/.test(f) });
  for (const weight of weights) {
    const css = await readFile(join(pkg, `${weight}.css`), 'utf8');
    fontCSS.push(css.replaceAll('./files/', `./${name}/files/`).replace(/, url\([^)]+\.woff\) format\('woff'\)/g, ''));
  }
}
await writeFile('dist/vendor/fonts/fonts.css', fontCSS.join('\n'));
let html = await readFile('dist/index.html', 'utf8');
html = html.replace(/\s*<link rel="preconnect"[^>]*>/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', './vendor/three/build/three.module.js')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', './vendor/three/examples/jsm/')
  .replace('https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs', './vendor/meshoptimizer/meshopt_decoder.mjs');
// Start the 3D model and the WebGL module graph downloading in parallel with main.js,
// instead of after the whole import chain (main.js -> avatar.js -> three -> GLTFLoader) has been fetched.
const earlyModules = ['js/avatar.js?v=__BUILD__', 'js/avatar-download.js?v=__BUILD__', 'js/motion-sequence.js?v=__BUILD__',
  'vendor/three/build/three.module.js', 'vendor/three/examples/jsm/loaders/GLTFLoader.js', 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  'vendor/three/examples/jsm/environments/RoomEnvironment.js', 'vendor/meshoptimizer/meshopt_decoder.mjs'];
html = html.replace('</head>', `  <link rel="preload" as="fetch" href="${modelPath}" crossorigin>\n${earlyModules.map(h => `  <link rel="modulepreload" href="${h}">`).join('\n')}\n</head>`);
if (APP) html = html.replace('<html lang="kk"', '<html lang="kk" class="native-app"');
if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com|<script src="https:\/\/telegram/.test(html)) throw new Error('Initial HTML still depends on external services');
await writeFile('dist/index.html', html);
async function stamp(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await stamp(path);
    else if (/\.(html|js)$/.test(item.name)) {
      const text = await readFile(path, 'utf8');
      if (text.includes('__BUILD__')) await writeFile(path, text.replaceAll('__BUILD__', BUILD));
    }
  }
}
await stamp('dist');
// Service worker: precache everything except video (large, range requests) and the Android-only bits.
async function listFiles(dir, base = '') {
  const out = [];
  for (const item of await readdir(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) out.push(...await listFiles(dir, rel)); else out.push(rel);
  }
  return out;
}
const precache = (await listFiles('dist')).filter(f => f !== 'sw.js' && !f.startsWith('_') && !f.startsWith('assets/video/') && !f.startsWith('system-alert/') && !/\.(png|map)$/.test(f) || /^assets\/icons\//.test(f));
let sw = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', sw.replace('__PRECACHE__', JSON.stringify(precache)));
console.log(JSON.stringify({ sourceModelBytes: source.length, trim: compact.report.trim, ...compressed.report, modelPath }));
console.log(`Built ${APP ? 'app' : 'site'} into dist/ (version ${BUILD})`);
