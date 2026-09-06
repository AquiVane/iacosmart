# HANDOFF — IA de COSMART (ia.cosmart.com.ar)

Actualizado: 2026-09-06. Ya hay un primer scaffolding de código (login + subida de fotos/video/audio a R2, ver sección "Novedades 05/09 (séptima vuelta)" más abajo). Leer todo antes de tocar nada.

## ⚠️ Repo correcto: `AquiVane/iacosmart` (06/09)

Todo el trabajo de este proyecto (código + este mismo handoff) arrancó por error en `AquiVane/ClaudeIA` — un repo que Vaneh NO creó para esto ("no se creó para eso"). El repo correcto, creado por Vaneh específicamente para este proyecto, es **`AquiVane/iacosmart`**. Se migró todo acá (código, `wrangler.toml`, `CLAUDE.md`, este `HANDOFF.md`) el 06/09. **A partir de ahora todo el trabajo va en `iacosmart`, no en `ClaudeIA`.** Los recursos de Cloudflare (KV `IA_USERS`/`IA_SESSIONS`, R2 `cosmart-ia-perfiles`) ya estaban creados en la cuenta real de Vaneh así que esos no cambian, siguen siendo válidos.

## Novedades 05/09 (segunda vuelta, antes de codear nada)

Vaneh pidió que "todo sea gratis" y tiene ya dominio + GitHub + Cloudflare (donde vive el resto de los workers de COSMART). Se le dio esta guía, pendiente de que confirme los dos puntos marcados abajo antes de empezar a construir:

- **Realidad de costos**: Cloudflare (Workers, D1, R2) cubre gratis casi todo — hosting, DB de usuarios/perfiles, storage de fotos/video/audio (R2: 10GB/mes gratis y **sin costo de egress**, clave para servir video). Lo único que Cloudflare NO tiene es GPU para el paso de generación en sí (face-swap/lip-sync/voice-clone) — Workers AI no trae ese tipo de modelo. Para eso hace falta un servicio externo tipo Replicate/fal.ai (pago por uso, centavos por video) o alquiler de GPU (Runpod/Vast.ai) si el volumen crece. Para 2 usuarios (Vaneh + Ger) el costo real esperado es de un par de dólares por mes en el peor caso, no estrictamente $0 — se lo aclaramos así para que no la sorprenda después.
- **⚠️ Rascado de Instagram/TikTok — recomendación: NO construir un scraper, pendiente de confirmación de Vaneh.** Aunque la idea de "solo su propio perfil, detectable porque ya subió 50-100 fotos" es una buena idea de control antifraude, scrapear de forma automatizada viola los ToS de Instagram/TikTok igual sea perfil propio o ajeno — para 2 usuarios no vale la pena el riesgo legal ni el mantenimiento (se rompe cada vez que la plataforma cambia el HTML). Alternativa propuesta: subida manual de archivos que cada uno ya puede descargar de su propia cuenta (Instagram/TikTok lo permiten nativamente) — mismo resultado, sin scraper. **Si Vaneh insiste en el scraper, hay que retomar esta conversación antes de construir nada ahí.**
- **Cantidad de fotos/video/audio recomendada** (para lograr parecido fiel, no una cara genérica): 30-50 fotos variadas (ángulos/luz/expresión distintos, más importa la variedad que la cantidad), 3-5 clips de video de 15-60 seg hablando de frente (esto es lo que más ayuda a no "cambiar la cara", captura gestos/movimiento que una foto no tiene), 5-10 min de audio limpio para clonar voz.
- **DNI + términos de uso (antifraude/legal)**: idea validada por Vaneh, pero **se recomienda implementarlo recién cuando haya usuarios externos**, no para Vaneh/Ger ahora (ellos se conocen, no hace falta la fricción). Cuando se implemente: el DNI es dato personal sensible bajo ley argentina de protección de datos, va a necesitar manejo más cuidadoso que una foto común (cifrado, acceso restringido) — dejarlo diseñado pero no es parte del MVP.
- **Modelo de usuarios confirmado**: rol **admin** (Vaneh como creadora, Ger) = storage y generaciones sin límite. Rol **user** (futuros registros externos, van a pagar) = con límites. Cada persona con su login/sesión propia, perfiles nunca compartidos.
- **Cómo pensar los límites/planes futuros**: el storage de entrada (fotos/audio/video) NO es el cuello de botella (R2 gratis alcanza de sobra, un perfil pesa ~500MB-1GB). El costo real que escala es la **generación (GPU)** — por eso los planes pagos futuros deberían armarse alrededor de "cuántos videos podés generar por mes" (+ retención de los generados, ej. se borran a los 30 días si no se bajaron), no de gigas de storage. Precio pensado para ser muy barato y masivo, no premium.

