// Textos de los correos y de las páginas del Worker (docs/MVP.md 4.5, «Mails y páginas del Worker»), en español neutro
// (decisión del dueño del 12 de noviembre: tuteo, sin voseo; «correo» y «enlace», no «mail» ni «link») y en inglés.
// Sin la promesa pública sobre pagos: queda fuera hasta que el dueño defina la monetización.
import { escHtml } from './reglas.js';

export const TEXTOS = {
  es: {
    'mail.confirmar.asunto': 'Confirma tu lugar en Tarima',
    'mail.confirmar.cuerpo': 'Hola, {nombre}. Toca el botón para confirmar tu lugar en la lista de acceso anticipado de Tarima. Si no fuiste tú, ignora este correo: si no se confirma, borramos tu dirección a los 30 días.',
    'mail.ya.asunto': 'Ya estás en la lista de Tarima',
    'mail.ya.cuerpo': 'Alguien, probablemente tú, escribió este correo en Tarima desde otro dispositivo. Ya estabas en la lista de acceso anticipado: ese dispositivo quedó con juego libre y no cambiamos nada más. Si no fuiste tú, no tienes que hacer nada.',
    'mail.ya.boton': 'Ir a Tarima',
    'confirmar.pregunta': '¿Confirmas tu lugar en la lista de Tarima?',
    'confirmar.boton': 'Sí, confirmar',
    'mail.confirmar.boton': 'Confirmar',
    'mail.pie': 'Recibes este correo porque te anotaste en Tarima. Para darte de baja: {link}',
    'mail.baja.asunto': 'Tu enlace para darte de baja de Tarima',
    'mail.baja.cuerpo': 'Pediste darte de baja de la lista de Tarima. Toca el botón para confirmarlo. Si no fuiste tú, ignora este correo.',
    'mail.baja.boton': 'Darme de baja',
    'nombre.defecto': 'Debutante',
    'confirmado.texto': '¡Listo! Tu lugar está confirmado.',
    'confirmado.volver': 'Volver al juego',
    'baja.pregunta': '¿Te damos de baja de la lista de Tarima?',
    'baja.boton': 'Sí, darme de baja',
    'baja.ok': 'Listo: te dimos de baja y borramos tu correo. Puedes seguir jugando.',
    'baja.token_invalido': 'Ese enlace ya no sirve. Pide uno nuevo desde la página de privacidad.',
    'pagina.limite': 'Demasiados intentos. Prueba de nuevo en un rato.',
    'pagina.error': 'Algo falló. Prueba de nuevo en un rato.',
  },
  en: {
    'mail.confirmar.asunto': 'Confirm your spot in Tarima',
    'mail.confirmar.cuerpo': "Hi {nombre}. Tap the button to confirm your spot on Tarima's early access list. If this wasn't you, just ignore this email: unconfirmed addresses are deleted after 30 days.",
    'mail.ya.asunto': "You're already on the Tarima list",
    'mail.ya.cuerpo': "Someone, probably you, entered this email in Tarima on another device. You were already on the early access list: that device now has unlimited play, and nothing else changed. If this wasn't you, there's nothing you need to do.",
    'mail.ya.boton': 'Go to Tarima',
    'confirmar.pregunta': 'Confirm your spot on the Tarima list?',
    'confirmar.boton': 'Yes, confirm',
    'mail.confirmar.boton': 'Confirm',
    'mail.pie': "You're getting this because you joined Tarima. Unsubscribe: {link}",
    'mail.baja.asunto': 'Your link to leave the Tarima list',
    'mail.baja.cuerpo': "You asked to leave the Tarima list. Tap the button to confirm. If this wasn't you, ignore this email.",
    'mail.baja.boton': 'Unsubscribe me',
    'nombre.defecto': 'Rookie',
    'confirmado.texto': 'Done! Your spot is confirmed.',
    'confirmado.volver': 'Back to the game',
    'baja.pregunta': 'Remove you from the Tarima list?',
    'baja.boton': 'Yes, unsubscribe me',
    'baja.ok': "Done: you're unsubscribed and your email is deleted. You can keep playing.",
    'baja.token_invalido': 'That link no longer works. Request a new one from the privacy page.',
    'pagina.limite': 'Too many tries. Try again in a bit.',
    'pagina.error': 'Something broke. Try again in a bit.',
  },
};

export const t = (idi, clave, vars = {}) => (TEXTOS[idi]?.[clave] ?? TEXTOS.en[clave]).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Idioma preferido de una página: el de la fila de la lista si se conoce, si no Accept-Language.
export function idiomaPagina(request, preferido) {
  if (preferido === 'es' || preferido === 'en') return preferido;
  const al = (request.headers.get('accept-language') || '').toLowerCase();
  return /^\s*es\b/.test(al) ? 'es' : 'en';
}

const CSS = `:root{color-scheme:light dark;--bg:#f6f4ef;--fg:#1b1b1b;--sub:#5d5a54;--ac:#c8102e;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#f1efe9;--sub:#a9a59c;--ac:#ff4d5e;--card:#1f1f1f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:520px;margin:12vh auto;padding:0 16px}.c{background:var(--card);border-radius:14px;padding:28px 24px}
h1{font-size:1.35rem;margin:0 0 16px}p{margin:0 0 16px}.otro{color:var(--sub);font-size:.9rem;margin-top:20px}
button,a.b{display:inline-block;background:var(--ac);color:#fff;border:0;border-radius:10px;padding:12px 20px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.marca{color:var(--sub);font-size:.85rem;margin-top:24px}`;

/**
 * Página bilingüe mínima: el idioma principal arriba y el otro, más chico, debajo.
 * `cuerpo(idi)` devuelve {titulo, html} ya escapado.
 */
export function pagina(idi, cuerpo, { status = 200 } = {}) {
  const otro = idi === 'es' ? 'en' : 'es';
  const a = cuerpo(idi), b = cuerpo(otro);
  const html = `<!doctype html><html lang="${idi}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Tarima · ${escHtml(a.titulo)}</title><style>${CSS}</style></head>
<body><main><div class="c"><h1>${escHtml(a.titulo)}</h1>${a.html}<div class="otro" lang="${otro}"><strong>${escHtml(b.titulo)}</strong>${b.extra ? ' ' + b.extra : ''}</div></div>
<p class="marca">Tarima</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

/** Mail en texto y en HTML con un botón y el pie de baja. */
export function armarMail(idi, { cuerpo, boton, link, baja }) {
  const pie = t(idi, 'mail.pie', { link: baja });
  const text = `${cuerpo}\n\n${boton}: ${link}\n\n--\n${pie}\n`;
  const html = `<!doctype html><html lang="${idi}"><body style="margin:0;background:#f6f4ef;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1b1b">
<div style="max-width:520px;margin:0 auto;padding:32px 16px"><p style="font-weight:700;font-size:20px;margin:0 0 16px">Tarima</p>
<p style="margin:0 0 24px">${escHtml(cuerpo)}</p>
<p style="margin:0 0 32px"><a href="${escHtml(link)}" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 22px">${escHtml(boton)}</a></p>
<p style="font-size:13px;color:#5d5a54;margin:0">${escHtml(t(idi, 'mail.pie', { link: '' }))}<a href="${escHtml(baja)}" style="color:#5d5a54">${escHtml(baja)}</a></p></div></body></html>`;
  return { text, html };
}
