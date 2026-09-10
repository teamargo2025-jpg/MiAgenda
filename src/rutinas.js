// La rutina de cada día de la semana.
//
// Se lee siempre desde una copia en el dispositivo y se refresca desde el
// servidor por detrás. El gimnasio suele ser un sótano sin cobertura, y una
// rutina que no se puede consultar justo cuando estás delante de la máquina no
// sirve de nada.
//
// Escribir sí necesita conexión, y eso se acepta: las rutinas se planifican en
// casa, no entre series.

import { db } from './supabase.js';

const CLAVE_COPIA = 'miagenda-rutinas';

// 0 = domingo, como getDay(). Coincidir con lo que devuelve el navegador evita
// una conversión en cada lectura, y las conversiones de días de la semana son
// un clásico de los errores por uno.
export const DIAS = [
  { dia: 0, corto: 'D', largo: 'Domingo' },
  { dia: 1, corto: 'L', largo: 'Lunes' },
  { dia: 2, corto: 'M', largo: 'Martes' },
  { dia: 3, corto: 'X', largo: 'Miércoles' },
  { dia: 4, corto: 'J', largo: 'Jueves' },
  { dia: 5, corto: 'V', largo: 'Viernes' },
  { dia: 6, corto: 'S', largo: 'Sábado' },
];

export const nombreDia = (dia) => DIAS.find((d) => d.dia === dia)?.largo ?? '';

function leerCopia() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CLAVE_COPIA) || '{}');
    return bruto && typeof bruto === 'object' ? bruto : {};
  } catch {
    return {};
  }
}

function guardarCopia(porDia) {
  try {
    localStorage.setItem(CLAVE_COPIA, JSON.stringify(porDia));
  } catch {
    // Sin almacenamiento la app funciona igual; solo se pierde la lectura sin
    // señal, que es una comodidad, no el mecanismo.
  }
}

// Devuelve lo guardado en el dispositivo al instante y, si hay conexión,
// refresca por detrás avisando cuando llegue lo del servidor.
export function cargarRutinas(alRefrescar) {
  const copia = leerCopia();

  if (navigator.onLine) {
    db.from('rutinas')
      .select('dia, texto')
      .then(({ data, error }) => {
        if (error || !data) return;
        const fresco = {};
        for (const fila of data) fresco[fila.dia] = fila.texto;
        guardarCopia(fresco);
        alRefrescar?.(fresco);
      });
  }

  return copia;
}

export async function guardarRutina(dia, texto) {
  // La copia local se actualiza primero: lo que acabas de escribir tiene que
  // seguir en pantalla aunque el servidor tarde o falle.
  const copia = leerCopia();
  copia[dia] = texto;
  guardarCopia(copia);

  if (!navigator.onLine) {
    return { error: { message: 'sin conexión: guardada solo en este dispositivo' } };
  }

  // upsert por clave primaria: la fila de un día existe o no, y en ambos casos
  // el resultado deseado es el mismo.
  const { error } = await db
    .from('rutinas')
    .upsert({ dia, texto, actualizada_en: new Date().toISOString() }, { onConflict: 'dia' });

  return { error };
}