**Antes de empezar a construir código, falta que Vaneh confirme**: (1) subida manual en vez de scraper de RRSS, (2) dejar DNI/verificación para más adelante. Con eso confirmado, el siguiente paso lógico es: login de 2 usuarios (Vaneh/Ger) + subida de fotos/video/audio a R2.

## Novedades 05/09 (tercera vuelta) — CONFIRMADO: los 2 puntos pendientes de arriba, más decisión de arquitectura clave

- ✅ **Vaneh confirmó los 2 puntos pendientes**: nada de scraper de IG/TikTok, y DNI queda para cuando haya usuarios externos.
- **Volumen real de uso aclarado por Vaneh**: cada admin (ella, Ger) va a generar **6-7 videos/día, 30 días/mes** (~180-210 videos/mes por persona), de 40seg-1min, esa cifra diaria ya incluye reintentos/correcciones. Esto cambió la cuenta de costos por completo respecto a lo estimado en la vuelta anterior (que asumía uso ocasional).
- **⚠️ DECISIÓN DE ARQUITECTURA: generación propia sobre GPU alquilada, NO un servicio pago-por-uso de terceros (HeyGen/D-ID/Synthesia/Tavus).** Motivo, con números reales (investigados 05/09, van a cambiar con el tiempo — revalidar antes de comprometerse):
  - Servicio de terceros (HeyGen, el más barato de los grandes): **$1-4 por minuto de video generado**. A este volumen (~400 min/mes combinados entre Vaneh y Ger) sale **$400-1.600/mes**. Inviable.
  - GPU alquilada (Runpod, RTX 4090 community cloud: $0,34/hora) + modelo open source propio: los modelos que existen hoy para esto (Hallo2, LivePortrait, MuseTalk, OmniHuman — ninguno corre en tiempo real, tardan 3-10x la duración del video en procesar) dan un costo de **2-6 centavos de dólar por video**. A este volumen: **~$10-70/mes combinado entre las dos**. 20 a 100 veces más barato.
  - Son estimaciones (no se probó ningún modelo todavía), pero la diferencia de orden de magnitud es tan grande que la decisión no depende de afinar el número.
  - **Pendiente crítico antes de elegir el modelo concreto**: revisar la licencia de cada uno (SadTalker/LivePortrait/MuseTalk/Hallo2/etc.) — varios tienen licencia "solo investigación/no comercial", y esto eventualmente va a ser un servicio pago a terceros, así que hay que elegir uno cuya licencia lo permita (o aceptar el riesgo conscientemente).
  - Usar el modelo elegido vía **Runpod Serverless** (o equivalente) para pagar solo por segundo de cómputo real usado, sin costo cuando está inactivo — coincide con el pedido de Vaneh de que sea "pago por uso" aunque el que lo construya seamos nosotros.
- **✅ Previsualización antes de generar el video completo — requisito aceptado.** Antes de correr la generación completa (cara/voz final), generar un preview rápido y barato (pocos frames o los primeros 2-3 segundos, menos pasos/calidad) para que la persona vea que no salió deforme antes de gastar el costo completo. Reduce directamente el volumen de "correcciones" que ya está contado en las 6-7 generaciones/día.
- **Fuente de fotos/video vs. análisis de contenido — son DOS features distintas, no una:**
  1. **Fotos/video para el perfil (la cara)**: siguen siendo archivos descargados por la persona desde su propio celular/cuenta (no capturas de pantalla — pierden calidad, y la calidad de imagen importa para el parecido). Queda pendiente redactar un instructivo corto de cómo bajar tus propias fotos/videos de Instagram/TikTok, con nota de revisarlo cada tanto porque las apps cambian de interfaz.
  2. **Capturas de pantalla del perfil completo + estadísticas de los últimos 90 días** (full page, imagen o PDF): idea nueva de Vaneh, 100% legal (la persona capturando su propia pantalla, sin automatización). No es para entrenar la cara — es para que la IA entienda qué tipo de contenido/formato/tono ya le funciona a esa persona y lo tenga en cuenta al generar guiones/videos. Feature separada, a diseñar.
  - **Fase 2, no bloquea el arranque**: evaluar las APIs oficiales de Instagram (Graph API de Meta) y TikTok — ambas permiten en modo desarrollo/sandbox que un puñado de cuentas designadas a mano (exactamente el caso: Vaneh y Ger sobre sus propias cuentas) accedan a sus propios datos/estadísticas sin pasar por la revisión pública de la app. Si funciona como se espera, podría reemplazar las capturas manuales de estadísticas con datos reales vía API, sin curro legal. Requiere integrar OAuth de cada plataforma — no es parte del MVP.
