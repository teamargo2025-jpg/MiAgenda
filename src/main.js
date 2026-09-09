// Fase 0 — bloque B. Registra el service worker y prueba que el aparato sepa
// mostrar una notificación. Todavía no hay push ni servidor: eso llega en el
// bloque C, cuando existan las claves VAPID.

const set = (id, texto, estado = 'neutro') => {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.dataset.estado = estado;
};

const si = (cond, textoSi, textoNo) => (cond ? [textoSi, 'ok'] : [textoNo, 'falla']);

const botonPermiso = document.getElementById('btn-permiso');
const botonProbar = document.getElementById('btn-probar');
const resultado = document.getElementById('resultado');

const decir = (texto, estado = 'neutro') => {
  resultado.textContent = texto;
  resultado.dataset.estado = estado;
};

// --- Diagnóstico ---

const soportaSW = 'serviceWorker' in navigator;
const soportaNotif = 'Notification' in window;
const VozAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

// `standalone` es el modo en que se abre una PWA instalada; en iOS antiguo se
// expone como navigator.standalone en vez de por media query.
const instalada =
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

set('diag-origen', location.host);
set('diag-https', ...si(isSecureContext, 'contexto seguro', 'inseguro — el push no va a funcionar'));
set('diag-sw', ...si(soportaSW, 'soportado', 'no soportado'));
set('diag-push', ...si('PushManager' in window, 'soportado', 'no soportado'));
set('diag-voz', ...si(VozAPI, 'soportado', 'no soportado'));
set('diag-instalada', instalada ? 'sí, corriendo como app' : 'no, abierta en el navegador');

const pintarPermiso = () => {
  if (!soportaNotif) return set('diag-notif', 'no soportado', 'falla');
  const permiso = Notification.permission;
  const estado = permiso === 'granted' ? 'ok' : permiso === 'denied' ? 'falla' : 'neutro';
  set('diag-notif', `soportado (permiso: ${permiso})`, estado);

  botonPermiso.disabled = permiso !== 'default';
  if (permiso === 'granted') botonPermiso.textContent = 'Permiso ya concedido';
  if (permiso === 'denied') botonPermiso.textContent = 'Permiso bloqueado';
};

pintarPermiso();

// --- Service worker ---

// `listoSW` se resuelve con el registro activo. Se guarda como promesa para que
// el botón de prueba pueda esperarla sin volver a registrar nada.
const listoSW = soportaSW
  ? navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((registro) => {
        set('diag-sw', 'registrado y activo', 'ok');
        return registro;
      })
      .catch((error) => {
        set('diag-sw', `falló el registro: ${error.message}`, 'falla');
        throw error;
      })
  : Promise.reject(new Error('este navegador no soporta service workers'));

listoSW.then(() => {
  if (soportaNotif && Notification.permission === 'granted') botonProbar.disabled = false;
}).catch(() => {});

// --- Acciones ---

botonPermiso.addEventListener('click', async () => {
  try {
    const permiso = await Notification.requestPermission();
    pintarPermiso();
    if (permiso === 'granted') {
      botonProbar.disabled = false;
      decir('Permiso concedido. Ahora prueba el aviso.', 'ok');
    } else {
      // En Android, un "bloquear" hay que deshacerlo a mano en los ajustes del
      // sitio; el navegador ya no vuelve a preguntar.
      decir(
        `Respondiste "${permiso}". Si fue sin querer, hay que reactivarlo desde los ajustes del sitio en el navegador.`,
        'falla'
      );
    }
  } catch (error) {
    decir(`No se pudo pedir el permiso: ${error.message}`, 'falla');
  }
});

botonProbar.addEventListener('click', async () => {
  decir('Mandando…');
  try {
    const registro = await listoSW;
    // Se muestra desde el registro del service worker, no con `new Notification()`:
    // es la misma ruta que usará el push real, así que probamos el camino bueno.
    await registro.showNotification('MiAgenda', {
      body: 'Aviso de prueba local — la pantalla de notificaciones funciona.',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      lang: 'es',
      vibrate: [120, 60, 120],
      data: { url: '/' },
    });
    decir('Enviado. Si no aparece, revisa la bandeja de notificaciones.', 'ok');
  } catch (error) {
    decir(`Falló: ${error.message}`, 'falla');
  }
});
