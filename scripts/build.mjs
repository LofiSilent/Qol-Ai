import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Версия сборки подставляется вместо __BUILD__, чтобы браузер не брал старые файлы из кэша.
const BUILD = process.env.GITHUB_SHA?.slice(0, 8) || Date.now().toString(36);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const entry of ['index.html', 'styles.css', 'js', 'data', 'assets']) {
  await cp(`src/${entry}`, `dist/${entry}`, { recursive: true });
}

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
console.log(`Built static site into dist/ (version ${BUILD})`);
