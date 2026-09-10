// Sube lo que se capturó sin señal.
//
// Un único punto que sabe a qué tabla va cada tipo de entrada, para que ni la
// cola ni las pantallas tengan que saberlo.

import { db } from './supabase.js';
import { vaciarCola, leerCola, soportaCola } from './cola.js';

const TABLAS = { nota: 'notas', gasto: 'gastos' };

export function sincronizar() {
  return vaciarCola(async (entrada) => {
    const { tipo, ...fila } = entrada;
    const tabla = TABLAS[tipo];
    if (!tabla) return { error: { code: 'TIPO_DESCONOCIDO', message: `tipo "${tipo}"` } };
    return db.from(tabla).insert(fila);
  });
}

export async function pendientesDe(tipo) {
  if (!soportaCola) return [];
  const todas = await leerCola();
  return todas.filter((e) => e.tipo === tipo);
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
