// Apartados: dónde va cada nota.
//
// Sustituyen a los temas escritos con almohadilla. La diferencia no es de
// forma sino de naturaleza: un apartado existe aunque esté vacío, tiene color
// elegido y puede contener subapartados. Una etiqueta escrita no hacía nada de
// eso.
//
// Se leen siempre de una copia en el dispositivo y se refrescan por detrás: la
// pantalla de captura no puede esperar a la red para enseñarte dónde guardar
// lo que acabas de pensar.

import { db } from './supabase.js';

const CLAVE_COPIA = 'miagenda-apartados';

// El color se guarda por su nombre y la app decide el valor exacto en cada
// tema. Guardar el hexadecimal dejaría que un color elegido en claro quedara
// ilegible en oscuro, y nadie va a revisar eso al elegirlo.
export const COLORES = [
  { clave: 'indigo', nombre: 'Añil' },
  { clave: 'acero', nombre: 'Acero' },
  { clave: 'verde', nombre: 'Verde' },
  { clave: 'violeta', nombre: 'Violeta' },
  { clave: 'ambar', nombre: 'Ámbar' },
  { clave: 'rosa', nombre: 'Rosa' },
  { clave: 'oliva', nombre: 'Oliva' },
  { clave: 'ciruela', nombre: 'Ciruela' },
];

export const esColorValido = (clave) => COLORES.some((c) => c.clave === clave);

// El color siguiente de la lista que nadie esté usando todavía. Al crear un
// apartado conviene que venga ya con un color distinto: elegir uno es una
// decisión más, y si todos nacen del mismo color el recurso no sirve de nada.
export function colorLibre(apartados) {
  const usados = new Set(apartados.map((a) => a.color));
  return (COLORES.find((c) => !usados.has(c.clave)) ?? COLORES[0]).clave;
}

function leerCopia() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CLAVE_COPIA) || '[]');
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function guardarCopia(apartados) {
  try {
    localStorage.setItem(CLAVE_COPIA, JSON.stringify(apartados));
  } catch {
    // Sin almacenamiento se pierde la lectura sin señal, no los datos.
  }
}

// Devuelve lo que haya en el dispositivo al instante y refresca por detrás.
export function cargarApartados(alRefrescar) {
  if (navigator.onLine) {
    db.from('apartados')
      .select('id, nombre, color, padre_id, orden, creado_en')
      .order('orden', { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) return;

        // Aquí sí se reemplaza en vez de fusionar, al revés que en las rutinas:
        // esta lista tiene que poder ENCOGER. Si borras un apartado desde otro
        // dispositivo, fusionar lo resucitaría para siempre.
        //
        // El riesgo —que una respuesta vacía por sesión caducada borre la copia—
        // se cubre distinto: solo se acepta una lista vacía si el servidor
        // responde habiendo sesión, y sin ella la consulta no llega aquí.
        guardarCopia(data);
        alRefrescar?.(data);
      });
  }

  return leerCopia();
}

export async function crearApartado({ nombre, color, padreId = null, orden = 0 }) {
  const fila = {
    nombre: nombre.trim(),
    color: esColorValido(color) ? color : 'indigo',
    padre_id: padreId,
    orden,
  };

  const { data, error } = await db.from('apartados').insert(fila).select().single();
  if (error) return { error };

  guardarCopia([...leerCopia(), data]);
  return { apartado: data };
}

export async function renombrarApartado(id, nombre) {
  const limpio = nombre.trim();
  if (!limpio) return { error: { message: 'el nombre no puede quedar vacío' } };

  guardarCopia(leerCopia().map((a) => (a.id === id ? { ...a, nombre: limpio } : a)));
  const { error } = await db.from('apartados').update({ nombre: limpio }).eq('id', id);
  return { error };
}

export async function recolorearApartado(id, color) {
  if (!esColorValido(color)) return { error: { message: 'color desconocido' } };

  guardarCopia(leerCopia().map((a) => (a.id === id ? { ...a, color } : a)));
  const { error } = await db.from('apartados').update({ color }).eq('id', id);
  return { error };
}

export async function borrarApartado(id) {
  // Los subapartados caen con él por la clave foránea; las notas quedan sin
  // clasificar, no se borran.
  guardarCopia(leerCopia().filter((a) => a.id !== id && a.padre_id !== id));
  const { error } = await db.from('apartados').delete().eq('id', id);
  return { error };
}

// --- Consultas de forma ---

export const raices = (apartados) =>
  apartados.filter((a) => !a.padre_id).sort(ordenar);

export const hijosDe = (apartados, padreId) =>
  apartados.filter((a) => a.padre_id === padreId).sort(ordenar);

const ordenar = (a, b) =>
  a.orden - b.orden || new Date(a.creado_en) - new Date(b.creado_en);

export const buscarApartado = (apartados, id) => apartados.find((a) => a.id === id) ?? null;

// El camino desde la raíz hasta este apartado, para las migas de pan y para
// saber de qué apartado general cuelga un subapartado.
export function caminoDe(apartados, id) {
  const camino = [];
  let actual = buscarApartado(apartados, id);
  while (actual) {
    camino.unshift(actual);
    actual = actual.padre_id ? buscarApartado(apartados, actual.padre_id) : null;
  }
  return camino;
}

// Un apartado y todo lo que cuelga de él. Es lo que hace falta para contar
// notas de una rama entera o para exportarla.
export function ramaDe(apartados, id) {
  const hijos = hijosDe(apartados, id);
  return [id, ...hijos.map((h) => h.id)];
}