- **Automatización de límites según plan pagado (para cuando haya usuarios externos pagos)**:
  - Suba de plan de un usuario: vía webhook del medio de pago (Mercado Pago, ya usado en el resto del ecosistema COSMART) — al confirmarse el pago se actualiza el límite en la base al toque, sin intervención manual. Si el usuario está generando algo en ese momento, no se corta.
  - Infra propia (Cloudflare): con tarjeta cargada y plan pago activado, el excedente sobre el nivel gratis se cobra automático todos los meses — no hay paso de "factura y pagás a mano" que pueda frenar el servicio.
- **Cantidad y variedad de fotos/video/audio — versión ampliada, para usar como copy de onboarding en la app**:
  - Fotos (30-50): importa la **variedad de condiciones** (ángulo: frente/3-4/perfil; luz: natural/interior/contraluz; expresión: neutra/sonriendo/hablando; distancia: primer plano/medio cuerpo/cuerpo entero) mucho más que la cantidad — 25 fotos variadas enseñan más que 50 casi iguales.
  - Video (3-5 clips, 15-60seg): aporta variedad de **movimiento** (gestos, giros de cabeza, parpadeo) que una foto fija no puede dar — es la parte que más ayuda a evitar el efecto "cara rara" que Vaneh reportó en otras herramientas.
  - Audio (5-10 min): variedad de **tono/emoción** (no monótono) para que la voz clonada suene natural en guiones de distinto ánimo.

## Novedades 05/09 (cuarta vuelta) — Vaneh confirmó TODO lo de la vuelta anterior + 2 preguntas nuevas resueltas

Confirmado por Vaneh: nada de servicio de terceros ($400-1600/mes es descartado sin discusión), construir generación propia 100%, punto 3 completo (capturas + fase 2 de APIs oficiales) aprobado tal cual, DNI para más adelante confirmado de nuevo.

- **✅ MODELO ELEGIDO PARA EMPEZAR: `daVinci-MagiHuman`** (Sand.ai + Shanghai Jiao Tong University, 2026) — **Apache 2.0, sin restricción de uso comercial**. Hace exactamente lo que necesitamos: foto + audio/texto → video con labios sincronizados y audio, en un solo modelo. Dato de velocidad publicado: 5 seg de video generados en 2 seg de cómputo en una H100 (más rápido que tiempo real) — si se sostiene en la práctica, el costo baja a **~2 centavos de dólar por video de 1 minuto**, mejor que la estimación anterior. Incluye módulo de super-resolución propio para subir calidad. Repo nuevo (2026), así que **antes de construir el pipeline completo hay que hacer una prueba chica en Runpod** (unos pocos videos) para validar calidad real y estabilidad — no asumir que el paper/blog se cumple 1:1 en producción.
  - **Plan B si falla la prueba**: `Hallo2` (fudan-generative-vision, MIT, ICLR 2025) — más lento/pesado (difusión completa) pero mucho más probado en producción por otros.
  - **Descartados**: LivePortrait (el código es MIT pero depende de InsightFace, que prohíbe uso comercial — se podría reemplazar por MediaPipe pero es trabajo extra, no vale la pena como primera opción); MuseTalk (licencia sí permite comercial, pero necesita un video "guía" de referencia para el movimiento, no arranca de una sola foto — caso de uso distinto); OmniHuman de ByteDance (el que Vaneh había mencionado como "el de los chinos" en la charla inicial) — **no es de código abierto**, solo existe como API paga, descartado por completo para self-hosting.
