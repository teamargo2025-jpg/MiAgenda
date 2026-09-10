// Formatos de una nota: texto suelto, lista, o lista con casillas.
//
// El estado de las casillas vive dentro del propio texto, con marcas `[ ]` y
// `[x]` al principio de cada línea. Así la nota sigue siendo texto plano:
// cambiar de formato no destruye nada, y editarla a mano sigue funcionando.

export const FORMATOS = ['texto', 'lista', 'checklist'];

export const ETIQUETAS = {
  texto: 'Texto',
  lista: 'Lista',
  checklist: 'Checklist',
};

const MARCA = /^\s*\[( |x|X)\]\s?/;

// Divide en líneas, descartando las vacías: al pegar texto suelen colarse, y
// una viñeta vacía no significa nada.
export function lineasDe(texto) {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);
}

export function leerLinea(linea) {
  const encontrada = linea.match(MARCA);
  if (!encontrada) return { marcada: false, texto: linea, tieneMarca: false };
  return {
    marcada: encontrada[1].toLowerCase() === 'x',
    texto: linea.slice(encontrada[0].length),
    tieneMarca: true,
  };
}

export function itemsDe(texto) {
  return lineasDe(texto).map(leerLinea);
}

const escribirLinea = ({ marcada, texto }) => `[${marcada ? 'x' : ' '}] ${texto}`;

// Cambia el estado de una casilla y devuelve el texto completo ya reescrito.
export function alternarItem(texto, indice) {
  const items = itemsDe(texto);
  if (!items[indice]) return texto;
  items[indice] = { ...items[indice], marcada: !items[indice].marcada };
  return items.map(escribirLinea).join('\n');
}

// Al pasar a checklist hay que poner marcas donde no las había; al salir, hay
// que quitarlas. Si no, el texto suelto acabaría lleno de "[ ]" visibles.
export function convertirA(formato, texto) {
  const items = itemsDe(texto);

  if (formato === 'checklist') {
    return items.map(escribirLinea).join('\n');
  }

  // Tanto 'lista' como 'texto' guardan las líneas limpias. La diferencia entre
  // ambos es solo cómo se pintan, así que cambiar entre ellos no toca el texto.
  return items.map((item) => item.texto).join('\n');
}

// Cuántas quedan por marcar, para el resumen de la lista.
export function progreso(texto) {
  const items = itemsDe(texto);
  const hechas = items.filter((i) => i.marcada).length;
  return { hechas, total: items.length };
}
