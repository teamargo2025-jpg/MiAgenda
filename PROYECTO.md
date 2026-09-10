# MiAgenda

> Un lugar personal donde suelto una idea en dos segundos —hablando o escribiendo— y no se pierde: se guarda, me avisa cuando toca, y después me ayuda a hilarla con las demás.

*Última actualización: 9 de septiembre de 2026*

## El problema

Se me ocurren ideas y tengo tareas o actividades que no quiero olvidar, y hoy no tienen un lugar. Probé Trello y Canva, y los dejé.

Trello no falló por falta de funciones: falló por **fricción**. Para meter algo hay que decidir tablero, lista, fecha — un peaje de treinta segundos que es suficiente para no hacerlo. Y desde la computadora se siente trabajoso. El resultado es que la idea se queda en la cabeza y se pierde.

Pero hay un segundo problema, distinto y más importante: incluso si anotara todo, **Trello es un archivador — el orden lo pongo yo**. Lo que quiero es lo contrario: soltar cosas en desorden y que algo del otro lado me las ordene, las agende y me las recuerde.

Los dos problemas juntos:

1. **Anotar cuesta.** Por eso no anoto, y pierdo ideas.
2. **Ordenar cuesta.** Por eso lo anotado se pudre sin convertirse en nada.

## Para quién

Un solo usuario: yo. No hay roles, no hay permisos, no hay que compartir nada. Eso simplifica muchísimo el proyecto y hay que aprovecharlo — nada de sistemas de cuentas ni multiusuario.

Contexto de uso real:

- **Desde donde sea**, sin importar el lugar. El celular es el dispositivo principal para capturar.
- **Por voz o por texto**, lo que sea más rápido en el momento.
- **También desde la computadora**, donde quiero ver los avisos como una viñeta.

## Qué hace la primera versión

1. Abro la app en el celular, hablo o escribo una línea, y quedó guardada. Sin elegir categoría, sin elegir tablero.
2. Si eso tiene fecha y hora, se la pongo ahí mismo.
3. Llegado el momento, me llega una notificación al celular y a la computadora.
4. Veo la lista de todo lo capturado y puedo editarlo o marcarlo como hecho.

Eso es todo. Es poco a propósito: es lo mínimo que ya resuelve el problema 1 y evita que olvide cosas desde el primer día.

## Qué NO hace (por ahora)

| Queda fuera de la v1 | Por qué |
|---|---|
| **Destilar ideas con IA** | Necesita tener notas adentro para funcionar. No se puede destilar un cajón vacío — llega en la fase 2, cuando ya haya material real |
| **Lienzo visual para hilar ideas** | Es, de lejos, la parte más cara del proyecto. Si entra a la v1, la v1 no llega. Fase 3 |
| **Apartado de gastos y finanzas** | Es un producto entero aparte. Anotado para no perderlo, pero fuera del plan inicial |
| **Tableros al estilo Trello** | Es justo la fricción que estamos eliminando. Si después de usarlo dos semanas hace falta agrupar, se agrega sabiendo cómo |
| **Compartir, colaborar, cuentas de usuario** | Es de uso personal. Cada pieza de esto son días de trabajo que no aportan nada aquí |

## Cómo sabremos que funcionó

**La señal:** que durante dos semanas seguidas capture ideas ahí en vez de en las notas del celular, y que no se me pase ninguna actividad con fecha.

Si a las dos semanas sigo anotando en otro lado, la app no resolvió la fricción y hay que entender por qué antes de seguir construyendo encima.

## Restricciones

- **Tiempo:** hasta 6 horas diarias (~30 h/semana).
- **Plazo:** sin fecha límite externa.
- **Equipo:** una persona, con Claude Code como asistencia de programación.
- **Presupuesto:** cero. Todo tiene que caber en planes gratuitos.
- **Stack conocido:** JavaScript, Vite, Supabase (de trabajo previo en otro proyecto).

### Arquitectura elegida

