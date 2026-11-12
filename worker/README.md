# Worker de Tarima

Un solo Worker de Cloudflare que:

- sirve `web/` como sitio estático (`/` muestra `juego.html`);
- lleva la cuenta de las finales gratis en el servidor (`/api/estado`, `/api/partida`), por dispositivo y por IP con HMAC;
- guarda la lista de espera (`/api/anotar`) con consentimiento, confirmación por mail y baja de un clic (`/baja`, `/confirmar`, `/api/baja`);
- registra el desbloqueo por encuesta (`/api/encuesta`) y manda las respuestas a PostHog;
- hace de proxy de PostHog en `/qx/*`, para que los bloqueadores no corten las métricas;
- limpia la base una vez por día (Cron).

El contrato completo está en `docs/MVP.md`, sección 5.5. Más abajo están las diferencias con ese texto.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `wrangler.jsonc` | Configuración: assets, D1 `tarima`, límite de pedidos, Cron, variables. Sin secretos |
| `src/index.js` | Rutas, validación de los pedidos, límites, mails y páginas de baja y confirmación |
| `src/reglas.js` | La regla pura de la cuenta y las validaciones (mail, nombre, encuesta, banderas). Sin `fetch` ni D1 |
| `src/datos.js` | Consultas a D1 y limpieza diaria |
| `src/posthog.js` | Proxy `/qx`, envío de eventos y evaluación de banderas |
| `src/cripto.js` | HMAC, tokens de baja y confirmación, pase de cada final |
| `src/textos.js` | Textos de mails y páginas, en español y en inglés |
| `src/descartables.js` | Lista corta de dominios de mail descartable |
| `migraciones/0001_inicial.sql` | Las tablas (es el `schema.sql` del contrato) |
| `test/worker.test.js` | Pruebas de la API, D1, proxy, mails y limpieza, dentro del runtime de Workers |
| `../tools/worker_test.mjs` | Prueba de la regla pura en Node, sin Cloudflare |

## Pruebas

No hace falta cuenta de Cloudflare ni internet: todo corre en Miniflare y las salidas a la red (DNS, PostHog) se reemplazan por respuestas fijas.

```bash
cd worker
npm ci                       # la primera vez
npm test                     # 36 pruebas en el runtime de Workers (vitest + @cloudflare/vitest-plugin)
npm run test:reglas          # 127 controles de la regla pura en Node (igual a: node tools/worker_test.mjs)
```

Para probar el juego contra el Worker en la máquina (opcional, levanta un servidor):

```bash
cp dev.vars.ejemplo .dev.vars
npx wrangler d1 migrations apply tarima --local
npx wrangler dev             # http://localhost:8787
```

## Pasos del dueño para publicar

Este trabajo no inició sesión ni desplegó nada. Estos pasos los hace el dueño, o el orquestador con su permiso explícito. Todos los comandos se corren dentro de `worker/`.

1. **Iniciar sesión.**
   ```bash
   cd worker && npm ci
   npx wrangler login
   npx wrangler whoami
   ```
2. **Crear la base D1** y copiar el `database_id` que devuelve en `wrangler.jsonc`, en lugar de `00000000-0000-0000-0000-000000000000`. El id no es un secreto y se puede commitear.
   ```bash
   npx wrangler d1 create tarima
   npx wrangler d1 migrations apply tarima --remote
   ```
3. **Dominio propio.** Las métricas no pasan los bloqueadores en `*.workers.dev`. Con el dominio ya en Cloudflare, agregar a `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "tudominio.com", "custom_domain": true }]
   ```
4. **Desplegar.**
   ```bash
   npx wrangler deploy
   ```
5. **Cargar los secretos.** Cada `secret put` publica una versión nueva. El valor entra por la entrada estándar: no queda en el historial de la terminal ni en el repo.
   ```bash
   for s in SECRETO_IP SECRETO_DISPOSITIVO SECRETO_PASE SECRETO_BAJA; do openssl rand -hex 32 | npx wrangler secret put $s; done
   node -e 'process.stdout.write(require(process.env.HOME + "/tarima-datos/posthog.json").posthog_project_key)' | npx wrangler secret put POSTHOG_KEY
   ```
   Sin los cuatro secretos, la API responde 503 y el juego pasa a «sin servidor». Sin `POSTHOG_KEY`, las métricas quedan apagadas.
   No cambiar `SECRETO_DISPOSITIVO` ni `SECRETO_IP` después de abrir: cambiarlos vuelve a dar finales gratis a todos. Si cambia `SECRETO_BAJA`, los links de baja y de confirmación que ya se mandaron dejan de servir.
