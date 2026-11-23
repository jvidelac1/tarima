// El reloj de la competencia en la barrita (LIF-35), en el navegador sin GPU (dibujo=0, reloj manual):
//  1. En Medio, el panel del primer intento propio dice que el reloj corre y el reloj de arriba baja.
//  2. Si llega a 0:00 sin confirmar, el intento se pierde: veredicto «Se acabó el reloj» y la final sigue.
//  3. En Fácil no hay reloj (el panel espera).
// Uso: node tools/check_reloj.mjs [--headed]
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { iniciarServidorLocal } from './servidor_local.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const problemas = [], mal = m => problemas.push(m);
const browser = await chromium.launch(launchOptions({ headed: process.argv.includes('--headed') }));
const srv = await iniciarServidorLocal({ silencio: true, vars: { GRATIS_ETAPA: 'final', GRATIS: '20', TOPE_IP: '50' } });

async function caso(dif) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', e => mal(`[${dif}] pageerror: ${e.message}`));
  await page.addInitScript(d => { if (!sessionStorage.getItem('__i')) { localStorage.setItem('tarima.dificultad', d); localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.nombre', 'Prueba'); localStorage.setItem('tarima.tutorial', '1'); sessionStorage.setItem('__i', '1'); } }, dif);
  await page.goto(`${srv.url}?dibujo=0&q=baja&lang=es&semilla=4242`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO?.listo && window.JUEGO.test, null, { timeout: 60000 });
  const J = (fn, a) => page.evaluate(fn, a), av = ms => J(ms => JUEGO.test.avanzar(ms), ms);
  await J(() => JUEGO.test.manual());
  const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible())) return false; await l.focus(); await page.keyboard.press('Enter'); return true; };
  const t0 = Date.now(); let s;
  // hasta el primer llamado propio con el panel de kilos (saltea presentación, rivales y avisos con el botón principal)
  for (;;) {
    if (Date.now() - t0 > 180000) { mal(`[${dif}] no llegó al primer llamado propio`); await ctx.close(); return; }
    s = await J(() => JUEGO.estado());
    if (s.pantalla === 'llamado' && s.panel && await J(() => !!document.querySelector('#capa .panel #kg-mas'))) break;
    if (s.panel && await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'))) { await av(450); await pulsa('#capa .panel button.ir:not(:disabled)'); }
    await av(300);
    await J(() => document.getElementById('saltar-rival')?.click());
  }
  const r0 = await J(() => ({ reloj: document.getElementById('reloj').textContent, que: (document.querySelector('#capa .panel')?.textContent || '').match(/[^.]*reloj[^.]*\./i)?.[0] || '' }));
  await av(5000);
  const r1 = await J(() => document.getElementById('reloj').textContent);
  if (dif === 'facil') {
    if (/reloj corre/i.test(r0.que) || r0.reloj !== r1) mal(`[facil] hay reloj en Fácil: ${JSON.stringify(r0)} → ${r1}`);
  } else {
    if (!/reloj corre/i.test(r0.que)) mal(`[${dif}] el panel no avisa que el reloj corre: «${r0.que}»`);
    if (r0.reloj === r1) mal(`[${dif}] el reloj no baja: ${r0.reloj} → ${r1}`);
    await av(70000);
    let v = '', ip = null;
    for (let k = 0; k < 60 && !ip; k++) { await av(250); v = (await J(() => document.getElementById('veredicto')?.textContent || '')) || v; ip = await J(() => (JUEGO.eventos || []).filter(e => e.ev === 'intento_propio').at(-1)?.props || null); }
    if (!ip || ip.causa !== 'reloj') mal(`[${dif}] al llegar a 0:00 no se perdió el intento por reloj: ${JSON.stringify(ip)}`);
    const e = await J(() => JUEGO.estado().errores); if (e.length) mal(`[${dif}] errores: ${e[0]}`);
    console.log(`[${dif}] panel «${r0.que}» · reloj ${r0.reloj} → ${r1} · veredicto «${v.replace(/\s+/g, ' ').slice(0, 80)}»`);
  }
  await ctx.close();
}
async function categoria() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', e => mal(`[categoría] pageerror: ${e.message}`));
  await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { localStorage.setItem('tarima.categoria', '71'); localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.nombre', 'Prueba'); localStorage.setItem('tarima.tutorial', '1'); sessionStorage.setItem('__i', '1'); } });
  await page.goto(`${srv.url}?dibujo=0&q=baja&lang=es&semilla=4242`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO?.listo && window.JUEGO.test, null, { timeout: 60000 }); await page.evaluate(() => JUEGO.test.manual());
  await page.locator('#btn-opciones').focus(); await page.keyboard.press('Enter'); await page.evaluate(() => JUEGO.test.avanzar(300));
  const marcada = await page.evaluate(() => document.querySelector('[data-cat][aria-pressed=true]')?.dataset.cat);
  if (marcada !== '71') mal(`[categoría] Opciones no marca la categoría guardada: ${marcada}`);
  await page.locator('#btn-empezar').focus(); await page.keyboard.press('Enter');
  for (let k = 0; k < 300 && !await page.evaluate(() => !!JUEGO.E.p); k++) { await page.evaluate(() => JUEGO.test.avanzar(200)); await page.waitForTimeout(20); }
  const x = await page.evaluate(() => ({ cat: JUEGO.E.p?.reg.categoria, sub: document.getElementById('ev-sub')?.textContent, techo: JUEGO.E.p?.at.find(a => a.ctrl === 'persona')?.f.techo }));
  if (x.cat !== 71 || !/71/.test(x.sub || '')) mal('[categoría] la final no es en 71: ' + JSON.stringify(x));
  console.log('[categoría] ' + JSON.stringify(x));
  await ctx.close();
}
try { await caso('medio'); await caso('facil'); await categoria(); } catch (e) { mal('excepción: ' + e.message); }
await browser.close(); await srv.cerrar();
console.log(problemas.length ? `\nFALLÓ (${problemas.length}):\n  ${problemas.join('\n  ')}` : '\nOK: reloj en Medio (avisa, baja y vence), sin reloj en Fácil, y la final en la categoría elegida');
process.exit(problemas.length ? 1 : 0);
