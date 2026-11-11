// Copia three.js y los addons que usa el visor (con sus imports transitivos) a web/vendor/,
// y las tipografías OFL a web/assets/fonts/. Uso: npm install && npm run vendor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules', 'three');
const DST = path.join(ROOT, 'web', 'vendor', 'three');
const ADDONS = [
  'loaders/GLTFLoader.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/GTAOPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/SMAAPass.js',
  'libs/meshopt_simplifier.module.js',      // nivel de detalle del atleta al cargar (athlete.js)
];

fs.rmSync(DST, { recursive: true, force: true });
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
for (const f of ['three.module.js', 'three.core.js']) copy(path.join(SRC, 'build', f), path.join(DST, 'build', f));
copy(path.join(SRC, 'LICENSE'), path.join(DST, 'LICENSE'));

const seen = new Set();
const walk = rel => {
  if (seen.has(rel)) return; seen.add(rel);
  const from = path.join(SRC, 'examples', 'jsm', rel);
  copy(from, path.join(DST, 'addons', rel));
  const src = fs.readFileSync(from, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
};
ADDONS.forEach(walk);

const FONTS = path.join(ROOT, 'web', 'assets', 'fonts');
fs.mkdirSync(FONTS, { recursive: true });
const fonts = [['saira-condensed', [500, 700, 800]], ['saira', [400, 500, 600]]];
for (const [fam, ws] of fonts) {
  for (const w of ws) copy(path.join(ROOT, 'node_modules', '@fontsource', fam, 'files', `${fam}-latin-${w}-normal.woff2`), path.join(FONTS, `${fam}-${w}.woff2`));
  copy(path.join(ROOT, 'node_modules', '@fontsource', fam, 'LICENSE'), path.join(FONTS, `${fam}-LICENSE.txt`));
}
const ver = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(DST, 'VERSION'), ver + '\n');
console.log(`three ${ver}: ${seen.size} addons -> web/vendor/three, tipografías -> web/assets/fonts`);
