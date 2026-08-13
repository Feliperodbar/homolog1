import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(EXT_ROOT, 'src');
const DIST = path.join(EXT_ROOT, 'dist');
const ICONS = path.join(EXT_ROOT, 'icons');
const MANIFEST = path.join(EXT_ROOT, 'manifest.json');

const args = new Set(process.argv.slice(2));
const WATCH = args.has('--watch') || args.has('-w');

const sharedEsbuildOptions = {
  bundle: true,
  logLevel: 'info',
  charset: 'utf8',
  target: ['chrome114', 'edge114'],
  sourcemap: true,
  sourcesContent: true,
  legalComments: 'none',
};

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function cleanDist() {
  try {
    await fs.rm(DIST, { recursive: true, force: true });
  } catch {
    /* n/a */
  }
  await ensureDir(DIST);
}

async function copyFile(from, toDir, name) {
  await ensureDir(toDir);
  const target = path.join(toDir, name ?? path.basename(from));
  await fs.copyFile(from, target);
}

async function copyDirContents(from, to) {
  await ensureDir(to);
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      await copyDirContents(src, dst);
    } else {
      await fs.copyFile(src, dst);
    }
  }
}

async function copyStaticAssets() {
  await copyFile(MANIFEST, DIST);
  await copyDirContents(ICONS, path.join(DIST, 'icons'));
  await copyFile(path.join(SRC, 'popup', 'popup.html'), path.join(DIST, 'popup'));
  await copyFile(path.join(SRC, 'popup', 'popup.css'), path.join(DIST, 'popup'));
}

async function bundle() {
  const results = await Promise.all([
    esbuild.build({
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'background', 'index.ts')],
      outfile: path.join(DIST, 'background', 'index.js'),
      format: 'esm',
      platform: 'browser',
    }),
    esbuild.build({
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'content', 'index.ts')],
      outfile: path.join(DIST, 'content', 'index.js'),
      format: 'iife',
      platform: 'browser',
    }),
    esbuild.build({
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'popup', 'popup.ts')],
      outfile: path.join(DIST, 'popup', 'popup.js'),
      format: 'esm',
      platform: 'browser',
    }),
  ]);
  const hasErrors = results.some((r) => r.errors.length > 0);
  if (hasErrors) {
    throw new Error('esbuild encontrou erros');
  }
}

async function watchBundle() {
  const configs = [
    {
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'background', 'index.ts')],
      outfile: path.join(DIST, 'background', 'index.js'),
      format: 'esm',
      platform: 'browser',
    },
    {
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'content', 'index.ts')],
      outfile: path.join(DIST, 'content', 'index.js'),
      format: 'iife',
      platform: 'browser',
    },
    {
      ...sharedEsbuildOptions,
      entryPoints: [path.join(SRC, 'popup', 'popup.ts')],
      outfile: path.join(DIST, 'popup', 'popup.js'),
      format: 'esm',
      platform: 'browser',
    },
  ];
  const ctxs = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(ctxs.map((ctx) => ctx.watch()));
  console.log('[extension] watch mode ativo — rebuild em mudanças de TS');
}

async function main() {
  console.log(`[extension] build iniciando (watch=${WATCH})`);
  await cleanDist();
  await copyStaticAssets();
  if (WATCH) {
    await watchBundle();
  } else {
    await bundle();
    const manifestPath = path.join(DIST, 'manifest.json');
    const files = await fs.readdir(DIST, { recursive: true });
    console.log('[extension] build concluído — dist/:', JSON.stringify(files, null, 2));
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    console.log('[extension] manifest version:', manifest.version, '| name:', manifest.name);
  }
}

main().catch((e) => {
  console.error('[extension] build falhou:', e);
  process.exit(1);
});
