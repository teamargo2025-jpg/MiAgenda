// Lista de notas: ver, editar, marcar como hecha, borrar.
//
// Vive en su propia página a propósito. La pantalla de captura tiene que
// seguir siendo un campo y un botón: en cuanto se le cuelga una lista con
// acciones, deja de ser "suelto una idea en dos segundos".

import { db, configurado } from './supabase.js';
import { describirCuando } from './cuando.js';
import { exigirSesion, salir } from './sesion.js';

const estado = document.getElementById('estado');
const vacio = document.getElementById('vacio');
const seccionPendientes = document.getElementById('seccion-pendientes');
const seccionHechas = document.getElementById('seccion-hechas');
const listaPendientes = document.getElementById('pendientes');
const listaHechas = document.getElementById('hechas');
const barraDeshacer = document.getElementById('deshacer');
const textoDeshacer = document.getElementById('deshacer-texto');
const botonDeshacer = document.getElementById('deshacer-boton');

const decir = (mensaje, tipo = 'neutro') => {
  estado.textContent = mensaje;
  estado.dataset.estado = tipo;
  estado.hidden = !mensaje;
};

// --- Datos ---

async function traerNotas() {
  const { data, error } = await db
    .from('notas')
    .select('id, texto, recordar_en, notificada_en, hecha, creada_en')
    .order('creada_en', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Las que tienen hora van primero y por orden de vencimiento: son las que
// pueden pasárseme. Las sueltas van después, por orden de captura.
function ordenarPendientes(notas) {
  const conHora = notas.filter((n) => n.recordar_en);
  const sinHora = notas.filter((n) => !n.recordar_en);
  conHora.sort((a, b) => new Date(a.recordar_en) - new Date(b.recordar_en));
  return [...conHora, ...sinHora];
}

// --- Pintado ---

function crearFila(nota) {
  const li = document.createElement('li');
  li.dataset.id = nota.id;
  li.className = 'nota-fila';
  if (nota.hecha) li.classList.add('esta-hecha');

  const marca = document.createElement('input');
  marca.type = 'checkbox';
  marca.checked = nota.hecha;
  marca.setAttribute('aria-label', nota.hecha ? 'Marcar como pendiente' : 'Marcar como hecha');
  marca.addEventListener('change', () => alternarHecha(nota, marca.checked));

  const cuerpo = document.createElement('div');
  cuerpo.className = 'nota-cuerpo';

  const texto = document.createElement('div');
  texto.className = 'nota-texto';
  texto.textContent = nota.texto;
  texto.tabIndex = 0;
  texto.title = 'Tocar para editar';
  texto.addEventListener('click', () => editarTexto(nota, texto));
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editarTexto(nota, texto);
    }
  });

  const alarma = document.createElement('button');
  alarma.type = 'button';
  alarma.className = 'nota-alarma';
  pintarAlarma(alarma, nota);
  alarma.addEventListener('click', () => editarAlarma(nota, alarma));

  cuerpo.append(texto, alarma);

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'nota-borrar';
  borrar.textContent = 'x';
  borrar.setAttribute('aria-label', 'Borrar nota');
  borrar.addEventListener('click', () => borrarNota(nota));

  li.append(marca, cuerpo, borrar);
  return li;
}

function pintarAlarma(boton, nota) {
  if (!nota.recordar_en) {
    boton.textContent = '+ recordar';
    boton.classList.remove('vencida', 'activa');
    return;
  }
  const vencida = new Date(nota.recordar_en) <= new Date();
  boton.textContent = `⏰ ${describirCuando(nota.recordar_en)}`;
  boton.classList.toggle('vencida', vencida && !nota.notificada_en);
  boton.classList.toggle('activa', !vencida);
}

async function pintarTodo() {
  let notas;
  try {
    notas = await traerNotas();
  } catch (e) {
    decir(`No se pudieron cargar: ${e.message}`, 'falla');
    return;
  }

  decir('');

  const pendientes = ordenarPendientes(notas.filter((n) => !n.hecha));
  const hechas = notas.filter((n) => n.hecha);

  listaPendientes.replaceChildren(...pendientes.map(crearFila));
  listaHechas.replaceChildren(...hechas.map(crearFila));

  seccionPendientes.hidden = pendientes.length === 0;
  seccionHechas.hidden = hechas.length === 0;
  vacio.hidden = notas.length > 0;
}

// --- Acciones ---

async function alternarHecha(nota, hecha) {
  const { error } = await db.from('notas').update({ hecha }).eq('id', nota.id);
  if (error) {
    decir(`No se pudo actualizar: ${error.message}`, 'falla');
    return;
  }
  nota.hecha = hecha;
  pintarTodo();
}

