// Gráfica de transmisión (zócalo, fase, lecturas, reloj, luces) y consola de control. Solo DOM.
import { ATHLETES, EVENT } from './config.js';
import { CAMERAS, SHOTS } from './cameras.js';

const $ = id => document.getElementById(id);
const LIFT_NAME = { c: 'Dos tiempos', s: 'Arranque' };
const fmt = (v, d = 0) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

export class Hud {
  /** @param {object} on  manejadores: who, lift, jerk, play, replay, slow, trace, cam, quality, load, scrub */
  constructor(on) {
    this.on = on; this._phaseIdx = -1; this._nums = ''; this.enabled = true;
    $('ev-title').textContent = EVENT.title; $('ev-sub').textContent = `${EVENT.session} · ${EVENT.year}`;
    for (const k of Object.keys(ATHLETES)) {
      const b = document.createElement('button'); b.className = 'chip'; b.id = 'who-' + k; b.dataset.k = k; b.textContent = ATHLETES[k].name.split(' ').pop();
      b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => on.who(k)); $('who').appendChild(b);
    }
    CAMERAS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'chip s'; b.id = 'cam-' + i; b.textContent = c.label; b.setAttribute('aria-pressed', i === 0);
      b.addEventListener('click', () => on.cam(i)); $('cams').appendChild(b);
    });
    $('lift-c').addEventListener('click', () => on.lift('c')); $('lift-s').addEventListener('click', () => on.lift('s'));
    for (const j of ['split', 'power', 'squat']) $('jk-' + j).addEventListener('click', () => on.jerk(j));
    $('slow').addEventListener('click', () => on.slow()); $('trace').addEventListener('click', () => on.trace());
    $('play').addEventListener('click', () => on.play()); $('replay-btn').addEventListener('click', () => on.replay());
    $('quality').addEventListener('change', e => on.quality(e.target.value));
    for (const s of SHOTS) { const o = document.createElement('option'); o.value = s.key; o.textContent = 'Plano: ' + s.label.toLowerCase(); $('shot').appendChild(o); }
    $('shot').addEventListener('change', e => on.shot(e.target.value));
    $('more-btn').addEventListener('click', () => { const open = document.body.classList.toggle('more-open'); $('more-btn').setAttribute('aria-expanded', open); });
    $('load').addEventListener('change', e => on.load(parseFloat(e.target.value)));
    $('scrub').addEventListener('input', e => on.scrub(parseFloat(e.target.value)));
    this._key = e => {
      if (!this.enabled || e.target.closest('input,select,button')) return;
      if (e.code === 'Space') { e.preventDefault(); on.play(); }
      else if (e.key >= '1' && e.key <= String(CAMERAS.length)) on.cam(+e.key - 1);
      else if (e.key === 'h') document.body.classList.toggle('clean');
      else if (e.key === 'p') { const keys = ['', ...SHOTS.map(s => s.key)]; on.shot(keys[(keys.indexOf($('shot').value) + 1) % keys.length]); }
    };
    addEventListener('keydown', this._key);
  }
  /** Habilita o bloquea la consola entera (clics, teclado y lectores de pantalla) mientras carga el primer atleta. */
  setEnabled(on) { this.enabled = !!on; $('panel').inert = !on; $('cams').inert = !on; document.body.classList.toggle('booting', !on); }
  message(text) { $('msg').hidden = !text; if (text) $('msg').textContent = text; }
  setAthlete(key) {
    const a = ATHLETES[key];
    $('name').textContent = a.name; $('code').textContent = a.country; $('cat').textContent = a.category; $('bio').textContent = a.bio;
    $('flag').style.background = a.flag;
    document.querySelectorAll('#who .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === key));
  }
  setLift(lift, jerk, attempt = 1) {
    $('lift-c').setAttribute('aria-pressed', lift === 'c'); $('lift-s').setAttribute('aria-pressed', lift === 's'); $('jrow').hidden = lift === 's';
    for (const j of ['split', 'power', 'squat']) $('jk-' + j).setAttribute('aria-pressed', j === jerk);
    $('liftname').textContent = LIFT_NAME[lift]; $('attempt').textContent = `Intento ${attempt}`;
  }
  setLoad(kg) { $('kg').textContent = fmt(kg); $('load').value = kg; }
  setPhases(phases) {
    const t = $('ticks'); t.textContent = ''; phases.forEach(() => t.appendChild(document.createElement('i')));
    $('scrub').max = phases.length - 1; this._phaseIdx = -1;
  }
  setToggle(id, on) { $(id).setAttribute('aria-pressed', !!on); }
  setCam(i) { CAMERAS.forEach((_, k) => $('cam-' + k).setAttribute('aria-pressed', k === i)); }
  /** Primer plano activo (ninguna cámara fija queda marcada) o, sin clave, la cámara fija `cam`. */
  setShot(key, cam = 0) { $('shot').value = key || ''; this.setCam(key ? -1 : cam); }
  setQuality(sel, actual) { $('quality').value = sel; $('quality').options[0].textContent = `Calidad: auto (${actual})`; }
  setReplay(on) { $('replay').hidden = !on; $('live').hidden = !!on; }
  setDecision(d) {
    [...$('lamps').children].forEach((el, i) => { el.className = d ? (d[i] ? 'w' : 'r') : ''; });
    $('verdict').hidden = !d; if (d) $('verdict').textContent = d.filter(Boolean).length >= 2 ? 'Levantamiento válido' : 'Levantamiento nulo';
  }
  setClock(s) { const v = Math.max(0, Math.ceil(s)), txt = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; if (txt !== this._clock) $('clock').textContent = this._clock = txt; }
  /** Actualiza fase y lecturas. r: {name,index,lean,hip}, barCm, vel (m/s), p (posición de fase), peak (m/s), t (s reales). */
  update(r, barCm, vel, p, peak = 0, t = 0) {
    if (r.index !== this._phaseIdx) {
      this._phaseIdx = r.index; $('phase').textContent = r.name;
      [...$('ticks').children].forEach((el, i) => el.classList.toggle('on', i <= r.index));
    }
    const html = `<div>Torso<b>${fmt(r.lean)}<small>°</small></b></div><div>Cadera<b>${fmt(r.hip * 100)}<small>cm</small></b></div><div>Barra<b>${fmt(barCm)}<small>cm</small></b></div><div>Velocidad<b>${fmt(vel, 2)}<small>m/s</small></b></div><div>Vel. máx<b>${fmt(peak, 2)}<small>m/s</small></b></div><div>Tiempo<b>${fmt(t, 2)}<small>s</small></b></div>`;
    if (html !== this._nums) $('nums').innerHTML = this._nums = html;
    $('scrub').value = p;
  }
  dispose() { removeEventListener('keydown', this._key); }
}
