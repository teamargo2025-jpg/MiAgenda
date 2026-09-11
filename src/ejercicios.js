// Interpreta una línea de rutina como un ejercicio.
//
// La rutina sigue siendo texto libre —"Press banca 4x8 60kg"— y no una tabla de
// ejercicios con su pantalla de administración. Escribir esa línea es más
// rápido que rellenar cuatro casillas, y el texto se puede corregir entero de
// una vez cuando cambias el plan.
//
// Lo que se hace aquí es leerlo para poder contar series y comparar con la
// última vez. Si una línea no encaja con ningún patrón, no se rompe nada: se
// trata como un ejercicio sin objetivo, que se puede registrar igual.

// "4x8", "4 x 8", "4X8". El peso es opcional y admite "60", "60kg", "60 kg",
// "60.5". Se acepta coma decimal porque en el teclado del celular sale antes.
const PATRON = /^(.*?)\s+(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*(?:con\s+)?(\d+(?:[.,]\d+)?)\s*(?:kg|k)?)?\s*$/i;

export function parsearEjercicio(linea) {
  const limpia = linea.trim();
  if (!limpia) return null;

  const encontrado = limpia.match(PATRON);
  if (!encontrado) {
    // Sin objetivo reconocible: "Dominadas al fallo", "Estiramientos". Se puede
    // registrar series igual, solo que sin nada con lo que compararlas.
    return { nombre: limpia, series: null, repeticiones: null, peso: null, crudo: limpia };
  }

  const [, nombre, series, repeticiones, peso] = encontrado;

  return {
    nombre: nombre.trim(),
    series: Number(series),
    repeticiones: Number(repeticiones),
    peso: peso ? Number(peso.replace(',', '.')) : null,
    crudo: limpia,
  };
}

export function ejerciciosDe(texto) {
  return (texto || '')
    .split('\n')
    .map((l) => parsearEjercicio(l))
    .filter(Boolean);
}

// Vuelve a escribir la línea desde sus partes. Se usa al cambiar el peso desde
// la tarjeta: el texto sigue siendo la fuente de verdad, así que un cambio en
// la pantalla tiene que poder volver a él sin perder nada.
export function escribirEjercicio({ nombre, series, repeticiones, peso }) {
  if (series === null || repeticiones === null) return nombre;
  const base = `${nombre} ${series}x${repeticiones}`;
  return peso === null || peso === undefined ? base : `${base} ${formatearPeso(peso)}kg`;
}

// Sin decimales cuando es entero: "60kg" y no "60.0kg".
export const formatearPeso = (peso) =>
  Number.isInteger(peso) ? String(peso) : String(Number(peso.toFixed(1)));

// Dos ejercicios son el mismo si se llaman igual, ignorando mayúsculas y
// espacios de más. El nombre ES la identidad: así, reordenar la rutina o
// cambiarle las series no rompe el historial de lo que ya levantaste.
export const claveEjercicio = (nombre) => nombre.trim().toLowerCase().replace(/\s+/g, ' ');

// Resume una tanda de series en "4×8 · 60kg", agrupando lo que se repite.
// Si en la sesión hubo variaciones —tres series a 60 y una a 55— lo dice, que
// es justo lo que hay que saber para decidir el peso de hoy.
export function resumirSeries(series) {
  if (!series.length) return '';

  const grupos = [];
  for (const s of series) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.repeticiones === s.repeticiones && ultimo.peso === s.peso) {
      ultimo.cuantas++;
    } else {
      grupos.push({ cuantas: 1, repeticiones: s.repeticiones, peso: s.peso });
    }
  }

  return grupos
    .map(({ cuantas, repeticiones, peso }) => {
      const base = `${cuantas}×${repeticiones}`;
      return peso ? `${base} · ${formatearPeso(peso)}kg` : base;
    })
    .join('  ');
}
