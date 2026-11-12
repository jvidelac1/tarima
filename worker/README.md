# Worker de Tarima

Un Worker de Cloudflare, «tarima», **sin dirección pública** (`workers_dev` y `preview_urls` en false, sin rutas), que:

- lleva la cuenta de las finales gratis en el servidor (`/api/estado`, `/api/partida`), por dispositivo y por IP con HMAC;
- guarda la lista de espera (`/api/anotar`) con consentimiento, y tiene la confirmación por correo y la baja de un clic listas para cuando haya envío de correos (`/baja`, `/confirmar`, `/api/baja`);
- registra el desbloqueo por encuesta (`/api/encuesta`) y manda las respuestas a PostHog;
- hace de proxy de PostHog en `/qx/*`, para que los bloqueadores no corten las métricas;
- limpia la base una vez por día (Cron).

El sitio (`web/`) lo sirve **Cloudflare Pages**, proyecto «liftinggame» (https://liftinggame.pages.dev). Las Functions de `../functions/` le pasan al Worker `/api/*`, `/qx/*`, `/baja` y `/confirmar` por una **service binding** (`TARIMA` → `tarima`, declarada en `../wrangler.jsonc`), así todo queda bajo `liftinggame.pages.dev` y la dirección `workers.dev` de la cuenta no aparece en ningún lado. `/` muestra `juego.html`.

```
navegador ──> liftinggame.pages.dev ──┬─ web/ (estático)
                                     └─ functions/  /, /api/*, /qx/*, /baja, /confirmar
                                            │ service binding TARIMA (con x-tarima-ip y x-tarima-pais)
                                            v
                                       Worker «tarima» ── D1 «tarima»
                                                       └─ us.i.posthog.com (proxy /qx, encuesta, banderas)
```

El contrato completo está en `docs/MVP.md`, sección 5.5. Más abajo están las diferencias con ese texto.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `wrangler.jsonc` | Worker: D1 `tarima` (id real), límite de pedidos, Cron, variables, sin dirección pública. Sin secretos |
| `src/index.js` | Rutas, validación de los pedidos, límites, correos y páginas de baja y confirmación |
| `src/reglas.js` | La regla pura de la cuenta y las validaciones (correo, nombre, encuesta, banderas). Sin `fetch` ni D1 |
| `src/datos.js` | Consultas a D1 y limpieza diaria |
| `src/posthog.js` | Proxy `/qx`, envío de eventos y evaluación de banderas |
| `src/cripto.js` | HMAC, tokens de baja y confirmación, pase de cada final |
| `src/textos.js` | Textos de correos y páginas, en español neutro y en inglés |
| `src/descartables.js` | Lista corta de dominios de correo descartable |
| `migraciones/` | Las tablas (`0001_inicial.sql` es el `schema.sql` del contrato; `0002` agrega `lista.confirmar_mandado_en`) |
| `test/worker.test.js` | Pruebas de la API, D1, proxy, correos y limpieza, dentro del runtime de Workers |
| `../wrangler.jsonc` | Proyecto de Pages «liftinggame»: `pages_build_output_dir = ./web` y la service binding `TARIMA` |
| `../functions/` | Functions de Pages: `api/[[ruta]].js`, `qx/[[ruta]].js`, `baja.js`, `confirmar.js` (pasan al Worker) e `index.js` («/» muestra el juego) |
| `../web/js/game/servidor.js` | Cliente del juego: estado, pase, reanudar, lista, encuesta, baja |
| `../web/js/game/analitica.js` | Métricas con posthog-js vendorizado (`../web/vendor/posthog/`), sin cookies |
| `../web/privacidad.html` | Privacidad en los dos idiomas, interruptor de la medición y formulario de baja |
| `../tools/desplegar.sh` | Publicación: Worker, D1 y secretos, después Pages |
| `../tools/worker_test.mjs`, `../tools/servidor_test.mjs`, `../tools/check_analitica.mjs` | Regla pura; cliente, métricas y Functions sin red; métricas y privacidad con navegador |

## Pruebas

No hace falta cuenta de Cloudflare ni internet: todo corre en Miniflare o en Node, y las salidas a la red (DNS, PostHog) se reemplazan por respuestas fijas.

```bash
cd worker && npm ci          # la primera vez
npm test                     # 39 pruebas en el runtime de Workers (vitest + @cloudflare/vitest-plugin)
npm run test:reglas          # 127 controles de la regla pura en Node (igual a: node tools/worker_test.mjs)
node ../tools/servidor_test.mjs   # 105 controles del cliente, las métricas y las Functions, sin red
../tools/desplegar.sh --seco      # todo lo anterior + Worker --dry-run + Functions de Pages, sin tocar la cuenta
```

En GitHub Actions las corre el flujo «Servidor y publicación» (`.github/workflows/servidor.yml`) en cada push a `mvp` que toque el servidor, junto con `check_analitica` en Chrome (métricas sin cookies ni almacenamiento, privacidad a 390 × 844 y 844 × 390).

Para probar el sitio con el Worker en la máquina (opcional; levanta dos procesos, uno para cada lado de la binding):

```bash
cd worker && cp dev.vars.ejemplo .dev.vars
npx wrangler d1 migrations apply tarima --local
npx wrangler dev --port 8787                        # el Worker
cd .. && worker/node_modules/.bin/wrangler pages dev --port 8788   # el sitio, en http://localhost:8788
```

`wrangler pages dev` toma la binding de `../wrangler.jsonc` y se conecta al Worker local (dice `env.TARIMA (tarima) … [connected]`). Probado así el 12 de noviembre: `/` da el juego, `/juego.html` redirige a `/juego`, `/api/estado` responde con la cookie `tdv`, la tercera `/api/partida` da muro y `/baja` con un token malo da 400.

## Publicar

Lo corre el orquestador o el dueño, con permiso explícito. **Nada de esto se corrió todavía.** Primero una sesión de wrangler con acceso a la cuenta:

```bash
cd worker && npm ci && npx wrangler login && npx wrangler whoami
```

Después, desde la raíz:

```bash
tools/desplegar.sh --seco    # pruebas, Worker --dry-run y Functions: no toca la cuenta
tools/desplegar.sh           # publica (pregunta antes de tocar la cuenta; --si para no preguntar)
```

Qué hace, en orden:

1. Comprueba node, openssl, `~/tarima-datos/posthog.json` (la clave `phc_…`, que nunca imprime), la D1 y `workers_dev: false`.
2. Pruebas (`servidor_test`, `worker_test`, `npm test`), Worker `--dry-run` y build de las Functions.
3. `wrangler d1 migrations apply tarima --remote` (la base ya existe: id `9e2c28f3-67de-4cc6-a278-2d0e5f34e055`).
4. `wrangler deploy` del Worker «tarima».
5. Secretos: `SECRETO_IP`, `SECRETO_DISPOSITIVO`, `SECRETO_PASE` y `SECRETO_BAJA` con `openssl rand -hex 32`, **solo si no existen** (cambiarlos después de abrir le devuelve las finales gratis a todos y rompe los enlaces de baja). `EXPORTAR_CLAVE` igual, con una copia en `~/tarima-datos/exportar.clave` (modo 600). `POSTHOG_KEY` desde `posthog.json`, en cada publicación. Todo entra por la entrada estándar de `wrangler secret put`: nada en la terminal, el historial ni el repo.
6. Lee la rama de producción del proyecto de Pages con la API de Cloudflare (o `RAMA_PRODUCCION=…`; si no la encuentra usa `main` y avisa) y corre `wrangler pages deploy web --project-name liftinggame --branch <rama>` desde la raíz, que toma `wrangler.jsonc` y `functions/`.
7. Comprueba `https://liftinggame.pages.dev/`, `/api/estado` (crea un dispositivo de prueba en la base, que se borra solo a los 180 días) y `/privacidad.html`.

Notas:

- **No correr `wrangler pages project create`**: el proyecto ya existe, y en wrangler 4.15x ese comando dentro de `worker/` intenta publicar el Worker.
- Con el archivo `../wrangler.jsonc`, la configuración de Pages (binding, fecha de compatibilidad) pasa a salir del repo: esos campos ya no se editan en el panel.
- Sin los cuatro secretos la API responde 503 y el juego pasa a «sin servidor». Sin `POSTHOG_KEY`, las métricas quedan apagadas.
- Para ver los registros: `cd worker && npx wrangler tail`, o la pestaña Logs del Worker. No llevan correo, IP ni dispositivo.
- **Exportar la lista:** `curl -H "Authorization: Bearer $(cat ~/tarima-datos/exportar.clave)" "https://liftinggame.pages.dev/api/exportar?confirmados=1" -o lista.csv` (sin `?confirmados=1` mientras no haya correos de confirmación).

### Pasos que siguen siendo del dueño

- **PostHog** (proyecto 606461, US Cloud): activar «Discard client IP data» y aceptar el DPA; crear las banderas `muro-partidas-gratis` (variantes `1` y `2`, con `2` al 100 %), `muro-texto` (`a` y `b`, con `a` al 100 %), `invitacion-podio1` (booleana, prendida) y `grabacion` (`off` y `muestra`, con `off` al 100 %); crear una encuesta de tipo **API** con las 5 preguntas, con las opciones en español exactamente como en `ENCUESTA` de `src/reglas.js`, y poner su id en `ENCUESTA_ID` y los ids de las preguntas en `ENCUESTA_PREGUNTAS` (`{"q1":"<uuid>",…}`) en `wrangler.jsonc`. Sin eso el desbloqueo por encuesta anda igual, pero las respuestas no llegan a PostHog. Sin las banderas valen los valores por defecto.
- **Contacto, responsable y país** en `web/privacidad.html` (buscar `data-completar`).
- **Correos** (cuando haya dominio propio): `npx wrangler email sending enable <dominio>`, SPF, DKIM y DMARC, sacar el comentario de `"send_email"` en `wrangler.jsonc`, poner `MAIL_DESDE` y publicar. Mientras tanto ninguna alta se borra por no confirmar (ver abajo).
- **Dominio propio** (opcional): se agrega como dominio del proyecto de Pages. Hoy las métricas van por `liftinggame.pages.dev/qx`; algunos bloqueadores conocen `*.pages.dev`, pero el camino `/qx` no es de PostHog, así que en general pasan.

## Diferencias con `docs/MVP.md` 5.5 (para quien conecta el juego)

- **Carpeta.** El Worker vive en `worker/`, como dice el contrato. La tarea mencionaba `servidor/`, pero se respetó el contrato porque el resto del documento apunta ahí.
- **Pages adelante del Worker** (decisión del dueño, 12-nov). El contrato decía «un solo Worker con assets estáticos»; ahora el sitio lo sirve Pages y el Worker no tiene `assets` ni dirección pública. Si se le diera una carpeta de assets (`env.ASSETS`), la serviría como antes; sin ella, lo que no es suyo da 404.
- **IP y país detrás de la binding.** La Function copia `CF-Connecting-IP` y `request.cf.country` en `x-tarima-ip` y `x-tarima-pais` (pisando lo que mande el navegador), porque no está documentado que pasen intactos por una service binding. El Worker les cree solo con `CONFIAR_PAGES=1`, y eso es seguro porque no tiene dirección pública: si algún día se le agrega una ruta o `workers.dev`, va en `"0"`. El proxy `/qx` los saca antes de salir hacia PostHog.
- **Sin borrado por falta de confirmación mientras no haya correos** (decisión del dueño). La columna `lista.confirmar_mandado_en` (migración 0002) guarda cuándo salió de verdad el primer correo de confirmación, y la limpieza diaria borra solo las altas sin confirmar cuyo correo salió hace más de 30 días. Las altas de antes de activar los correos no se borran nunca por esto.
- **Consentimiento `2026-11-b`.** Es la versión de la privacidad nueva (sin borrado por no confirmar, contacto pendiente, HMAC de la IP explicado). Se acepta también la `2026-11-a`.
- **Sin la frase «Nunca vas a pagar para levantar más»** en las páginas del Worker (decisión del dueño, hasta definir la monetización). Los textos en español usan «correo» y «enlace».
- **Baja desde la privacidad sin correos.** `/api/baja` sigue respondiendo siempre 202 `{}`. Si el dispositivo que pide la baja (cookie `tdv` o `dispositivo` del cuerpo) es el que está ligado a ese correo, la fila se borra enseguida; si no, y hay envío de correos, le llega el enlace. Sin correos, quien se anotó desde otro dispositivo tiene que pedir la baja desde ese o escribir al contacto.
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
- **Bloquear `/api/*` y borrar los datos en cada carga.** El cliente (`web/js/game/servidor.js`) aplica el endurecimiento 1 de `docs/MVP.md` 7: «sin servidor» da una final por carga de página **solo** si el navegador no tenía `tarima.dispositivo` al cargar; con historia, un 429, un 503 o la falta de red no regalan nada (sale un error para reintentar), salvo a un anotado. Así lo que queda abierto es bloquear `/api/*` y además borrar los datos del sitio antes de cada final.
- **Código del juego.** Editar el JavaScript, que es estático, permite jugar sin límite. El pase firmado de `/api/partida` es el gancho para cerrar eso cuando el servidor entregue las semillas de cada final (JUEGO.md 9.6).

El objetivo es el jugador común, que recarga, borra los datos o vuelve otro día: a ese lo frena el servidor.
