// Edge Function `enviar-push`.
//
// La llama pg_cron cada minuto. Busca notas cuyo recordatorio ya venció y
// manda un push a cada dispositivo suscrito.
//
// Sobre la librería: se usa @negrel/webpush, que está escrita contra WebCrypto
// y corre nativa en Deno. El `web-push` de npm, que es el que aparece en casi
// todos los tutoriales, depende del módulo `crypto` de Node y no funciona en
// este runtime — es la trampa clásica de este paso.

// Especificadores completos y con versión fija, en vez de un mapa de
// importaciones aparte: así el archivo se despliega igual desde el editor web
// del panel que desde el CLI, sin depender de deno.json.
import * as webpush from 'jsr:@negrel/webpush@^0.3.0';
import { createClient } from 'jsr:@supabase/supabase-js@^2';

const CORREO_CONTACTO = Deno.env.get('CORREO_CONTACTO') ?? 'mailto:nadie@example.com';

// Se preparan una sola vez por instancia, no en cada invocación: importar
// claves es criptografía y el cron pega cada minuto.
const vapidKeys = await webpush.importVapidKeys(
  JSON.parse(Deno.env.get('VAPID_JWKS')!),
  { extractable: false },
);

const servidor = await webpush.ApplicationServer.new({
  contactInformation: CORREO_CONTACTO.startsWith('mailto:')
    ? CORREO_CONTACTO
    : `mailto:${CORREO_CONTACTO}`,
  vapidKeys,
});

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // Clave de servicio: se salta RLS, por eso puede leer los endpoints.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// Un endpoint muerto responde 404 o 410: el navegador se desinstaló, se limpió
// el sitio o caducó. Guardarlo no sirve de nada y hace que cada envío falle
// para siempre, así que se borra.
const ENDPOINT_MUERTO = [404, 410];

async function enviarATodos(carga: Record<string, unknown>) {
  const { data: suscripciones, error } = await db.from('suscripciones').select('*');
  if (error) throw error;
  if (!suscripciones?.length) return { enviados: 0, fallos: ['no hay dispositivos suscritos'] };

  let enviados = 0;
  const fallos: string[] = [];

  for (const fila of suscripciones) {
    try {
      const suscriptor = servidor.subscribe(fila.datos);
      await suscriptor.pushTextMessage(JSON.stringify(carga), {});
      enviados++;
      await db.from('suscripciones')
        .update({ ultimo_ok: new Date().toISOString(), ultimo_erro: null })
        .eq('id', fila.id);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      fallos.push(`${fila.etiqueta ?? fila.id}: ${mensaje}`);

      const codigo = (e as { response?: { status?: number } })?.response?.status;
      if (codigo && ENDPOINT_MUERTO.includes(codigo)) {
        await db.from('suscripciones').delete().eq('id', fila.id);
      } else {
        await db.from('suscripciones').update({ ultimo_erro: mensaje }).eq('id', fila.id);
      }
    }
  }

  return { enviados, fallos };
}

Deno.serve(async (req) => {
  const disparadoEn = new Date();

  try {
    const cuerpo = await req.json().catch(() => ({}));

    // Modo prueba: `{"prueba": true}` manda un aviso al instante sin tocar las
    // notas. Es lo que se usa para verificar la cadena en la fase 0.
    if (cuerpo.prueba) {
      const { enviados, fallos } = await enviarATodos({
        titulo: 'MiAgenda',
        cuerpo: cuerpo.texto ?? `Prueba del servidor — ${disparadoEn.toISOString()}`,
        url: '/',
      });
      await db.from('envios').insert({
        programado_en: disparadoEn.toISOString(),
        enviado_en: new Date().toISOString(),
        destinos: enviados,
        ok: enviados > 0,
        detalle: fallos.join(' | ') || null,
      });
      return Response.json({ modo: 'prueba', enviados, fallos });
    }

    // Modo normal: notas vencidas, aún no notificadas y sin marcar como hechas.
    const { data: pendientes, error } = await db
      .from('notas')
      .select('id, texto, recordar_en')
      .lte('recordar_en', disparadoEn.toISOString())
      .is('notificada_en', null)
      .eq('hecha', false)
      .order('recordar_en', { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!pendientes?.length) return Response.json({ pendientes: 0 });

    const resultados = [];
    for (const nota of pendientes) {
      const { enviados, fallos } = await enviarATodos({
        titulo: 'MiAgenda',
        cuerpo: nota.texto,
        url: '/',
        notaId: nota.id,
      });

      // Se marca como notificada aunque algún dispositivo falle: si llegó a uno
      // solo, el recordatorio cumplió. Reintentar cada minuto sería peor —
      // acabaría avisando en bucle en los aparatos que sí funcionan.
      if (enviados > 0) {
        await db.from('notas')
          .update({ notificada_en: new Date().toISOString() })
          .eq('id', nota.id);
      }

      await db.from('envios').insert({
        nota_id: nota.id,
        programado_en: nota.recordar_en,
        disparado_en: disparadoEn.toISOString(),
        enviado_en: new Date().toISOString(),
        destinos: enviados,
        ok: enviados > 0,
        detalle: fallos.join(' | ') || null,
      });

      resultados.push({ nota: nota.id, enviados, fallos });
    }

    return Response.json({ pendientes: pendientes.length, resultados });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await db.from('envios').insert({
      disparado_en: disparadoEn.toISOString(),
      ok: false,
      detalle: mensaje,
    });
    return Response.json({ error: mensaje }, { status: 500 });
  }
});
