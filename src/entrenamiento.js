// Las series hechas: registrarlas y consultarlas.
//
// Se apuntan con el celular en la mano, entre serie y serie, muchas veces en un
// sótano sin cobertura. Por eso pasan por la misma cola que las notas: se
// guardan en el dispositivo y suben cuando hay señal.

import { db } from './supabase.js';
import { encolar, nuevoId, soportaCola } from './cola.js';
import { pendientesDe } from './sincronizar.js';
import { claveEjercicio } from './ejercicios.js';

const CLAVE_COPIA = 'miagenda-series-hechas';

const esHoy = (iso) => new Date(iso).toDateString() === new Date().toDateString();

function leerCopia() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CLAVE_COPIA) || '[]');
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function guardarCopia(series) {
  try {
    // Solo lo reciente: la copia local existe para ver hoy y comparar con la
    // última vez, no para guardar el historial entero en el teléfono.
    localStorage.setItem(CLAVE_COPIA, JSON.stringify(series.slice(0, 400)));
  } catch {
    // Sin almacenamiento se pierde la consulta sin señal, no el registro.
  }
}

// Devuelve lo que haya en el dispositivo al instante y refresca por detrás.
// En el gimnasio la pantalla tiene que pintarse ya, con señal o sin ella.
export function cargarSeries(alRefrescar) {
  if (navigator.onLine) {
    db.from('series_hechas')
      .select('id, ejercicio, repeticiones, peso, hecha_en')
      .order('hecha_en', { ascending: false })
      .limit(400)
      .then(({ data, error }) => {
        if (error || !data) return;

        // Fusión por id y no reemplazo, por el mismo motivo que las rutinas:
        // una respuesta vacía puede ser "RLS no te deja ver nada" en vez de
        // "no hay nada", y reemplazar borraría de la copia local las series
        // que acabas de hacer.
        const porId = new Map(leerCopia().map((s) => [s.id, s]));
        for (const fila of data) porId.set(fila.id, fila);

        const fusionado = [...porId.values()].sort(
          (a, b) => new Date(b.hecha_en) - new Date(a.hecha_en),
        );

        guardarCopia(fusionado);
        alRefrescar?.(fusionado);
      });
  }

  return leerCopia();
}

export async function registrarSerie({ ejercicio, repeticiones, peso }) {
  const fila = {
    id: nuevoId(),
    ejercicio: ejercicio.trim(),
    repeticiones,
    peso: peso ?? null,
    // La hora la pone el dispositivo: es cuando hiciste la serie, no cuando
    // hubo cobertura para contarlo.
    hecha_en: new Date().toISOString(),
  };

  // La copia local se actualiza siempre y primero, para que la serie aparezca
  // en pantalla sin esperar a nadie.
  guardarCopia([fila, ...leerCopia()]);

  if (navigator.onLine) {
    const { error } = await db.from('series_hechas').insert(fila);
    if (!error) return { fila, destino: 'servidor' };
  }

  if (!soportaCola) return { fila, destino: 'solo-local' };

  // Se encola falle lo que falle, también ante un error del servidor. En las
  // notas se distingue —un error de datos no se arregla esperando— pero aquí
  // los datos son dos números y el fallo realista es de configuración o de
  // sesión: cosas que se arreglan solas más tarde. Perder una serie que
  // acabas de hacer es peor que reintentarla de más, y desde que la cola no se
  // tapona con una entrada mala, reintentar no cuesta nada a lo demás.
  await encolar({ ...fila, coleccion: 'serie' });
  return { fila, destino: 'cola' };
}

export async function borrarSerie(id) {
  guardarCopia(leerCopia().filter((s) => s.id !== id));
  if (!navigator.onLine) return { error: null };
  return db.from('series_hechas').delete().eq('id', id);
}

// Une lo que hay en el servidor con lo que sigue en la cola, sin duplicar: una
// serie recién hecha está en las dos hasta que sube.
export async function seriesCompletas(delServidor) {
  const enCola = await pendientesDe('serie');
  const vistos = new Set(delServidor.map((s) => s.id));
  const soloEnCola = enCola.filter((s) => !vistos.has(s.id));
  return [...soloEnCola, ...delServidor].sort(
    (a, b) => new Date(b.hecha_en) - new Date(a.hecha_en),
  );
}

export const seriesDeHoy = (series, ejercicio) =>
  series
    .filter((s) => claveEjercicio(s.ejercicio) === claveEjercicio(ejercicio) && esHoy(s.hecha_en))
    .sort((a, b) => new Date(a.hecha_en) - new Date(b.hecha_en));

// La última sesión de este ejercicio que no sea la de hoy. Es el dato que hace
// falta delante de la máquina: con cuánto peso acabaste la última vez.
export function ultimaVez(series, ejercicio) {
  const clave = claveEjercicio(ejercicio);
  const anteriores = series
    .filter((s) => claveEjercicio(s.ejercicio) === clave && !esHoy(s.hecha_en))
    .sort((a, b) => new Date(b.hecha_en) - new Date(a.hecha_en));

  if (!anteriores.length) return null;

  const dia = new Date(anteriores[0].hecha_en).toDateString();
  const deEseDia = anteriores
    .filter((s) => new Date(s.hecha_en).toDateString() === dia)
    .sort((a, b) => new Date(a.hecha_en) - new Date(b.hecha_en));

  return { fecha: anteriores[0].hecha_en, series: deEseDia };
}

// Agrupa por día para el historial.
export function porDia(series) {
  const dias = new Map();
  for (const s of series) {
    const dia = new Date(s.hecha_en).toDateString();
    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia).push(s);
  }
  return [...dias.entries()]
    .map(([dia, lista]) => ({
      dia,
      fecha: lista[0].hecha_en,
      series: lista.sort((a, b) => new Date(a.hecha_en) - new Date(b.hecha_en)),
    }))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
