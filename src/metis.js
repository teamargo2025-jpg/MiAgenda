// Pantalla que prepara un apartado para Metis.
//
// No llama a nada: Metis vive en Claude Code, no aquí. Lo que hace es reunir
// las notas del apartado y sus subapartados en un texto ordenado, listo para
// pegar. Que sea copiar y pegar es la razón de que funcione sin API, sin coste
// y sin conexión.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';
import { cargarApartados, buscarApartado, hijosDe, ramaDe } from './apartados.js';
import { textoParaMetis } from './concretar.js';

const el = (id) => document.getElementById(id);

const decir = (mensaje, tipo = 'neutro') => {
  el('estado').textContent = mensaje;
  el('estado').dataset.estado = tipo;
  el('estado').hidden = !mensaje;
};

const id = new URLSearchParams(location.search).get('id');

async function traerNotas(ids) {
  const { data, error } = await db
    .from('notas')
    .select('id, texto, formato, apartado_id, creada_en')
    .in('apartado_id', ids);

  if (error) throw new Error(error.message);
  return data ?? [];
}

el('copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('texto').textContent);
    decir('Copiado. Pégalo en Claude Code después de escribir /metis.', 'ok');
  } catch {
    // Sin permiso de portapapeles queda seleccionar a mano, que sigue
    // funcionando: el texto está ahí abajo.
    decir('Este navegador no deja copiar solo. Selecciona el texto y cópialo a mano.', 'falla');
  }
});

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else if (!id) {
  decir('Falta decir qué apartado concretar.', 'falla');
} else {
  await exigirSesion();

  const apartados = cargarApartados();
  const apartado = buscarApartado(apartados, id);

  if (!apartado) {
    decir('Ese apartado ya no existe.', 'falla');
  } else {
    el('nombre').textContent = apartado.nombre;
    el('volver').href = `/apartado.html?id=${encodeURIComponent(id)}`;
    document.body.dataset.color = apartado.color;

    const subapartados = hijosDe(apartados, id);

    try {
      const notas = await traerNotas(ramaDe(apartados, id));
      el('texto').textContent = textoParaMetis({ apartado, subapartados, notas });
      if (!notas.length) {
        decir('Este apartado todavía no tiene notas: no hay mucho que concretar.', 'neutro');
      }
    } catch (e) {
      decir(`No se pudieron cargar las notas: ${e.message}`, 'falla');
    }
  }
}
