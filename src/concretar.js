// Preparar un apartado para llevárselo a Metis.
//
// Metis es una herramienta de Claude Code que aterriza una idea suelta hasta
// convertirla en un documento y un plan ejecutables. Vive en el editor, no en
// esta app — así que lo que se hace aquí es lo único que se puede hacer y lo
// único que hace falta: reunir todo lo que has ido soltando sobre un tema y
// dejarlo en un texto que se pega y ya.
//
// El formato no es decorativo. Metis empieza preguntando qué es la idea, para
// quién y qué problema resuelve; darle las notas en crudo obligaría a
// reconstruir eso a mano. Así que el texto se ordena por subapartado, se marca
// qué está hecho y qué no, y se abre con una frase que dice de qué va.

import { itemsDe } from './formato.js';

// Una nota en una línea, legible fuera de la app. Las checklists se aplanan
// conservando qué estaba marcado: esa información es parte de la idea.
function lineaDeNota(nota) {
  const formato = nota.formato ?? 'texto';

  if (formato === 'texto') return nota.texto.replace(/\n+/g, ' — ');

  return itemsDe(nota.texto)
    .map((item) => (item.tieneMarca ? `${item.marcada ? '[hecho] ' : ''}${item.texto}` : item.texto))
    .join('; ');
}

const fecha = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

export function textoParaMetis({ apartado, subapartados, notas }) {
  const porApartado = new Map();
  for (const nota of notas) {
    const clave = nota.apartado_id ?? apartado.id;
    if (!porApartado.has(clave)) porApartado.set(clave, []);
    porApartado.get(clave).push(nota);
  }

  const ordenar = (lista) =>
    [...lista].sort((a, b) => new Date(a.creada_en) - new Date(b.creada_en));

  const partes = [];

  partes.push(`# ${apartado.nombre}`);
  partes.push('');
  partes.push(
    `Estas son las notas que he ido soltando sobre ${apartado.nombre.toLowerCase()} en MiAgenda. ` +
      'Quiero aterrizarlas: qué es esto de verdad, para quién, qué resuelve y por dónde empezar.',
  );
  partes.push('');

  const sueltas = ordenar(porApartado.get(apartado.id) ?? []);
  if (sueltas.length) {
    partes.push('## Sin clasificar dentro del apartado');
    partes.push('');
    for (const nota of sueltas) partes.push(`- ${lineaDeNota(nota)}  _(${fecha(nota.creada_en)})_`);
    partes.push('');
  }

  for (const sub of subapartados) {
    const suyas = ordenar(porApartado.get(sub.id) ?? []);
    // Un subapartado vacío se nombra igualmente: que exista y no tenga nada
    // dentro también dice algo sobre por dónde no has avanzado.
    partes.push(`## ${sub.nombre}`);
    partes.push('');
    if (!suyas.length) {
      partes.push('_Creado pero todavía sin notas._');
    } else {
      for (const nota of suyas) partes.push(`- ${lineaDeNota(nota)}  _(${fecha(nota.creada_en)})_`);
    }
    partes.push('');
  }

  const total = notas.length;
  partes.push('---');
  partes.push('');
  partes.push(
    `${total} ${total === 1 ? 'nota' : 'notas'} en total, ` +
      `${subapartados.length} ${subapartados.length === 1 ? 'subapartado' : 'subapartados'}.`,
  );

  return partes.join('\n');
}
