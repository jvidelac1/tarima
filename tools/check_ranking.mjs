// Campeonato semanal y ranking de punta a punta en el navegador (LIF-8, LIF-9, LIF-10), con el Worker de verdad en Node
// (tools/servidor_local.mjs, D1 falsa) y juego libre (lista). No pide GPU (dibujo=0, reloj manual).
//  1. Quien ya jugó ve «Campeonato semanal» y «Ranking» en la bienvenida (la primera vez, no).
//  2. «Ranking» abre el panel; dice que no hay finales todavía; se cierra.
//  3. «Campeonato semanal» juega la final de la semana (semilla y condiciones fijas) sin cambiar lo elegido para jugar libre.
//  4. Al terminar, el servidor la recalcula y la anota: el podio dice el puesto en el campeonato y «Ver ranking» la muestra
//     con «tú», anónima (el nombre no se publicó) y con el total que dio el servidor.
// Uso: node tools/check_ranking.mjs [--headed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { saltarRival } from './saltar_rival.mjs';
import { iniciarServidorLocal } from './servidor_local.mjs';
import { semanaDe, semillaSemana, CAMPEONATO } from '../web/js/sim/semana.js';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'out', 'ranking');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);
const problemas = [], mal = m => { if (!problemas.includes(m)) problemas.push(m); };
const browser = await chromium.launch(launchOptions({ headed: process.argv.includes('--headed') }));
const srv = await iniciarServidorLocal({ silencio: true, vars: { GRATIS_ETAPA: 'final', GRATIS: '20', TOPE_IP: '50' } });
const base = srv.url.replace(/\/$/, '');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
page.on('pageerror', e => mal(`pageerror: ${e.message}`));
page.on('response', r => { if (r.status() >= 400) mal(`HTTP ${r.status()}: ${r.url()}`); });
const J = (fn, a) => page.evaluate(fn, a);
let nFoto = 0; const foto = async n => { await page.screenshot({ path: path.join(OUT, `${String(++nFoto).padStart(2, '0')}_${n}.png`) }).catch(() => null); };
const av = ms => J(ms => JUEGO.test.avanzar(ms), ms), ir = t => J(t => JUEGO.test.hasta(t, 8), t);
const toque = async () => { await page.keyboard.down('Space'); await av(30); await page.keyboard.up('Space'); };
const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible())) return false; await l.focus(); await page.keyboard.press('Enter'); return true; };
const esperar = async (fn, que, ms = 15000, a) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await J(fn, a)) return true; await av(100); await page.waitForTimeout(40); } mal(`no apareció: ${que}`); return false; };

async function jugar(hasta, que, minutos = 12) {
  const t0 = Date.now();
  for (let n = 0; ; n++) {
    if (Date.now() - t0 > minutos * 60000) throw new Error(`${que}: no avanza en ${minutos} min`);
    const s = await J(() => JUEGO.estado());
    if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
    if (hasta(s)) return s;
    const I = s.intento;
    if (I && I.propio && s.modo !== 'panel') {
      const g = I.senal; if (!g) { await av(20); continue; }
      if (I.parado) { await av(80); await toque(); continue; }
      if (g.tipo === 'barra') { await ir(g.objetivo); await toque(); continue; }
      if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
      await av(30); continue;
    }
    if (s.panel && !s.sobre) { const hay = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)')); if (hay) { await av(450); if (await pulsa('#capa .panel button.ir:not(:disabled)')) { await av(60); continue; } } }
    await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
    if (!(I && I.propio) && n % 3 === 0 && await saltarRival(page, false)) continue;
  }
}