| Pieza | Qué se usa | Por qué |
|---|---|---|
| Interfaz | Página web en Vercel, instalable como **PWA** | Se quería una página, no una app de tienda. Instalada, se comporta como app y puede notificar |
| Notificaciones | **Web Push** desde la PWA | Es la única forma de que un mismo desarrollo avise en celular *y* en escritorio |
| Base de datos | **Supabase** (plan gratuito) | Ya se conoce, y su plan gratis alcanza de sobra para un usuario |
| Disparo por hora | **`pg_cron` de Supabase** + Edge Function | Vercel es serverless: no hay proceso prendido esperando la hora, y su cron gratuito solo corre una vez al día. Supabase sí puede revisar cada minuto |
| Dictado por voz | **Web Speech API** del navegador | Gratis y sin servicios externos. Si queda corta, se evalúa transcripción de pago en la fase 2 |
| IA (solo fase 2+) | API de Claude, modelo Haiku | ~$2/mes con uso diario. **La suscripción de Claude Code no incluye la API** — son cobros separados |

## Riesgos y supuestos

| Qué asumimos / qué puede fallar | Impacto | Cómo lo comprobamos barato |
|---|---|---|
| Las notificaciones push llegan al celular de forma confiable | **Medio.** Sin esto no hay producto, pero el teléfono es **Android**, donde el push web es camino trillado — funciona incluso desde una pestaña, sin instalar | **Fase 0**, primer día: una PWA vacía que mande una notificación de prueba al celular real |
| `pg_cron` gratuito dispara con precisión suficiente | Alto: si un recordatorio llega tarde, se pierde la confianza en la app | En la misma fase 0, programar un aviso y medir el retraso |
| El dictado del navegador transcribe bien en español | Medio: si falla, se captura por texto y la voz se resuelve después | Probarlo el primer día — son diez minutos |
| Escribir la nota es realmente más rápido que abrir las notas del celular | **Alto — es la premisa del proyecto.** Si no gana en velocidad, no se va a usar | Cronometrar ambos caminos al terminar la fase 1 |
| El lienzo visual es abordable | Medio: es la parte más compleja, pero llega cuando ya hay algo usable | No se prueba antes; a propósito queda al final |
| 6 h diarias se sostienen | Medio: el ritmo real suele bajar | El roadmap está por fases: si el ritmo cae, la fase 1 ya entrega algo usable |

## Decisiones tomadas

- **Página web (PWA) y no app nativa.** Una app nativa implica tienda, permisos y semanas antes de escribir lo que importa. La PWA da notificación en celular y escritorio con un solo desarrollo.
- **Capturar y recordar antes que destilar.** Destilar necesita material; recordar sirve solo desde el día uno.
- **El lienzo visual al final.** Es lo más caro del proyecto; ponerlo primero mata la v1.
- **Sin IA en la v1.** Así la primera versión sale a costo cero y sin depender de credenciales ni cuotas.
- **Lo más riesgoso primero.** Las notificaciones se prueban antes que ninguna otra cosa, porque si no funcionan cambia el proyecto entero.
- **El teléfono es Android**, así que el push web va por el camino directo: no depende de instalar desde Safari ni de las restricciones de iOS. Se sigue probando en la fase 0, pero como verificación, no como incógnita. Si en algún momento entra un iPhone en la ecuación, hay que revisar esta decisión.

## Preguntas abiertas

| Pregunta | Quién la responde | Cuándo hace falta |
|---|---|---|
| "Destilar" — ¿qué se espera exactamente de vuelta? ¿Un resumen agrupado, un plan, preguntas? | Yo, viendo notas reales | Antes de la fase 2 |
| El lienzo, ¿nodos que se conectan (mapa mental) o notas sueltas que se mueven (pizarra)? | Yo | Antes de la fase 3 |
| ¿Hace falta que funcione sin internet? | Yo | Antes de la fase 1 |

## Enlaces del proyecto

| Qué | Dónde |
|---|---|
| App en producción | https://mi-agenda-nu.vercel.app/ |
| Repositorio | https://github.com/teamargo2025-jpg/MiAgenda |
| Panel de Vercel | https://vercel.com/argonauts5/mi-agenda |