6. **Exportar la lista** (opcional). Primero se carga la clave, de 24 caracteres o más:
   ```bash
   openssl rand -hex 24 | tee /dev/tty | npx wrangler secret put EXPORTAR_CLAVE
   ```
   Después se baja el CSV. `?confirmados=1` deja solo los mails confirmados:
   ```bash
   curl -H "Authorization: Bearer <la clave>" "https://tudominio.com/api/exportar?confirmados=1" -o lista.csv
   ```
   Sin esa clave, `/api/exportar` responde 404.
7. **Mails de confirmación y baja** (Email Sending):
   ```bash
   npx wrangler email sending enable tudominio.com
   ```
   - Configurar SPF, DKIM y DMARC.
   - En `wrangler.jsonc`, sacar el comentario de `"send_email": [{ "name": "EMAIL" }]` y poner `"MAIL_DESDE": "hola@tudominio.com"`.
   - Desplegar otra vez.

   Sin Email Sending, las altas se guardan igual (`confirmar: false`), pero sin confirmar se borran a los 30 días. Conviene activarlo antes de abrir el muro.
8. **PostHog** (proyecto 606461, US Cloud):
   - Activar «Discard client IP data» y aceptar el DPA.
   - Crear las banderas `muro-partidas-gratis` (variantes `1` y `2`, con `2` al 100 %), `muro-texto` (`a` y `b`, con `a` al 100 %), `invitacion-podio1` (booleana, prendida) y `grabacion` (variantes `off` y `muestra`, con `off` al 100 %).
   - Crear una encuesta de tipo **API** con las 5 preguntas de `docs/MVP.md` 4.5. Las opciones van con el texto en español, exactamente como en `ENCUESTA` de `src/reglas.js`.
   - Poner su id en `"ENCUESTA_ID"` y los ids de las preguntas en `"ENCUESTA_PREGUNTAS"` (por ejemplo `{"q1":"<uuid>","q2":"<uuid>","q3":"<uuid>","q4":"<uuid>","q5":"<uuid>"}`), en `wrangler.jsonc`, y desplegar.
   - Sin eso, el desbloqueo por encuesta funciona igual, pero las respuestas no llegan a PostHog.
9. **Probar en producción:**
   - `curl -s https://tudominio.com/ | head` muestra `juego.html`.
   - En el juego, jugar dos finales, ver el muro, borrar los datos del sitio y comprobar que después de 6 finales en la misma red vuelve el muro.

Para ver los registros: `npx wrangler tail` o la pestaña Logs del Worker. No llevan mail, IP ni dispositivo.

## Diferencias con `docs/MVP.md` 5.5 (para quien conecta el juego)

- **Carpeta.** El Worker vive en `worker/`, como dice el contrato. La tarea mencionaba `servidor/`, pero se respetó el contrato porque el resto del documento apunta ahí.
- **Límites largos en D1.** El límite de pedidos de Workers solo admite ventanas de 10 o 60 segundos. Entonces:
  - `LIMITE` (40 pedidos cada 10 s por código de IP) frena las ráfagas.
  - Los límites de 10 minutos y de 1 hora del contrato se cuentan en la tabla `limites` de D1, con ventana fija. La limpieza diaria borra las filas vencidas.
  - Pasado cualquiera de los dos límites, la respuesta es 429 `{error:'limite'}`.
- **Tokens de baja y de confirmación.** Tienen la forma `<lista_id>.<firma>`. La firma son 40 caracteres hex de `HMAC(SECRETO_BAJA, id)` en la baja y de `HMAC(SECRETO_BAJA, id + 'c')` en la confirmación. El id va adelante para encontrar la fila sin recorrer la tabla. El link que llega por `/api/baja` lleva además `&v=f`, para que el evento `baja` diga `via: 'formulario'`.
- **`/baja`.**
  - Con GET, muestra el botón.
  - Con POST, da de baja. Acepta el token en la URL (el «un clic» del RFC 8058, con cuerpo `List-Unsubscribe=One-Click`) o en el formulario.
  - No pide `Origin`, porque lo mandan los proveedores de correo.