- **✅ Resuelto: qué pasa si falla un pago (pregunta de Vaneh, que no tiene tarjeta de crédito y depende de efectivo)**. Son dos facturas distintas con comportamiento distinto:
  - **Runpod (el gasto de generación/GPU)**: es **saldo prepago** — se carga plata antes de generar y se va descontando. No hay cobro recurrente que pueda "rechazarse" — si el saldo llega a $0, simplemente se pausan las generaciones nuevas hasta cargar de nuevo, sin deuda ni corte para nadie de forma abrupta. Compatible con depender de efectivo: se carga con tarjeta prepaga/débito o transferencia, cuando haya plata disponible.
  - **Cloudflare (hosting, hoy muy por debajo del límite gratis)**: es suscripción con tarjeta. Si el cobro falla, reintenta 5 veces en 5 días y si no entra, **baja automáticamente al plan gratis** (no borra ni corta el sitio, solo pierde las funciones pagas hasta que se resuelva).
  - **Solución para ambos, dado que Vaneh no tiene tarjeta de crédito real**: usar una **tarjeta prepaga/virtual** (Mercado Pago Mastercard prepaga, Ualá, Brubank, Naranja X — todas cargables con efectivo/transferencia) — funcionan igual que una tarjeta común para estos cobros, no hace falta que sea "de crédito". Mantener un colchón cargado evita cualquier corte. Hoy este riesgo es prácticamente nulo porque el volumen actual ni se acerca al límite gratis de Cloudflare — se deja resuelto de antemano para cuando crezca.

**Siguiente paso**: prueba chica de `daVinci-MagiHuman` en Runpod para validar calidad/velocidad real, en paralelo con el scaffolding de login (Vaneh/Ger) + subida de fotos/video/audio a R2.

## Novedades 05/09 (quinta vuelta) — corregido malentendido clave + candidato chino evaluado

- **⚠️ Malentendido aclarado, importante para no repetirlo**: Vaneh en un momento entendió "usar un modelo open source auto-hospedado" como "depender de un tercero" (tipo Social Boots). Se le aclaró la diferencia: un modelo Apache 2.0/MIT que bajamos y corremos en NUESTRA GPU con NUESTRO código es nuestro para siempre (sin API, sin dependencia de que otra empresa siga existiendo o nos cobre) — lo opuesto a llamar a un servicio pago de terceros. Entrenar una red desde cero sin ningún componente pre-entrenado (lo que ella pedía literalmente al principio) fue descartado por Vaneh una vez que entendió el costo real (los labs que hicieron estos modelos gastaron cientos de miles a millones de dólares y meses/años de equipo) — **confirmado: partimos de un modelo base open source y hacemos nosotros el fine-tuning con las fotos/videos de cada perfil**, que es la parte que de verdad soluciona la fidelidad y es 100% nuestra.
- **Prioridad para usuarios pagos si el saldo de Runpod escasea**: confirmado por Vaneh — un usuario que ya pagó nunca tiene que quedar bloqueado por falta de saldo de la cuenta. Diseño: auto-recarga de Runpod configurada (recarga sola al bajar de un umbral, con la tarjeta prepaga cargada con lo recaudado de pagos) + cola/prioridad interna que sirve primero a quien ya pagó si alguna vez el saldo compartido escasea. Vaneh entendió y aceptó que sin saldo cargado en Runpod no hay generación (es prepago) — la auto-recarga es lo que hace que en la práctica no tenga que pensar en esto día a día.
- **Candidato chino evaluado por pedido de Vaneh ("elegí el más avanzado")**: `Wan2.2-S2V` (Alibaba, ago 2025) — Apache 2.0, foto+audio→avatar actuando/hablando (portrait/busto/cuerpo completo), rankeado como el mejor modelo de video open-weight en benchmarks independientes de 2026. **PERO es mucho más pesado**: la ficha oficial pide GPU de 80GB (clase A100/H100, no la RTX4090 barata) y ~4 min de esa GPU por cada 5 seg de video generado — estimado **~$2 por video de 1 minuto**, es decir **~$900/mes combinado** al volumen de Vaneh (200 videos/mes/persona). Esto anula la ventaja de costo que buscamos, quedaría en el mismo orden que los servicios de terceros ya descartados.
  - También evaluado `HunyuanVideo-Avatar` (Tencent, mayo 2025): corre en solo 10GB de VRAM (mucho más barato), pero genera como máximo 14 seg de audio por corrida — para videos de 40seg-1min haría falta generar en tramos y encadenarlos (viable, pero más trabajo de pipeline).
  - **Decisión pendiente, no cerrada**: hacer una prueba comparativa chica (Wan2.2-S2V vs HunyuanVideo-Avatar vs daVinci-MagiHuman) con casos reales antes de comprometerse a uno — el objetivo es ver si la calidad de Wan2.2-S2V justifica pagar ~40-100x más por video, o si un modelo liviano ya resuelve el problema de "cara distorsionada" que motivó todo el proyecto. **Todavía no se hizo ninguna prueba real, todo esto son estimaciones de ficha técnica/benchmarks de terceros.**

