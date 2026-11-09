// Baut die Web-App nach dist/ (wird für Android und für die PC-Version genutzt)
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome89', 'safari15'],
  minify: true,
  legalComments: 'none',
  outfile: 'dist/app.js',
  logLevel: 'info'
});

await build({
  entryPoints: ['src/styles.css'],
  bundle: true,
  minify: true,
  outfile: 'dist/styles.css',
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info'
});

cpSync('src/index.html', 'dist/index.html');
if (existsSync('public')) cpSync('public', 'dist', { recursive: true });
console.log('✔ Web-App gebaut → dist/');
