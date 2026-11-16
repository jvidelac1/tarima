// Hojas de contactos: junta las fotos numeradas de una carpeta (nombre_00.jpg, nombre_01.jpg…) en una hoja por nombre.
// Uso: node tools/hojas.mjs <carpeta> [--cols=6] [--ancho=320]   → <carpeta>/hoja_<nombre>.jpg
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const DIR = path.resolve(process.argv[2] || '.'), COLS = +(arg('cols') || 6), ANCHO = +(arg('ancho') || 320);
const grupos = new Map();
for (const f of fs.readdirSync(DIR).sort()) { const m = /^(?!hoja_)(.+)_(\d\d)\.(jpg|png)$/.exec(f); if (m) (grupos.get(m[1]) || grupos.set(m[1], []).get(m[1])).push(f); }
const browser = await chromium.launch(launchOptions({})), page = await browser.newPage();
for (const [nombre, lista] of grupos) {
  if (lista.length < 4) continue;
  const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${COLS},${ANCHO}px);gap:2px;font:11px monospace;color:#fff">${lista.map(f => `<div style="position:relative"><img src="data:image/${f.endsWith('png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}" style="width:${ANCHO}px;display:block"><span style="position:absolute;left:2px;top:1px;background:#000a;padding:0 3px">${f.replace(/\.\w+$/, '').slice(-2)}</span></div>`).join('')}</body>`;
  await page.setViewportSize({ width: COLS * (ANCHO + 2), height: 400 }); await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(DIR, `hoja_${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
  console.log(`hoja_${nombre}.jpg · ${lista.length} fotos`);
}
await browser.close();
