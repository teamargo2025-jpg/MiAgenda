// Service worker de MiAgenda.
//
// Escrito a mano y sin pasar por el build: es la pieza que decide qué pasa
// cuando no hay señal, y conviene que sea legible entera y que lo desplegado
// sea idéntico a lo que está aquí escrito.

const CACHE = 'miagenda-v1';

// Se cachea sobre la marcha en vez de con una lista fija de archivos.
//
// La alternativa —precargar una lista— exige conocer los nombres con hash que
// genera el build, y eso obliga a un plugin que reescriba este archivo. A
// cambio de no tenerlo, la primera visita necesita señal: se cachea lo que se
// usa, según se usa. Para una app que se abre a diario desde el mismo teléfono,
// es un intercambio razonable.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Al cambiar CACHE se tiran las versiones viejas, para que un despliegue
      // no deje archivos de dos versiones distintas conviviendo.
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

const esNavegacion = (peticion) => peticion.mode === 'navigate';

const esAssetPropio = (url) =>
  url.origin === self.location.origin &&
  /\.(js|css|png|svg|webmanifest|woff2?)$/.test(url.pathname);

self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  // Solo GET. Un POST no se cachea ni se reintenta aquí: las escrituras las
  // gestiona la cola de la app, que sabe qué significa cada una.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca se toca lo que va a Supabase. Servir datos viejos de la API sería
  // enseñar notas que ya no existen o esconder las nuevas; la app ya tiene su
  // propia respuesta para el modo sin conexión.
  if (url.origin !== self.location.origin) return;

  if (esNavegacion(request)) {
    // Red primero: si hay señal, siempre la versión recién desplegada. La copia
    // guardada es la red de seguridad, no la fuente.
    evento.respondWith(
      (async () => {
        try {
          const respuesta = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, respuesta.clone());
          return respuesta;
        } catch {
          const guardada = await caches.match(request);
          // Si la página pedida no está guardada, se sirve la de captura: es la
          // que importa que abra sin señal.
          return guardada || (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  if (esAssetPropio(url)) {
    // Caché primero y refresco en segundo plano. Los assets llevan hash en el
    // nombre, así que el contenido de una URL dada nunca cambia: servir la
    // copia es siempre correcto y evita esperar a la red.
    evento.respondWith(
      (async () => {
        const guardada = await caches.match(request);
        const red = fetch(request)
          .then(async (respuesta) => {
            if (respuesta.ok) {
              const cache = await caches.open(CACHE);
              cache.put(request, respuesta.clone());
            }
            return respuesta;
          })
          .catch(() => null);

        return guardada || (await red) || Response.error();
      })(),
    );
  }
});

// El servidor manda el aviso. El payload viene como JSON, pero si por lo que sea
// llega vacío o ilegible igual hay que mostrar algo: una notificación que no
// aparece es peor que una genérica.
self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }

  const titulo = datos.titulo || 'MiAgenda';
  const opciones = {
    body: datos.cuerpo || 'Tienes algo pendiente.',
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    lang: 'es',
    timestamp: Date.now(),
    // Vibrar y exigir interacción para que no pase desapercibida en el celular.
    vibrate: [120, 60, 120],
    requireInteraction: true,
    data: { url: datos.url || '/', notaId: datos.notaId || null },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Al tocar la notificación: si la app ya está abierta, enfocar esa ventana en
// vez de abrir una segunda.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href;

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if (ventana.url === destino && 'focus' in ventana) return ventana.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