**Siguiente paso actualizado**: correr la prueba comparativa de los 3 modelos candidatos en Runpod (calidad real + costo real), en paralelo con el scaffolding de login (Vaneh/Ger) + subida de fotos/video/audio a R2.

## Novedades 05/09 (sexta vuelta) — Vaneh no tiene plata ahora mismo: prueba gratis con demos públicas

Vaneh avisó que no tiene plata disponible ahora para pagar Runpod y correr la prueba comparativa. Solución encontrada: **los 3 modelos candidatos ya tienen demo pública gratis online, sin necesidad de alquilar GPU**:

- **Wan2.2-S2V**: demo oficial de Alibaba en `huggingface.co/spaces/Wan-AI/Wan2.2-S2V` — subís foto + audio, genera el video ahí mismo.
- **daVinci-MagiHuman**: demo oficial en `huggingface.co/spaces/SII-GAIR/daVinci-MagiHuman`.
- **HunyuanVideo-Avatar**: **no tiene demo oficial de Tencent** — solo espacios de la comunidad (ej. `rahul7star/Hunyuan-Avatar`, `VIDraft/Wan2GP`), que son de terceros no oficiales. Recomendado probarlo con una foto de prueba (no la cara real de Vaneh/Ger) si se usa, o dejarlo afuera de esta primera ronda de comparación.

**Aclaración importante para no confundir resultados**: estas demos muestran el modelo **genérico, sin el fine-tuning con las fotos propias de cada perfil** — el resultado final del proyecto (una vez hecho el ajuste fino) debería ser mejor que lo que se vea acá. Sirve igual para descartar de entrada el que se vea peor o más deforme.

También encontrado como opción para cuando haga falta probar código propio (no solo las demos): **Modal.com da $30/mes gratis en crédito de cómputo** (~12hs de GPU clase A100), sin poner un peso.

**Pendiente**: que Vaneh (o Ger) prueben Wan2.2-S2V y daVinci-MagiHuman con la misma foto/audio en las demos oficiales y comparen resultado, antes de gastar nada en Runpod.

## Novedades 05/09 (séptima vuelta) — primer scaffolding real: login + subida a R2, y branding definido

### Branding — NO usar la estética estándar de COSMART

⚠️ **Pedido explícito de Vaneh: el visual de este proyecto NO tiene que parecerse a COSMART "de fábrica".** La referencia más cercana que dio es **MPG** (`mpg.cosmart.com.ar`), pero quiere una mezcla entre ese branding y el de COSMART, no una copia de MPG tampoco.

Se investigó el código real (no se inventó nada):
- **MPG**: paleta verde-menta/turquesa (`--verde:#3EC0A8`, fondo oscuro `#0d2e29`, fondo claro `#f0faf8`), tipografías **DM Sans** (texto) + **Bricolage Grotesque** (títulos/botones), botones redondeados — estética "producto de IA moderno".
- **COSMART madre** (cosmart.com.ar, ej. `auditoria-de-marketing.html`): paleta navy (`#091C47`/`#0D2B6B`) + celeste (`#3A8FC7`) + rojo (`#E02020`), más corporativo.

**Decisión inicial** (superada, ver "Novedades 06/09" más abajo con la paleta final confirmada): estructura/tipografías/botones redondeados de MPG (DM Sans + Bricolage Grotesque) + navy/celeste de COSMART como color principal, con el rojo de COSMART reservado solo como acento de error/alerta.

### Recursos de Cloudflare creados (vía API, cuenta real de Vaneh)

- KV `IA_USERS` (id `1c71e0ffa3ec42b08718c595f8beae32`) — cuentas de usuario.
- KV `IA_SESSIONS` (id `a82cdf114eeb431ea6e310c8da8629e3`) — tokens de sesión, TTL nativo de 30 días.
- R2 `cosmart-ia-perfiles` — fotos/videos/audios de cada perfil.
- Worker todavía **NO desplegado** — el código está en este repo (`src/index.js`, `wrangler.toml`) pero falta correr el deploy (ver pendientes abajo). Nombre elegido para el worker: `cosmart-ia`.

No se creó base de datos D1 — se decidió usar solo KV (mismo patrón ya probado en `marketing-hub`/`euforia-worker`: password hasheado con HMAC-SHA256+salt, sesión con Bearer token) porque alcanza de sobra para 2 usuarios y es consistente con el resto del ecosistema. Si más adelante hace falta trackear cuotas/generaciones de forma más relacional (usuarios pagos externos), ahí sí conviene sumar D1 — no es necesario todavía.