---

## Plan por fases

**Total estimado: 4 a 5 semanas** al ritmo declarado. La fase 1 entrega algo usable en la primera semana y media.

### Fase 0 — ¿Me llega la notificación?

**Objetivo:** responder la única pregunta que puede cambiar el proyecto entero, antes de construir nada encima.
**Duración estimada:** 1 a 2 días
**Terminó cuando:** instalo la página en el celular, programo un aviso para dos minutos después, y me llega — al celular y a la computadora.

- [x] Proyecto Vite vacío desplegado en Vercel
- [x] Convertirlo en PWA instalable (manifest + service worker)
- [x] Pedir permiso de notificaciones y guardar la suscripción push
- [x] Proyecto en Supabase con la tabla de notas
- [x] Edge Function que envía un push de prueba *(desplegada y arrancando; verificada devolviendo 200 en ambos modos)*
- [x] `pg_cron` llamándola cada minuto
- [x] **Probar en el celular real** y anotar cuánto se retrasa *(40,2 s medidos)*
- [ ] Probar diez segundos de dictado por voz en español y anotar qué tan bien salió

> Si aquí falla el push, **parar y replantear** antes de seguir. Ese es el propósito de esta fase.

#### Resultado: la fase 0 responde que sí ✅

**El push llega.** Confirmado en un Android real (Chrome 152): la Edge Function
envía y la notificación aparece en el teléfono. Cadena completa —navegador →
Supabase → servicio de push de Google → dispositivo— en plan gratuito.

**El cron dispara solo, con 40,2 s de retraso medidos.** Una nota programada
para las 04:14:20 se notificó a las 04:15:00. Ese retraso no es imprecisión
sino granularidad: pg_cron corre puntualísimo, siempre en el segundo :00.0 de
cada minuto, pero solo mira una vez por minuto. En la práctica, entre 0 y 60 s,
~30 s de media. Para recordatorios es irrelevante.

#### Los cinco fallos del camino

Todos en la parte que el documento marcaba como más incierta. Vale la pena
tenerlos escritos porque ninguno era evidente:

1. **El `upsert` de la suscripción chocaba con RLS.** Postgres necesita SELECT
   para resolver un conflicto, y a la clave anon se le niega a propósito.
   Resuelto con insert + update filtrado por endpoint.
2. **Faltaba CORS en la Edge Function.** No se veía con curl ni desde pg_cron,
   solo desde el navegador, que manda un OPTIONS previo.
3. **Clave VAPID pública equivocada** en las variables de Vercel. La
   comprobación verificaba solo el prefijo, así que dio "OK" sobre un valor
   corrupto. Verificar cadenas completas, no prefijos.
4. **Una suscripción del navegador queda atada a la clave VAPID con la que se
   creó.** Al cambiar la clave hay que desuscribir en el dispositivo; borrar la
   fila en la base no basta.
5. **El editor SQL de Supabase censura el texto que reconoce como clave de
   API**, sustituyéndolo carácter por carácter. El largo se conserva —así que
   comprobar la longitud no detecta nada— pero el contenido cambia. Solo se vio
   comparando huellas md5. Para meter una clave en la base, codificarla en
   base64 y decodificarla con `convert_from(decode(...))`.

**Lección transversal:** `cron.job_run_details` marcaba "succeeded" mientras
todas las llamadas fallaban, porque el job solo encola la petición. El
resultado real de la llamada HTTP está en `net._http_response`.

**Falta de la fase 0:** probar el dictado por voz en español.

#### Historial

Confirmado en un Android real (Chrome 152) el 9 de septiembre de 2026: la
Edge Function envía y la notificación aparece en el teléfono. La cadena
completa —navegador → Supabase → servicio de push de Google → dispositivo—
funciona en plan gratuito.

Tres fallos encontrados y corregidos por el camino, todos en la parte que el
documento señalaba como más incierta:

1. El `upsert` de la suscripción chocaba con RLS. Postgres necesita SELECT
   para resolver un conflicto, y a la clave anon se le niega a propósito.
   Resuelto con insert + update filtrado.
