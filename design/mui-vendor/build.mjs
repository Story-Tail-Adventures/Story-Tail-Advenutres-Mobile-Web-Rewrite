// Bundles React 19 and MUI v9 for the prototype (MUI ships no UMD build
// since v6).   npm install && npm run build
//
// react.js  - classic script, sets window.React / ReactDOM / ReactJSXRuntime.
// mui/*.js  - ES modules with code splitting, so the MUI entries share ONE
//             copy of emotion + @mui/system (two copies would mean two theme
//             contexts and unthemed components). Pages load the entry
//             files after react.js (one <script type="module"> each). Module scripts
//             finish before DOMContentLoaded, which is when Babel standalone
//             runs the text/babel screens, so window.MUI is ready for them.
import * as esbuild from 'esbuild';
import { readdirSync, rmSync, statSync } from 'node:fs';

const OUT = '../source-prototype/shared/vendor';
const CAP = 256 * 1024; // DesignSync get_file limit

// In the MUI chunks, React comes from the globals react.js already set.
const reactGlobals = {
  name: 'react-globals',
  setup(build) {
    const map = {
      'react': 'window.React',
      'react-dom': 'window.ReactDOM',
      'react-dom/client': 'window.ReactDOM',
      'react/jsx-runtime': 'window.ReactJSXRuntime',
      'react/jsx-dev-runtime': 'window.ReactJSXRuntime',
    };
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) =>
      map[args.path] ? { path: args.path, namespace: 'react-globals' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'react-globals' }, (args) =>
      ({ contents: `module.exports = ${map[args.path]};`, loader: 'js' }));
  },
};

const common = {
  bundle: true,
  minify: true,
  legalComments: 'none',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' },
};

rmSync(OUT, { recursive: true, force: true });

await esbuild.build({ ...common, format: 'iife', entryPoints: ['entry-react.js'], outfile: `${OUT}/react.js` });
await esbuild.build({
  ...common,
  format: 'esm',
  splitting: true,
  entryPoints: {
    'mui-core': 'entry-mui-core.js',
    'mui-controls': 'entry-mui-controls.js',
    'mui-overlays': 'entry-mui-overlays.js',
  },
  outdir: `${OUT}/mui`,
  chunkNames: 'chunk-[hash]',
  plugins: [reactGlobals],
});

let over = false;
const files = ['react.js', ...readdirSync(`${OUT}/mui`).map((f) => `mui/${f}`)];
for (const f of files) {
  const size = statSync(`${OUT}/${f}`).size;
  const ok = size < CAP;
  over ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${f} ${(size / 1024).toFixed(1)} KiB`);
}
if (over) process.exit(1);
