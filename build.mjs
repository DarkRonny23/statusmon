import esbuild from 'esbuild';
import fs from 'fs';

fs.mkdirSync('dist', { recursive: true });

await esbuild.build({
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  entryPoints: ['scripts/statusline.mjs', 'scripts/session-start.mjs'],
});

console.log('Build complete → dist/');
