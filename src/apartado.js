// La pantalla de un apartado: sus subapartados y sus notas.
//
// Un apartado no es un filtro: es un sitio al que se entra. Por eso tiene
// pantalla propia, migas de pan para saber de dónde cuelga, y una cuadrícula
// de destinos en vez de una lista de etiquetas.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';
import {
  cargarApartados,
  crearApartado,
  renombrarApartado,
  recolorearApartado,
  colorLibre,
  hijosDe,
  buscarApartado,
  caminoDe,
  ramaDe,
  COLORES,
} from './apartados.js';
import { itemsDe } from './formato.js';

const el = (id) => document.getElementById(id);

const estado = el('estado');
const decir = (mensaje, tipo = 'neutro') => {
  estado.textContent = mensaje;
  estado.dataset.estado = tipo;
  estado.hidden = !mensaje;
};

const id = new URLSearchParams(location.search).get('id');

let apartados = [];
let notas = [];

// --- Pintado ---

function actual() {
  return buscarApartado(apartados, id);
}

function pintarCabecera() {
  const yo = actual();
  if (!yo) {
    decir('Este apartado ya no existe.', 'falla');
    return false;
  }

  document.title = `${yo.nombre} — MiAgenda`;
  el('titulo').textContent = yo.nombre;
  document.body.dataset.color = yo.color;

  // Migas solo si cuelga de otro: en un apartado de primer nivel no hay
  // camino que mostrar, y una miga de un solo paso es ruido.
  const camino = caminoDe(apartados, id);
  const migas = el('migas');
  if (camino.length > 1) {
    migas.replaceChildren();
    camino.slice(0, -1).forEach((paso) => {
      const enlace = document.createElement('a');
      enlace.href = `/apartado.html?id=${encodeURIComponent(paso.id)}`;
      enlace.textContent = paso.nombre;
      migas.append(enlace, document.createTextNode(' / '));
    });
    migas.hidden = false;
  } else {
    migas.hidden = true;
  }

  el('anadir').href = `/capturar.html?apartado=${encodeURIComponent(id)}`;
  el('metis').href = `/metis.html?id=${encodeURIComponent(id)}`;

  // Un subapartado no puede tener subapartados: dos niveles bastan para
  // organizar y evitan decidir cómo se navega una profundidad cualquiera.
  const esRaiz = !yo.padre_id;
  el('titulo-sub').parentElement.hidden = !esRaiz;
  el('cuadricula').hidden = !esRaiz;
  el('crear-sub').hidden = true;

  return true;
}

function cuentaDe(apartadoId) {
  const rama = new Set(ramaDe(apartados, apartadoId));
  return notas.filter((n) => rama.has(n.apartado_id) && !n.hecha).length;
}

function pintarCuadricula() {
  const yo = actual();
  if (!yo || yo.padre_id) return;

  const hijos = hijosDe(apartados, id);
  el('sin-sub').hidden = hijos.length > 0;

  el('cuadricula').replaceChildren(
    ...hijos.map((h) => {
      const celda = document.createElement('a');
      celda.className = 'celda';
      celda.dataset.color = h.color;
      celda.href = `/apartado.html?id=${encodeURIComponent(h.id)}`;

      const nombre = document.createElement('span');
      nombre.className = 'celda-nombre';
      nombre.textContent = h.nombre;

      const cuenta = document.createElement('span');
      cuenta.className = 'celda-cuenta';
      const total = cuentaDe(h.id);
      cuenta.textContent = total === 1 ? '1 nota' : `${total} notas`;

      celda.append(nombre, cuenta);
      return celda;
    }),
  );
}