try {
  // jugador que vuelve: ya jugó una final, anotado (juego libre), con nombre
  await page.goto(`${base}/?dibujo=0&q=baja&lang=es`, { waitUntil: 'load' });
  await J(() => { localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.nombre', 'Nasar'); localStorage.setItem('tarima.dificultad', 'dificil'); localStorage.setItem('tarima.nivel', 'amistoso'); });
  await srv.db.prepare("INSERT INTO lista (id, email, nombre, idioma, novedades, consentimiento_version, consentimiento_en, creado) VALUES ('l1', 'n@pruebas-tarima.com', 'Nasar', 'es', 0, '2026-11-g', 1, 1)").run();
  const uuid = await J(() => { const u = crypto.randomUUID(); localStorage.setItem('tarima.dispositivo', u); localStorage.setItem('tarima.lista', '1'); return u; });
  await page.reload({ waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no inició');
  await J(() => JUEGO.test.manual());
  await esperar(() => !!document.getElementById('btn-empezar'), 'la bienvenida');
  // 1.
  const bv = await J(() => ({ camp: document.getElementById('btn-campeonato')?.textContent.trim(), rk: document.getElementById('btn-ranking')?.textContent.trim() }));
  if (bv.camp !== 'Campeonato semanal' || bv.rk !== 'Ranking') mal('1: la bienvenida no ofrece el campeonato y el ranking: ' + JSON.stringify(bv));
  await foto('bienvenida');
  // 2.
  await pulsa('#btn-ranking'); await esperar(() => !document.getElementById('sobre').hidden && !!document.querySelector('.sobre-ranking'), 'el panel del ranking');
  await esperar(() => /Todavía no hay finales/.test(document.querySelector('.sobre-ranking')?.textContent || ''), 'el ranking vacío', 8000);
  await foto('ranking_vacio');
  await pulsa('.sobre-ranking #so-seguir'); await esperar(() => document.getElementById('sobre').hidden, 'el cierre del ranking');
  // 3.
  await pulsa('#btn-campeonato');
  await esperar(() => !!JUEGO.E.p, 'la final del campeonato', 60000);
  const sem = semanaDe(Math.floor(Date.now() / 1000)), cab = await J(() => ({ semilla: JUEGO.E.p.reg.semilla, nivel: JUEGO.E.p.reg.nivel, ctl: JUEGO.E.p.reg.ctl, dif: JUEGO.E.p.reg.dif ?? 'facil', orden: JUEGO.E.p.reg.orden, guardada: localStorage.getItem('tarima.dificultad') }));
  if (cab.semilla !== semillaSemana(sem.clave) || cab.nivel !== CAMPEONATO.nivel || cab.dif !== CAMPEONATO.dif || cab.ctl !== CAMPEONATO.ctl) mal('3: la final no es la de la semana: ' + JSON.stringify(cab));
  if (cab.guardada !== 'dificil') mal('3: el campeonato cambió la dificultad elegida para jugar libre: ' + cab.guardada);
  // 4.
  await jugar(s => s.pantalla === 'fin', 'la final del campeonato');
  await esperar(() => /Campeonato semanal: puesto 1 de 1/.test(document.getElementById('podio-rk')?.textContent || ''), 'el puesto en el podio', 20000);
  await foto('podio');
  const fila = await srv.db.prepare('SELECT total, campeonato, semana, apodo FROM finales').first();
  if (!fila || fila.campeonato !== 1 || fila.semana !== sem.clave || fila.apodo !== null) mal('4: la final no quedó anotada como del campeonato: ' + JSON.stringify(fila));
  const enJuego = await J(() => JUEGO.E.p.tabla().find(f => f.a === JUEGO.E.yo).total);
  if (fila && fila.total !== enJuego) mal(`4: el total del servidor (${fila.total}) no es el del juego (${enJuego})`);
  await pulsa('#btn-rk'); await av(200);
  await esperar(() => !!document.querySelector('.sobre-ranking tr.yo'), 'mi fila en el ranking', 10000);
  const yo = await J(() => document.querySelector('.sobre-ranking tr.yo')?.textContent.replace(/\s+/g, ' ').trim());
  if (!/Anónimo/.test(yo || '') || !new RegExp(`${enJuego} kg`).test(yo || '')) mal('4: mi fila no es anónima con mi total: ' + yo);
  await foto('ranking_con_final');
  // 5. perfil y progresión (LIF-68, LIF-14): de vuelta en la bienvenida, «Mi perfil» dice la final y, con oro, el RM sube 1 kg
  const oro = await J(() => JUEGO.E.p.tabla().find(f => f.a === JUEGO.E.yo).puesto === 1), pesista = await J(() => JUEGO.E.cfg.id);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.JUEGO?.listo && window.JUEGO.test, null, { timeout: 60000 }); await J(() => JUEGO.test.manual());
  await esperar(() => !!document.getElementById('btn-perfil'), 'la bienvenida con «Mi perfil»');
  await pulsa('#btn-perfil'); await esperar(() => /Finales: 1 /.test(document.querySelector('.sobre-perfil')?.textContent || ''), 'el perfil con la final', 10000);
  await foto('perfil');
  await pulsa('.sobre-perfil #so-seguir'); await esperar(() => document.getElementById('sobre').hidden, 'el cierre del perfil');
  if (oro) {
    const rm = await J(id => document.querySelector(`.pesista[data-id="${id}"] .rm`)?.textContent || '', pesista);
    if (!/\+1/.test(rm)) mal('5: con un oro, la tarjeta no muestra el RM +1: ' + rm);
    // la final siguiente (libre) se juega con el bono y el servidor la acepta
    await pulsa('#btn-empezar'); await esperar(() => !!JUEGO.E.p, 'la final libre', 60000);
    const rmReg = await J(() => JUEGO.E.p.reg.atletas.find(a => a.ctrl === 'persona').rm);
    if (!rmReg || rmReg.s !== 1) mal('5: la final libre no lleva el bono en el registro: ' + JSON.stringify(rmReg));
    await jugar(s => s.pantalla === 'fin', 'la final con bono');
    await esperar(() => /anotada|puesto/.test(document.getElementById('podio-rk')?.textContent || ''), 'la final con bono anotada', 20000);
  } else console.log('(sin oro en el campeonato: no se prueba el bono)');
  console.log(`campeonato ${sem.clave}: total ${enJuego} kg · fila «${yo}» · dispositivo ${uuid.slice(0, 8)}`);
} catch (e) { mal('excepción: ' + e.message); await foto('excepcion'); }
await browser.close(); await srv.cerrar?.();
console.log(problemas.length ? `\nFALLÓ (${problemas.length}):\n  ${problemas.join('\n  ')}` : '\nOK: campeonato semanal jugado, validado en el servidor y en el ranking');
process.exit(problemas.length ? 1 : 0);
