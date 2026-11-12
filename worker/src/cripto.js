// HMAC, tokens y pases con Web Crypto (funciona igual en Workers y en Node 20+).

const enc = new TextEncoder();
const claves = new Map(); // clave importada por secreto (el secreto no es estado de un pedido)

async function clave(secreto) {
  let k = claves.get(secreto);
  if (!k) {
    k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    if (claves.size > 16) claves.clear();
    claves.set(secreto, k);
  }
  return k;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64urlTexto = s => b64url(enc.encode(s));
export const desdeB64urlTexto = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export async function hmacHex(secreto, msg) {
  return hex(await crypto.subtle.sign('HMAC', await clave(secreto), enc.encode(msg)));
}
async function hmacB64(secreto, msg) {
  return b64url(await crypto.subtle.sign('HMAC', await clave(secreto), enc.encode(msg)));
}

// Comparación en tiempo constante: se comparan los SHA-256, así el largo tampoco se filtra.
export async function igualSeguro(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  const u = new Uint8Array(x), v = new Uint8Array(y); let r = 0;
  for (let k = 0; k < u.length; k++) r |= u[k] ^ v[k];
  return r === 0;
}

export function idAzar(bytes = 16) {
  const b = new Uint8Array(bytes); crypto.getRandomValues(b); return hex(b);
}

// d = HMAC(SECRETO_DISPOSITIVO, uuid) e i = HMAC(SECRETO_IP, prefijo)[0..32]
export const codigoDispositivo = (env, uuid) => hmacHex(env.SECRETO_DISPOSITIVO, 'd:' + uuid.toLowerCase());
export const codigoIp = async (env, prefijo) => (await hmacHex(env.SECRETO_IP, 'i:' + prefijo)).slice(0, 32);

// Tokens de la lista: '<id>.<firma>'. La firma es HMAC(SECRETO_BAJA, id) para la baja y HMAC(SECRETO_BAJA, id + 'c')
// para confirmar (docs/MVP.md 5.5); el id va adelante para encontrar la fila sin recorrer la tabla.
export async function token(env, id, tipo) {
  return `${id}.${(await hmacHex(env.SECRETO_BAJA, tipo === 'confirmar' ? id + 'c' : id)).slice(0, 40)}`;
}
export async function leerToken(env, t, tipo) {
  if (typeof t !== 'string' || t.length > 100) return null;
  const m = t.match(/^([0-9a-f]{32})\.([0-9a-f]{40})$/);
  if (!m) return null;
  return (await igualSeguro(t, await token(env, m[1], tipo))) ? m[1] : null;
}

// Pase de una final: v1.<base64url(JSON)>.<HMAC>. En el MVP no es un candado: es el gancho para validar resultados.
export async function pase(env, { d, n, f, ahora }) {
  const cuerpo = b64urlTexto(JSON.stringify({ d: d.slice(0, 12), n, f, exp: ahora + 3 * 3600 }));
  return `v1.${cuerpo}.${await hmacB64(env.SECRETO_PASE, 'v1.' + cuerpo)}`;
}
export async function leerPase(env, p, ahora) {
  const m = typeof p === 'string' && p.match(/^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  if (!(await igualSeguro(m[2], await hmacB64(env.SECRETO_PASE, 'v1.' + m[1])))) return null;
  const datos = JSON.parse(desdeB64urlTexto(m[1]));
  return datos.exp >= ahora ? datos : null;
}
