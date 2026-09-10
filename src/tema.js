// Temas: cómo se agrupan las notas.
//
// El tema se escribe dentro de la propia nota, con almohadilla: "llamar al
// dentista #salud". No hay pantalla de administrar temas ni lista que
// mantener — un tema existe mientras alguna nota lo use y desaparece solo
// cuando ninguna lo usa.
//
// Esa es la diferencia con un tablero. En Trello hay que decidir el tablero
// ANTES de escribir, y ese peaje de treinta segundos es lo que hizo que se
// abandonara. Aquí se decide escribiendo, o no se decide.

// Letras (con acentos), números, guion y guion bajo. Se corta en el espacio.
// La almohadilla debe ir al principio de palabra: así "C#" o "n.º 3" no crean
// temas por accidente.
const ETIQUETA = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/u;

export const SIN_TEMA = null;

// Extrae el tema y devuelve el texto ya sin la etiqueta.
//
// Solo se coge el primero: una nota pertenece a un tema, no a cinco. Permitir
// varios obligaría a decidir en cuál aparece al filtrar, y eso es justo el tipo
// de pregunta que este proyecto evita.
export function extraerTema(texto) {
  const encontrado = texto.match(ETIQUETA);
  if (!encontrado) return { tema: SIN_TEMA, limpio: texto.trim() };

  const tema = normalizarTema(encontrado[2]);

  // Se quita la etiqueta del texto: dejarla duplicaría la información, porque
  // el tema ya se muestra como su propia marca en la lista.
  const limpio = texto
    .replace(encontrado[0], encontrado[1])
    // La etiqueta puede dejar dos espacios donde había uno.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { tema, limpio };
}

// En minúsculas para que "#Salud" y "#salud" sean el mismo tema. Los acentos se
// conservan: "#diseño" y "#diseno" son palabras distintas y tratarlas como una
// sola sorprendería más de lo que ayudaría.
export function normalizarTema(bruto) {
  return bruto.trim().toLowerCase();
}

// Los temas que existen ahora mismo, con cuántas notas tiene cada uno, de más
// usado a menos. No hay tabla de temas: la lista se deduce de las notas, así
// que un tema vacío deja de existir sin que nadie lo borre.
export function temasDe(notas) {
  const cuenta = new Map();
  for (const nota of notas) {
    if (!nota.tema) continue;
    cuenta.set(nota.tema, (cuenta.get(nota.tema) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([tema, total]) => ({ tema, total }))
    .sort((a, b) => b.total - a.total || a.tema.localeCompare(b.tema, 'es'));
}


// --- Tema activo ---
//
// "Entrar" en un tema y seguir escribiendo sin repetir la etiqueta. Mientras
// hay uno activo, lo que se capture cae ahí solo.
//
// Vive en el dispositivo y no en la base: es un contexto de trabajo —dónde
// estoy escribiendo ahora mismo—, no un dato de la cuenta. Si mañana abro la
// app desde la computadora, no tengo por qué seguir dentro del tema en el que
// estaba con el celular.

const CLAVE_ACTIVO = 'miagenda-tema-activo';

export function leerTemaActivo() {
  try {
    return localStorage.getItem(CLAVE_ACTIVO) || null;
  } catch {
    // Almacenamiento bloqueado (ventana privada, permisos): se trabaja sin
    // tema activo, que es el comportamiento por defecto de todos modos.
    return null;
  }
}

export function guardarTemaActivo(tema) {
  try {
    if (tema) localStorage.setItem(CLAVE_ACTIVO, tema);
    else localStorage.removeItem(CLAVE_ACTIVO);
  } catch {
    // Ver arriba: no poder recordarlo no debe impedir capturar.
  }
}