// La edición sustituye el texto por un campo en el sitio, sin diálogos ni
// pantallas nuevas: la nota se queda donde estaba y se ve lo que se cambia.
function editarTexto(nota, elemento) {
  if (elemento.dataset.editando === 'si') return;
  elemento.dataset.editando = 'si';

  const campo = document.createElement('textarea');
  campo.className = 'nota-editor';
  campo.value = nota.texto;
  campo.rows = Math.max(1, Math.ceil(nota.texto.length / 40));

  const terminar = async (guardar) => {
    const nuevo = campo.value.trim();
    campo.replaceWith(elemento);
    elemento.dataset.editando = 'no';

    if (!guardar || !nuevo || nuevo === nota.texto) {
      elemento.textContent = nota.texto;
      return;
    }

    elemento.textContent = nuevo;
    const { error } = await db.from('notas').update({ texto: nuevo }).eq('id', nota.id);
    if (error) {
      // Se revierte lo mostrado: dejar en pantalla algo que no está guardado
      // es peor que no haber editado.
      elemento.textContent = nota.texto;
      decir(`No se pudo guardar el cambio: ${error.message}`, 'falla');
      return;
    }
    nota.texto = nuevo;
  };

  campo.addEventListener('blur', () => terminar(true));
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') terminar(false);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      terminar(true);
    }
  });

  elemento.replaceWith(campo);
  campo.focus();
  campo.setSelectionRange(campo.value.length, campo.value.length);
}

// El calendario nativo es una comodidad, no el mecanismo: el campo ya está en
// pantalla y se puede teclear. showPicker() lanza NotAllowedError cuando el
// navegador no considera la llamada parte de un gesto del usuario, y eso no
// puede tumbar la edición.
function abrirCalendario(campo) {
  try {
    campo.showPicker?.();
  } catch {
    // Sin calendario emergente; el campo sigue siendo editable a mano.
  }
}

function editarAlarma(nota, boton) {
  const campo = document.createElement('input');
  campo.type = 'datetime-local';
  campo.className = 'nota-editor';

  if (nota.recordar_en) {
    // datetime-local quiere hora local sin zona; se descuenta el desfase para
    // que muestre la hora que el usuario ve, no UTC.
    const d = new Date(nota.recordar_en);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    campo.value = local.toISOString().slice(0, 16);
  }

  const terminar = async () => {
    const valor = campo.value ? new Date(campo.value) : null;
    campo.replaceWith(boton);

    const iso = valor ? valor.toISOString() : null;
    if (iso === nota.recordar_en) return;

    // Cambiar la hora reabre el aviso: si ya se había notificado y ahora se
    // mueve a futuro, tiene que volver a sonar.
    const { error } = await db
      .from('notas')
      .update({ recordar_en: iso, notificada_en: null })
      .eq('id', nota.id);

    if (error) {
      decir(`No se pudo cambiar la hora: ${error.message}`, 'falla');
      return;
    }
    nota.recordar_en = iso;
    nota.notificada_en = null;
    pintarAlarma(boton, nota);
    pintarTodo();
  };

  campo.addEventListener('blur', terminar);
  campo.addEventListener('change', terminar);

  boton.replaceWith(campo);
  campo.focus();
  abrirCalendario(campo);
}

// Borrar con deshacer en vez de con un "estas seguro?".
//
// El dialogo de confirmacion pregunta antes de que se vea el efecto, asi que se
// contesta que si por costumbre y no protege de nada. Ensenar el resultado y
// ofrecer volver atras si protege — y ademas no estorba cuando el borrado era
// intencionado, que es casi siempre.
let deshacerPendiente = null;

async function borrarNota(nota) {
  const { error } = await db.from('notas').delete().eq('id', nota.id);
  if (error) {
    decir(`No se pudo borrar: ${error.message}`, 'falla');
    return;
  }

  pintarTodo();
  ofrecerDeshacer(nota);
}

function ofrecerDeshacer(nota) {
  clearTimeout(deshacerPendiente);
  deshacerPendiente = null;

  const recorte = nota.texto.length > 30 ? `${nota.texto.slice(0, 30)}…` : nota.texto;
  textoDeshacer.textContent = `Borrada: ${recorte}`;
  barraDeshacer.hidden = false;

  const restaurar = async () => {
    barraDeshacer.hidden = true;
    clearTimeout(deshacerPendiente);
    // Se reinserta con el mismo id: si la nota estaba referenciada desde la
    // bitácora de envíos, la referencia vuelve a tener sentido.
    const { error } = await db.from('notas').insert({
      id: nota.id,
      texto: nota.texto,
      recordar_en: nota.recordar_en,
      notificada_en: nota.notificada_en,
      hecha: nota.hecha,
      creada_en: nota.creada_en,
    });
    if (error) decir(`No se pudo restaurar: ${error.message}`, 'falla');
    pintarTodo();
  };

  botonDeshacer.onclick = restaurar;
  deshacerPendiente = setTimeout(() => {
    barraDeshacer.hidden = true;
  }, 7000);
}

// --- Arranque ---

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else {
  await exigirSesion();
  document.getElementById('salir')?.addEventListener('click', salir);
  pintarTodo();
}