- **`/confirmar`.** Igual que la baja: GET muestra el botón «Sí, confirmar» y POST (con `t` en el formulario o en la URL) confirma. Así un escáner de links no confirma un mail que anotó otra persona.
- **Límite de `/baja` y `/confirmar`.** Solo cuentan los tokens que no valen (10 por hora por IP). Un token válido nunca recibe 429: los proveedores de correo mandan la baja de un clic desde pocas IP compartidas.
- **`/api/anotar` con un mail que ya estaba.**
  - Para un dispositivo que no estaba ligado a ese mail, la respuesta es la misma que un alta nueva (`estado: 'nuevo'`, el mismo `confirmar`), para no revelar quién está en la lista. `ya_estaba` solo vuelve si ese mismo dispositivo ya estaba ligado.
  - Sale un mail, como mucho uno por día por dirección: otra vez la confirmación si todavía no se confirmó, o el aviso «Ya estás en la lista» si ya se confirmó.
  - No se toca nada de lo guardado: ni el consentimiento ni `novedades`. En el MVP no se verifica la propiedad del mail, así que un tercero no puede anotar a nadie en las novedades.
- **Banderas y `GRATIS`.** En D1 solo se guarda lo que PostHog asignó. Mientras la bandera `muro-partidas-gratis` no exista o no responda, manda la variable `GRATIS`, y su valor por defecto nunca queda pegado.
- **Limpieza.** Los dispositivos se borran a los 180 días sin jugar, estén o no en la lista (lo que promete la página de privacidad). Quien vuelve después pone el mismo mail y recupera el juego libre.
- **Trampa para bots en `/api/anotar`.** El formulario tiene que llevar un campo escondido `web` (fuera de la vista y con `tabindex=-1` y `autocomplete=off`) que se manda vacío. Si llega con algo, el Worker responde como un alta normal y no guarda nada.
- **Errores extra.**
  - `/api/encuesta` devuelve 400 `{error:'formato'}` si alguna respuesta no es un código válido, si viene «nada» con otra opción o si `q5` pasa de 280 caracteres. Las 4 primeras sin contestar siguen dando `incompleta`.
  - Con `TURNSTILE=1` y un token inválido, la respuesta es 400 `{error:'turnstile'}`.
  - Un `consentimiento` con una versión desconocida cuenta como `aviso`.
  - Los POST sin `Origin` del sitio dan 403 `{error:'origen'}`. Sin JSON dan 415, y con más de 4 KB, 413, las dos con `{error:'formato'}`.
- **`/api/partida` con muro** también devuelve `dispositivo` y `flags`, igual que con `ok`.
- **`quedan`** es `null` para un dispositivo anotado (juego libre) y `0` en el muro. Para los demás es el mínimo entre lo que le queda al dispositivo y lo que le queda a la red.
- **Encuesta de un anotado.** Se guarda con `i = NULL`: no da premio, así que no suma al cupo de la IP ni gasta las 3 encuestas de esa red.
- **`/api/exportar`.** Es un GET con `Authorization: Bearer <EXPORTAR_CLAVE>` y devuelve un CSV. Tiene un límite de 10 pedidos por hora y las celdas van protegidas contra fórmulas.
- **Sin servidor.** El juego tiene que tratar 429, 503 y la falta de red como dice la sección 2 (P4). `?muro=firme` es un ayudante del juego y vive en `web/js`, no en el Worker.

## Qué sigue siendo posible saltear (MVP)

Está explicado en `docs/MVP.md` 7:

- **Otra red.** Cambiar de red (VPN, pasar del wifi a los datos) y borrar los datos da 2 finales más por cada red nueva.
- **Mail ajeno.** Con el mail de otra persona también se desbloquea, porque en el MVP no se verifica la propiedad del mail.
- **Código del juego.** Editar el JavaScript, que es estático, permite jugar sin límite. El pase firmado de `/api/partida` es el gancho para cerrar eso cuando el servidor entregue las semillas de cada final (JUEGO.md 9.6).

El objetivo es el jugador común, que recarga, borra los datos o vuelve otro día: a ese lo frena el servidor.
