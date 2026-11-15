import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'www');
const htmlPath = path.join(root, 'index.html');
const assetsPath = path.join(root, 'assets');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

let html = await readFile(htmlPath, 'utf8');
const supabaseCdn = /<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2["']><\/script>/i;
const xlsxCdn = /<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js["']><\/script>/i;

if (!supabaseCdn.test(html) || !xlsxCdn.test(html)) {
  throw new Error('Expected Supabase and SheetJS CDN script tags were not found. Check index.html before building the native bundle.');
}

html = html.replace(supabaseCdn, '<script src="/vendor.js"></script>');
html = html.replace(xlsxCdn, '');

await build({
  entryPoints: [path.join(root, 'mobile-vendor.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  outfile: path.join(out, 'vendor.js'),
  minify: true
});

await cp(assetsPath, path.join(out, 'assets'), { recursive: true });
await writeFile(path.join(out, 'index.html'), html);

// Fail fast if a local script referenced by index.html is missing from the mobile bundle.
const scriptSources = [...html.matchAll(/<script\s+src=["']([^"']+)["']/gi)].map(match => match[1]);
for (const source of scriptSources) {
  if (/^(https?:)?\/\//i.test(source)) continue;
  const relative = source.replace(/^\//, '').split('?')[0];
  const candidate = path.join(out, relative);
  try {
    await readFile(candidate);
  } catch {
    throw new Error(`Mobile bundle is missing script: ${source}`);
  }
}

console.log(`Mobile web bundle created at ${out}. Bundled Supabase and SheetJS locally; copied modular application assets.`);
