// Sube lo que se capturó sin señal.
//
// Un único punto que sabe a qué tabla va cada tipo de entrada, para que ni la
// cola ni las pantallas tengan que saberlo.

import { db } from './supabase.js';
import { vaciarCola, leerCola, soportaCola } from './cola.js';

const TABLAS = { nota: 'notas', movimiento: 'movimientos' };

// Compatibilidad con la cola anterior, que usaba `tipo` como discriminador.
// Ahora `tipo` es un campo real de los movimientos (gasto o ingreso), así que
// el discriminador pasó a llamarse `coleccion`. Sin esta traducción, lo que
// alguien tuviera pendiente de subir al actualizar la app se quedaría atascado
// para siempre — y en silencio, que es lo peor.
const LEGADO = { nota: 'nota', gasto: 'movimiento' };

const coleccionDe = (entrada) => entrada.coleccion ?? LEGADO[entrada.tipo] ?? null;

export function sincronizar() {
  return vaciarCola(async (entrada) => {
    const coleccion = coleccionDe(entrada);
    const tabla = TABLAS[coleccion];
    if (!tabla) {
      return { error: { code: 'COLECCION_DESCONOCIDA', message: `"${coleccion}"` } };
    }

    const { coleccion: _c, ...resto } = entrada;
    // Una entrada del formato viejo traía `tipo: 'gasto'` como discriminador;
    // en la tabla nueva ese mismo valor es correcto para la columna `tipo`,
    // así que se deja pasar tal cual.
    const fila = coleccion === 'nota' ? (({ tipo, ...r }) => r)(resto) : resto;
    return db.from(tabla).insert(fila);
  });
}

export async function pendientesDe(coleccion) {
  if (!soportaCola) return [];
  const todas = await leerCola();
  return todas.filter((e) => coleccionDe(e) === coleccion);
}

// Intenta sincronizar al cargar y cada vez que vuelve la conexión. `alTerminar`
// se llama solo si algo subió, para que la pantalla se repinte sin parpadear en
// cada evento de red.
export function sincronizarEnSegundoPlano(alTerminar) {
  const intentar = async () => {
    if (!navigator.onLine) return;
    try {
      const { subidas } = await sincronizar();
      if (subidas > 0) alTerminar?.(subidas);
    } catch {
      // Sincronizar es oportunista: si falla, lo pendiente sigue en el
      // dispositivo y se reintenta al próximo evento. No hay nada que avisar.
    }
  };

  window.addEventListener('online', intentar);
  intentar();
}
