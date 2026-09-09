import { db, configurado, VAPID_PUBLICA, base64UrlABytes } from './supabase.js';

// Da de alta este dispositivo. Es idempotente: el navegador devuelve siempre el
// mismo endpoint mientras no se revoque el permiso, y en la tabla ese campo es
// único, así que volver a pulsar el botón no crea duplicados.
export async function suscribir(registro) {
  if (!configurado) throw new Error('faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  if (!VAPID_PUBLICA) throw new Error('falta VITE_VAPID_PUBLIC_KEY');

  const existente = await registro.pushManager.getSubscription();
  const suscripcion =
    existente ??
    (await registro.pushManager.subscribe({
      // Obligatorio en Chrome: no se aceptan suscripciones sin payload visible.
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(VAPID_PUBLICA),
    }));

  const datos = suscripcion.toJSON();

  const { error } = await db.from('suscripciones').upsert(
    {
      endpoint: datos.endpoint,
      datos,
      etiqueta: navigator.userAgent.slice(0, 120),
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw new Error(`no se pudo guardar la suscripción: ${error.message}`);
  return datos.endpoint;
}

// Pide a la Edge Function que mande un push ahora mismo. Esto recorre la cadena
// completa menos el cron: servidor → servicio de push → service worker.
export async function probarDesdeServidor() {
  if (!configurado) throw new Error('falta configurar Supabase');
  const { data, error } = await db.functions.invoke('enviar-push', {
    body: { prueba: true, texto: `Prueba del servidor — ${new Date().toLocaleTimeString('es-PE')}` },
  });
  if (error) throw error;
  return data;
}
