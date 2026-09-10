import { db, configurado, VAPID_PUBLICA, base64UrlABytes } from './supabase.js';

// Compara la clave con la que se creó una suscripción existente contra la
// actual. El navegador la devuelve como ArrayBuffer, así que se comparan bytes.
function mismaClave(suscripcion, clave) {
  const guardada = suscripcion.options?.applicationServerKey;
  if (!guardada) return false;
  const bytes = new Uint8Array(guardada);
  if (bytes.length !== clave.length) return false;
  return bytes.every((b, i) => b === clave[i]);
}

// Da de alta este dispositivo. Es idempotente: el navegador devuelve siempre el
// mismo endpoint mientras no se revoque el permiso, y en la tabla ese campo es
// único, así que volver a pulsar el botón no crea duplicados.
export async function suscribir(registro) {
  if (!configurado) throw new Error('faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  if (!VAPID_PUBLICA) throw new Error('falta VITE_VAPID_PUBLIC_KEY');

  const clave = base64UrlABytes(VAPID_PUBLICA);

  // Una suscripción del navegador queda atada a la clave pública con la que se
  // creó. Si esa clave cambia, la vieja sigue viva en el navegador pero el
  // servidor ya no puede firmar para ella: el servicio de push responde 403.
  // Borrarla de la base no basta — hay que desuscribir aquí.
  let existente = await registro.pushManager.getSubscription();
  if (existente && !mismaClave(existente, clave)) {
    await existente.unsubscribe();
    existente = null;
  }

  const suscripcion =
    existente ??
    (await registro.pushManager.subscribe({
      // Obligatorio en Chrome: no se aceptan suscripciones sin payload visible.
      userVisibleOnly: true,
      applicationServerKey: clave,
    }));

  const datos = suscripcion.toJSON();

  const fila = {
    endpoint: datos.endpoint,
    datos,
    etiqueta: navigator.userAgent.slice(0, 120),
  };

  // Insertar y, si el endpoint ya existía, actualizar esa fila.
  //
  // Deliberadamente NO se usa upsert: cuando encuentra un conflicto, Postgres
  // tiene que leer la fila existente, y eso exige permiso de SELECT. A la clave
  // anon no se le da SELECT sobre esta tabla a propósito, para que el navegador
  // no pueda listar los endpoints de todos los dispositivos. Un update filtrado
  // por endpoint consigue lo mismo sin necesitar lectura.
  const { error } = await db.from('suscripciones').insert(fila);

  if (error) {
    // 23505 = clave duplicada. Este aparato ya estaba dado de alta; se refrescan
    // sus datos por si el navegador rotó las claves de cifrado.
    if (error.code !== '23505') {
      throw new Error(`no se pudo guardar la suscripción: ${error.message}`);
    }
    const { error: errorUpdate } = await db
      .from('suscripciones')
      .update({ datos: fila.datos, etiqueta: fila.etiqueta })
      .eq('endpoint', datos.endpoint);
    if (errorUpdate) {
      throw new Error(`no se pudo refrescar la suscripción: ${errorUpdate.message}`);
    }
  }

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