### Qué hace el código actual

- `POST /api/setup` — crea una cuenta (protegido por `SETUP_SECRET`, pensado para las 2 cuentas iniciales de Vaneh/Ger, no es un registro público).
- `POST /api/login` / `POST /api/logout` / `GET /api/me` — auth con Bearer token.
- `GET /api/archivos`, `POST /api/archivos` (multipart, campos `tipo` + `archivo`), `GET /api/archivos/:id/contenido`, `DELETE /api/archivos/:id` — cada usuario solo ve/sube/borra sus propios archivos, **incluso entre dos admins nunca se comparte el perfil** (regla ya acordada).
- Frontend: `login.html`, `perfil.html` (3 secciones: fotos/videos/audios, con el copy de cantidad/variedad ya definido en las vueltas anteriores de esta charla), `index.html` (redirect según haya sesión guardada).
- El Worker sirve tanto la API (`/api/*`) como los archivos estáticos de `public/` (usando el binding `[assets]` de Wrangler) — un solo deploy, sin repo de frontend separado.

### Pendientes para que esto funcione en producción (ninguno hecho todavía)

1. **Configurar secrets del repo en GitHub** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) para que corra `.github/workflows/deploy.yml` — puede que Vaneh ya los tenga cargados a nivel organización desde `cosmart-workers`, verificar antes de pedírselos de nuevo.
2. **Cargar el secret `SETUP_SECRET`** en el Worker (`wrangler secret put SETUP_SECRET`) — un string random que solo Vaneh/Ger conocen, para poder crear las 2 cuentas iniciales sin que nadie más pueda crear cuentas.
3. **Disparar el deploy** (`workflow_dispatch` en GitHub Actions, mismo mecanismo manual que `cosmart-workers`).
4. **Crear las 2 cuentas** llamando a `POST /api/setup` una vez por persona (con `rol: "admin"` para ambas) — nunca commitear las contraseñas reales a git.
5. **Apuntar el dominio** `ia.cosmart.com.ar` al Worker `cosmart-ia` (custom domain en Cloudflare).
6. ~~Revisar el branding una vez desplegado~~ — **hecho, ver "Novedades 06/09" abajo, ya confirmado por Vaneh y aplicado a los archivos reales.**

**Siguiente paso**: seguir en paralelo con la prueba comparativa de modelos (demos gratis) mientras se van resolviendo estos pendientes de infraestructura (puntos 1-5 arriba, ninguno hecho todavía).

## Novedades 06/09 — Branding final CONFIRMADO por Vaneh, ya aplicado a `login.html`/`perfil.html`

Se iteró en vivo con Vaneh sobre una vista previa publicada como Artifact (login + perfil con datos de ejemplo) hasta llegar a la combinación que le encantó. **Paleta final, ya en el código real:**

- `--navy: #0a1a40` — el navy MÁS OSCURO que existe en el código real de COSMART (no el que se había usado al principio, `#091C47`; este es más oscuro todavía, sacado de los gradientes de sección de `cosmart/auditoria-de-marketing.html`). Fondo general de las pantallas y del header de "Mi perfil".
- `--verde: #62B89F` / `--verde-d: #408E77` (más oscuro, para texto) — **el verde real de MPG NO es el `#3EC0A8` de las variables CSS del sitio** (eso es solo un acento de UI) — es el color del **logo real** de MPG (el pin con la "G"), extraído directo del PNG embebido en `mpg/index.html`. Usado en: botón "Ingresar", isotipo, título "COSMART IA", labels, texto de los inputs, headings de las tarjetas, contador de archivos.
- `--celeste-pastel: #D3E6F0` — celeste bien clarito derivado del celeste real de COSMART (`#3A8FC7`), usado como fondo de: la tarjeta completa del login (no solo los inputs — primer intento equivocado), y las 3 tarjetas de "Mi perfil" (intro + fotos/videos/audios).
- Los inputs del login son blancos (`#fff`) con texto verde-d — quedan como elemento diferenciado dentro de la tarjeta celeste.
- **Footer nuevo** (login no lo tiene, solo "Mi perfil"): fondo `#06122e` (más oscuro incluso que el `--navy`, tomado de la barra de "vista previa" del mockup), con el logo real de COSMART (`img/logo-cosmart.png`) + link a `www.cosmart.com.ar`.

