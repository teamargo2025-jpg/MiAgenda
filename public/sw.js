// Service worker de MiAgenda.
//
// Escrito a mano y sin pasar por el build: en la fase 0 esta es justamente la
// pieza que estamos poniendo a prueba, así que conviene que sea legible entera
// y que lo desplegado sea idéntico a lo que está aquí escrito.
//
// No cachea nada todavía. El trabajo offline es una pregunta abierta del
// documento y se decide antes de la fase 1; meter una estrategia de caché ahora
// sería adivinar, y además complica depurar los despliegues.

// Tomar el control cuanto antes, para que al recargar ya mande la versión nueva
// y no haya que cerrar todas las pestañas en cada despliegue.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
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