2. Faltaba CORS en la Edge Function. No se veía con curl ni desde pg_cron,
   solo desde el navegador.
3. Una suscripción del navegador queda atada a la clave VAPID con la que se
   creó. Al cambiar la clave hay que desuscribir en el dispositivo; borrar la
   fila en la base no basta.

**Falta de la fase 0:** el cron, medir su retraso, y probar el dictado por voz.

#### Dónde nos quedamos — 9 de septiembre de 2026

**Listo:** app desplegada en Vercel, PWA instalable, service worker con los
handlers de push escritos, proyecto Supabase creado, las tres tablas creadas,
variables de entorno cargadas en Vercel y verificadas dentro del bundle
publicado, Edge Function `enviar-push` desplegada desde el editor web.

**Siguiente paso:** cargar los dos secretos de la Edge Function en
Supabase → Edge Functions → Secrets. La función lee `VAPID_JWKS` en su primera
línea, así que sin él revienta antes de atender nada — ahora mismo devuelve 500.

| Secreto | Valor |
|---|---|
| `VAPID_JWKS` | la línea correspondiente de `secretos.local.txt` (fuera de git) |
| `CORREO_CONTACTO` | `mailto:fchoquequ@unsa.edu.pe` |

**Después:** volver a llamar a la función para confirmar que arranca → suscribir
el celular desde la app → "Pedir push al servidor" → programar el cron con
`supabase/cron.sql` → medir el retraso con `select * from public.retrasos`.

**Sin comprobar:** nunca se confirmó si el aviso de prueba local (botón
"Mandarme un aviso de prueba") llegó al celular.

**Deuda anotada:** RLS está abierto a la clave `anon`. Cerrarlo antes de
empezar a usar la app de verdad, al final de la fase 1.

### Fase 1 — Capturar y recordar

**Objetivo:** la versión mínima que ya sirve. Al final de esta fase la app se empieza a usar de verdad.
**Duración estimada:** 4 a 6 días
**Terminó cuando:** desde el celular dicto "llamar al dentista el jueves a las 3", queda guardado, y el jueves a las 3 me llega la notificación.

- [ ] Pantalla de captura: un campo, un botón de micrófono, nada más
- [ ] Dictado por voz que rellena el campo
- [ ] Guardar en Supabase
- [ ] Ponerle fecha y hora opcional a una nota
- [ ] Lista de lo capturado, ordenada por fecha
- [ ] Editar, marcar como hecha, borrar
- [ ] El cron dispara los recordatorios reales a su hora
- [ ] **Usarla una semana** y anotar qué molesta

### Fase 2 — Destilar

**Objetivo:** que el montón de notas se convierta en algo aterrizado. Aquí entra la IA.
**Duración estimada:** 3 a 4 días
**Terminó cuando:** aprieto "destilar" sobre las notas de la semana y me devuelve algo agrupado que reconozco como mío y me sirve.

- [ ] Cuenta de API de Claude con créditos y la clave guardada del lado servidor
- [ ] Edge Function que manda las notas del periodo al modelo
- [ ] Definir qué se le pide exactamente (aquí se responde la pregunta abierta)
- [ ] Botón "destilar esta semana" y pantalla de resultado
- [ ] Guardar el destilado como una nota más, para no perderlo
- [ ] Tope de gasto mensual para que no haya sustos

### Fase 3 — El lienzo

**Objetivo:** el espacio creativo para hilar ideas: verlas juntas, moverlas, conectarlas.
**Duración estimada:** 2 semanas
**Terminó cuando:** puedo arrastrar notas a un lienzo, conectarlas entre sí, y al recargar la página todo sigue donde lo dejé.

Se detalla al empezar la fase, no ahora: para entonces habrá dos semanas de uso real y notas de verdad, y planificar hoy algo que está a un mes es planificar sobre suposiciones.

### Fase 4 — Gastos y finanzas

Sin fecha, sin detalle. Queda registrado para no perderlo. Se retoma cuando las fases 0 a 3 estén asentadas y la app se esté usando de verdad.