**Proceso de esta sesión, por si se repite el patrón**: Vaneh corrige de a un elemento por vez viendo la vista previa real (nunca a ciegas por descripción de texto) — cuando algo "no le cierra", mejor preguntarle con opciones concretas (¿esto, esto, o esto?) que adivinar de nuevo, ya se erró 2-3 veces seguidas en esta sesión antes de acertar con preguntas puntuales. Cuando dice "está en el repositorio", literal hay que ir a buscar el valor exacto en el código/logo real (así se encontró el verde correcto de MPG y el navy más oscuro de COSMART) — nunca inventar un tono aproximado.

**Todavía sin hacer**: nada del resto de la lista de pendientes de infraestructura (secrets, deploy, cuentas, dominio) — el foco de esta vuelta fue 100% el diseño visual, ya cerrado.

**Workflow de deploy actualizado**: `.github/workflows/deploy.yml` ahora, después de `wrangler deploy`, corre un paso extra (`echo "$SETUP_SECRET" | npx wrangler secret put SETUP_SECRET`) que carga el secret directo en el Worker — así Vaneh no tiene que tocar la terminal de Cloudflare a mano, solo cargar 3 secrets en GitHub (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SETUP_SECRET`) y avisar para que se dispare el workflow. **Checklist de deploy sigue pendiente, esperando que Vaneh cargue esos 3 secrets.**

## Novedades 06/09 (segunda vuelta) — Decisión de producto: aprendizaje a partir del feedback de cada video generado

Vaneh planteó una idea a partir de una frustración real con Social Boots (no te deja dar indicaciones cuando algo sale mal) — preguntó si se podría plantear como "entrenamiento" para que la IA conozca mejor el perfil propio con el uso. **Confirmado que sí, con el siguiente diseño**:

- **Los videos que el usuario APRUEBA** (los usa/le gustan) se guardan como ejemplo positivo nuevo del perfil. Cada tanto (no después de cada video individual — sería carísimo en cómputo hacerlo por video) se re-ajusta el modelo de ese perfil con todo lo aprobado acumulado, así el perfil mejora solo cuantos más videos buenos se generan y usan.
- **Los videos que el usuario RECHAZA** (con motivo: ej. "la boca se ve rara", "la voz no soy yo") NO se usan para reentrenar directamente — un ejemplo negativo no le enseña al modelo cómo hacerlo bien, le falta el contraejemplo positivo. Sirven como **diagnóstico**: detectar patrones (ej. "siempre falla con fotos de perfil de costado") para mejorar la guía de onboarding o detectar condiciones problemáticas.
- Esto es la continuación natural del preview de frames antes de generar el video completo (ya decidido antes): cachar el error lo más barato y temprano posible en el proceso, en vez de que el error llegue al usuario al final sin poder hacer nada, como le pasa con Social Boots.
- **Nuevo criterio para elegir el modelo base** (sumar a la prueba comparativa pendiente entre Wan2.2-S2V / HunyuanVideo-Avatar / daVinci-MagiHuman): tiene que soportar ajuste incremental barato por perfil (ej. adaptadores tipo LoRA), para que re-entrenar con lo aprobado sea viable en costo y no obligue a reentrenar el modelo completo cada vez.
- **No implementado todavía** — es una decisión de diseño para cuando se construya el pipeline de generación real, no bloquea el arranque actual (login + subida de archivos).

## Novedades 06/09 (tercera vuelta) — infraestructura del MVP completa: deploy, cuentas y dominio

**Todo el checklist de infraestructura de la sección anterior (puntos 1-5) ya está resuelto.** Detalle de cómo se hizo cada uno, porque no fue exactamente como estaba planeado:

- **Deploy real: no se usó `.github/workflows/deploy.yml` (no existe, y no hace falta).** Vaneh conectó el repo directo desde el dashboard de Cloudflare ("Connect to Git" / Workers Builds) — Cloudflare re-deploya solo en cada push a `main`, sin secrets de GitHub Actions ni `wrangler deploy` manual. Si en el futuro se agrega un `deploy.yml` tipo `cosmart-workers`, sería redundante con esto — pensarlo dos veces antes de sumarlo.
- **⚠️ Discrepancia de nombre sin resolver, no bloquea nada**: el Worker quedó desplegado como **`iacosmart`** (nombre del repo), no como `cosmart-ia` que dice `wrangler.toml` — Cloudflare Workers Builds usó el nombre del repo en vez de leer el `name` del toml. URL real: `https://iacosmart.conglomeradocosmart.workers.dev`. Si se quiere prolijo habría que alinear el toml, pero funciona igual como está.
- **`SETUP_SECRET` cargado por Vaneh directo en el dashboard** (Worker → Settings → Variables and Secrets → tipo Secreto), valor acordado en el chat (no se commitea a git, como corresponde).
- **Las 2 cuentas iniciales ya existen**: `ger@cosmart.com.ar` y `vaneh@cosmart.com.ar`, ambas rol `admin`. Se crearon disparando `POST /api/setup` una vez por persona — no desde esta sesión directo (el entorno de esta sesión no tiene salida a internet abierta, ni siquiera a los propios `*.workers.dev` de Cloudflare) sino vía un workflow de GitHub Actions temporal (`.github/workflows/setup-cuentas.yml`, corrido dos veces y borrado después de usarlo) que sí tiene salida libre. Si hace falta crear una cuenta más adelante (nuevo admin, o el primer usuario externo pago), repetir ese patrón o pedirle a Vaneh que lo dispare ella misma desde la consola del navegador en la página de login.
- **Dominio `ia.cosmart.com.ar` ya apuntado por Vaneh** al Worker (custom domain, hecho desde su lado en Cloudflare).

**Estado real ahora**: el login + subida de archivos a R2 está en producción, usable por Vaneh y Ger ya mismo. Lo que sigue es 100% lo que ya estaba anotado como pendiente: la prueba comparativa de modelos (Wan2.2-S2V / HunyuanVideo-Avatar / daVinci-MagiHuman, demos gratis) y después el pipeline de generación real — nada de esa parte se empezó todavía.

## Qué es esto

Una IA propia de COSMART para generar videos a partir de fotos, audios y guiones — pensada para resolver un problema puntual de Vaneh: no tiene tiempo para crear contenido, y las herramientas que probó o la hacen mal (le cambian la cara) o son inaccesibles en precio. Ella la describe como su proyecto más grande desde que empezó, con expectativa fuerte de impacto económico.

Va a alojarse en **`ia.cosmart.com.ar`**.

## Uso previsto: privado, no público

Por ahora la usan solo **Vaneh y Germán (Ger)** — no un producto para el público. Cada uno tendría su propio perfil dentro de la herramienta.

## Requisitos tal como los planteó Vaneh (05/09)

- Cada persona (Vaneh, Ger) crea su propio perfil, subiéndole a la IA:
  - Una **biblioteca de fotos** — la cifra que tiró Vaneh como referencia es ~50 imágenes por persona — para que el resultado sea **fiel a la cara real**, no una aproximación genérica. Esto es explícitamente el punto que hoy le falla a las alternativas que probó.
  - **Links de videos** que la IA pueda extraer ("rascar") de redes sociales y de cualquier web.
  - **Audios y guiones** propios, para generar el video final (la persona hablando ese guion, con su cara y voz).
- Motivación explícita: "todas andan como el tuje y ninguna me lee bien" — la calidad/lectura de guion de las herramientas que probó no le sirve.

## Alternativas que Vaneh ya evaluó (contexto competitivo)

- **Social Boots**: según ella es la que mejor funciona hoy, pero "a mí personalmente me cambia la cara" — falla justo en el punto de fidelidad que más le importa.
- Una herramienta que menciona como "See Dance" (nombre tal cual lo dijo, sin confirmar cuál es exactamente — podría ser una referencia a Sora o similar) y "los chinos hicieron la suya": la entiende cara / inaccesible en precio.

## Estado actual

Solo idea/planificación, recién anotada. Sin decisiones técnicas tomadas, sin código, sin scaffolding de proyecto todavía.

## Pendiente (arranque del proyecto, todo abierto)

- Definir arquitectura técnica: ¿API de terceros existentes para face-swap/lip-sync/voice-clone/text-to-video, fine-tuning sobre un modelo abierto, o desarrollo propio? No decidido, hay que scopearlo con Vaneh.
- El "rascado" de videos de RRSS y webs de terceros que pide Vaneh tiene implicancias legales/de términos de servicio reales (scraping de redes sociales ajenas) — evaluarlo con cuidado antes de construir nada ahí, no asumir que es tan simple como bajar un video de una URL.
- Definir dónde y cómo se guardan de forma privada las fotos/videos/audios de cada perfil — son datos biométricos/de imagen real de Vaneh y Germán, no contenido de cliente cualquiera.
- Definir stack, hosting y cómo se conecta (si corresponde) con el resto del ecosistema COSMART (`training`, `cosmart-workers`, `hub`).
- Nada de esto está confirmado — es el primer volcado de la idea, a desarrollar en próximas sesiones.