function pintarNotas() {
  // Las de este apartado y, si es de primer nivel, las de sus subapartados:
  // al entrar en "Proyectos" se espera ver todo lo que hay dentro.
  const rama = new Set(ramaDe(apartados, id));
  const mias = notas
    .filter((n) => rama.has(n.apartado_id))
    .sort((a, b) => Number(a.hecha) - Number(b.hecha) || new Date(b.creada_en) - new Date(a.creada_en));

  el('sin-notas').hidden = mias.length > 0;

  el('lista').replaceChildren(
    ...mias.map((nota) => {
      const li = document.createElement('li');
      li.className = 'nota-fila';
      if (nota.hecha) li.classList.add('esta-hecha');

      const cuerpo = document.createElement('div');
      cuerpo.className = 'nota-cuerpo';

      const texto = document.createElement('div');
      texto.className = 'nota-texto';
      const formato = nota.formato ?? 'texto';
      texto.textContent =
        formato === 'texto'
          ? nota.texto
          : itemsDe(nota.texto).map((i) => i.texto).join(' · ');

      cuerpo.append(texto);

      // De qué subapartado viene, cuando se está mirando el padre. Sin esto,
      // una lista mezclada no dice de dónde sale cada cosa.
      const suyo = buscarApartado(apartados, nota.apartado_id);
      if (suyo && suyo.id !== id) {
        const chips = document.createElement('div');
        chips.className = 'nota-chips';
        const sello = document.createElement('span');
        sello.className = 'sello-apartado';
        sello.dataset.color = suyo.color;
        const punto = document.createElement('span');
        punto.className = 'punto-color';
        punto.setAttribute('aria-hidden', 'true');
        sello.append(punto, document.createTextNode(suyo.nombre));
        chips.append(sello);
        cuerpo.append(chips);
      }

      li.append(cuerpo);
      return li;
    }),
  );
}

function pintarTodo() {
  if (!pintarCabecera()) return;
  pintarCuadricula();
  pintarNotas();
}

// --- Acciones ---

el('nuevo-sub').addEventListener('click', () => {
  const caja = el('crear-sub');
  caja.hidden = !caja.hidden;
  if (!caja.hidden) el('nombre-sub').focus();
});

async function crearSub() {
  const nombre = el('nombre-sub').value.trim();
  if (!nombre) return;

  el('confirmar-sub').disabled = true;
  const { apartado, error } = await crearApartado({
    nombre,
    color: colorLibre(apartados),
    padreId: id,
    orden: hijosDe(apartados, id).length,
  });
  el('confirmar-sub').disabled = false;

  if (error) {
    decir(`No se pudo crear: ${error.message}`, 'falla');
    return;
  }

  apartados = [...apartados, apartado];
  el('nombre-sub').value = '';
  el('crear-sub').hidden = true;
  decir('');
  pintarTodo();
}

el('confirmar-sub').addEventListener('click', crearSub);
el('nombre-sub').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    crearSub();
  }
});

el('renombrar').addEventListener('click', async () => {
  const yo = actual();
  if (!yo) return;

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.value = yo.nombre;
  campo.className = 'nota-editor';
  campo.setAttribute('aria-label', 'Nuevo nombre');

  const titulo = el('titulo');
  titulo.replaceWith(campo);
  campo.focus();
  campo.select();

  const terminar = async () => {
    const nombre = campo.value.trim();
    campo.replaceWith(titulo);
    if (!nombre || nombre === yo.nombre) return;

    yo.nombre = nombre;
    pintarTodo();

    const { error } = await renombrarApartado(id, nombre);
    if (error) decir(`No se pudo renombrar: ${error.message}`, 'falla');
  };

  campo.addEventListener('blur', terminar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      campo.blur();
    }
  });
});

el('abrir-colores').addEventListener('click', () => {
  const caja = el('colores');
  if (!caja.hidden) {
    caja.hidden = true;
    return;
  }

  const yo = actual();
  caja.replaceChildren(
    ...COLORES.map(({ clave, nombre }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.color = clave;
      chip.setAttribute('aria-pressed', String(yo?.color === clave));
      chip.setAttribute('aria-label', nombre);

      const punto = document.createElement('span');
      punto.className = 'punto-color';
      punto.setAttribute('aria-hidden', 'true');
      chip.append(punto, document.createTextNode(nombre));

      chip.addEventListener('click', async () => {
        yo.color = clave;
        caja.hidden = true;
        pintarTodo();
        const { error } = await recolorearApartado(id, clave);
        if (error) decir(`No se pudo cambiar el color: ${error.message}`, 'falla');
      });

      return chip;
    }),
  );
  caja.hidden = false;
});

// --- Datos ---

async function traerNotas() {
  const { data, error } = await db
    .from('notas')
    .select('id, texto, hecha, formato, apartado_id, creada_en')
    .not('apartado_id', 'is', null);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// --- Arranque ---

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else if (!id) {
  decir('Falta decir qué apartado abrir.', 'falla');
} else {
  await exigirSesion();

  apartados = cargarApartados((frescos) => {
    apartados = frescos;
    pintarTodo();
  });

  try {
    notas = await traerNotas();
  } catch (e) {
    if (navigator.onLine) decir(`No se pudieron cargar las notas: ${e.message}`, 'falla');
  }

  pintarTodo();
}
