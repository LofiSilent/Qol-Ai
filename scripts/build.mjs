import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Сборка сайта в dist/.
// APP=1 — сборка для мобильного приложения: three.js и шрифты кладутся внутрь,
// чтобы приложение работало без CDN и открывалось без интернета.
const BUILD = process.env.GITHUB_SHA?.slice(0, 8) || Date.now().toString(36);
const APP = process.env.APP === '1';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const entry of ['index.html', 'styles.css', 'js', 'data', 'assets']) {
  await cp(`src/${entry}`, `dist/${entry}`, { recursive: true });
}

await cp('src/system-alert', 'dist/system-alert', { recursive: true });

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

if (APP) {
  const need = path => { if (!existsSync(path)) throw new Error(`Нет ${path}. Выполните npm install.`); return path; };
  const three = need('node_modules/three');
  // three.js и загрузчик моделей
  for (const file of ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/environments/RoomEnvironment.js']) {
    await cp(join(three, file), `dist/vendor/three/${file}`);
  }
  // шрифты
  const fonts = { manrope: [400, 500, 600, 700, 800], unbounded: [500, 600, 700] };
  const links = [];
  for (const [name, weights] of Object.entries(fonts)) {
    const pkg = need(`node_modules/@fontsource/${name}`);
    await cp(join(pkg, 'files'), `dist/vendor/fonts/${name}/files`, { recursive: true, filter: f => !/\.woff$/.test(f) });
    for (const w of weights) {
      await cp(join(pkg, `${w}.css`), `dist/vendor/fonts/${name}/${w}.css`);
      links.push(`<link rel="stylesheet" href="vendor/fonts/${name}/${w}.css">`);
    }
  }
  let html = await readFile('dist/index.html', 'utf8');
  html = html
    .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, links.join('\n  '))
    .replace(/\s*<script src="https:\/\/telegram\.org[^>]*><\/script>/, '')
    .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', './vendor/three/build/three.module.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', './vendor/three/examples/jsm/')
    .replace('<html lang="kk"', '<html lang="kk" class="native-app"');
  if (html.includes('cdn.jsdelivr.net') || html.includes('fonts.googleapis.com')) throw new Error('В сборке приложения остались внешние ссылки');
  await writeFile('dist/index.html', html);
}

console.log(`Built ${APP ? 'app' : 'site'} into dist/ (version ${BUILD})`);
