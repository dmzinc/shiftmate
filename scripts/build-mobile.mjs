import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const out = new URL('../www/', import.meta.url);
const htmlPath = new URL('../index.html', import.meta.url);
const appPath = new URL('../app.js', import.meta.url);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

let html = await readFile(htmlPath, 'utf8');
const supabaseCdn = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
const xlsxCdn = '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>';
if (!html.includes(supabaseCdn) || !html.includes(xlsxCdn)) {
  throw new Error('Expected Supabase and SheetJS CDN tags were not found; refusing to create an incomplete mobile bundle.');
}
html = html.replace(supabaseCdn, '<script src="/vendor.js"></script>');
html = html.replace(xlsxCdn, '');
html = html.replace(/<script src="\/app\.js\?v=[^"]+"><\/script>/, '<script src="/app.js"></script>');
if (!html.includes('<script src="/app.js"></script>')) {
  throw new Error('Could not locate the application script tag.');
}

await build({
  entryPoints: [new URL('../mobile-vendor.js', import.meta.url).pathname],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  outfile: new URL('../www/vendor.js', import.meta.url).pathname,
  minify: true
});
await writeFile(new URL('../www/app.js', import.meta.url), await readFile(appPath));
await writeFile(new URL('../www/index.html', import.meta.url), html);
console.log('Mobile web bundle created in www/. Core Supabase and XLSX libraries are bundled locally.');
