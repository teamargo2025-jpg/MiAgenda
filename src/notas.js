// Lista de notas: ver, editar, marcar como hecha, borrar.
//
// Vive en su propia página a propósito. La pantalla de captura tiene que
// seguir siendo un campo y un botón: en cuanto se le cuelga una lista con
// acciones, deja de ser "suelto una idea en dos segundos".

import { db, configurado } from './supabase.js';
import { describirCuando } from './cuando.js';
import { exigirSesion, salir } from './sesion.js';
import { pendientesDe } from './sincronizar.js';
import { quitarDeCola } from './cola.js';
import { itemsDe, alternarItem, convertirA, progreso, ETIQUETAS, FORMATOS } from './formato.js';
import { extraerTema, temasDe } from './tema.js';

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
    .select('id, texto, recordar_en, notificada_en, hecha, creada_en, formato, tema')
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

// --- Temas ---

const barraTemas = document.getElementById('temas');

// null = todos. La cadena vacía es un valor real (el tema "sin tema"), así que
// no puede usarse para decir "sin filtro".
let temaActivo = null;

function pintarTemas(notas) {
  const temas = temasDe(notas);
  const sinTema = notas.filter((n) => !n.tema).length;

  // Con un solo tema no hay nada que filtrar, y una fila de pestañas que no
  // sirve para nada es ruido.
  if (temas.length === 0) {
    barraTemas.hidden = true;
    temaActivo = null;
    return;
  }

  const opciones = [
    { clave: null, etiqueta: 'Todos', total: notas.length },
    ...temas.map((t) => ({ clave: t.tema, etiqueta: `#${t.tema}`, total: t.total })),
  ];

  if (sinTema > 0) opciones.push({ clave: '', etiqueta: 'Sin tema', total: sinTema });

  // Si el tema activo se quedó sin notas —se movió la última, o se borró—, el
  // filtro volvería a una pantalla vacía sin explicar por qué. Se vuelve a
  // Todos.
  if (temaActivo !== null && !opciones.some((o) => o.clave === temaActivo)) {
    temaActivo = null;
  }

  // Al estar dentro de un tema aparece la vía directa para seguir añadiendo
  // ahí. Es el gesto natural: se entra a mirar un tema y se acaba queriendo
  // apuntar una más.
  const entrar = document.createElement('a');
  entrar.className = 'entrar-tema';
  entrar.href = `/capturar.html?tema=${encodeURIComponent(temaActivo ?? '')}`;
  entrar.textContent = `+ Añadir a #${temaActivo}`;

  barraTemas.replaceChildren(
    ...opciones.map((opcion) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'chip';
      boton.textContent = `${opcion.etiqueta} ${opcion.total}`;
      boton.setAttribute('aria-pressed', String(opcion.clave === temaActivo));
      boton.addEventListener('click', () => {
        temaActivo = opcion.clave === temaActivo ? null : opcion.clave;
        pintarTodo();
      });
      return boton;
    }),
  );

  // Solo cuando hay un tema concreto activo: en "Todos" o en "Sin tema" no hay
  // un destino al que añadir.
  if (temaActivo) barraTemas.append(entrar);

  barraTemas.hidden = false;
}

const enTemaActivo = (nota) => {
  if (temaActivo === null) return true;
  if (temaActivo === '') return !nota.tema;
  return nota.tema === temaActivo;
};

// --- Pintado ---

// Una nota que sigue en la cola se muestra, pero sin las acciones que exigen
// que exista en el servidor: marcarla como hecha o cambiarle la hora no tendría
// dónde guardarse. Borrar sí, porque quitarla de la cola es una acción local.
function crearFilaPendiente(nota) {
  const li = document.createElement('li');
  li.className = 'nota-fila sin-subir';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'nota-cuerpo';

  // Se pinta con el mismo formato que tendrá una vez subida. Enseñar "[ ] pan"
  // en crudo haría dudar de si se guardó bien, justo en el momento en que menos
  // se puede comprobar.
  const texto = crearCuerpo(nota, { soloLectura: true });

  const marca = document.createElement('span');
  marca.className = 'marca-espera';
  marca.textContent = nota.recordar_en
    ? `en el dispositivo · ⏰ ${describirCuando(nota.recordar_en)}`
    : 'en el dispositivo';
  marca.title = 'Se subirá cuando vuelva la conexión';

  cuerpo.append(texto, marca);

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'nota-borrar';
  borrar.textContent = 'x';
  borrar.setAttribute('aria-label', 'Descartar nota sin subir');
  borrar.addEventListener('click', async () => {
    await quitarDeCola(nota.id);
    pintarTodo();
  });

  li.append(cuerpo, borrar);
  return li;
}

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

  const texto = crearCuerpo(nota);

  const alarma = document.createElement('button');
  alarma.type = 'button';
  alarma.className = 'nota-alarma';
  pintarAlarma(alarma, nota);
  alarma.addEventListener('click', () => editarAlarma(nota, alarma));

  const formatoBoton = document.createElement('button');
  formatoBoton.type = 'button';
  formatoBoton.className = 'nota-formato';
  pintarFormato(formatoBoton, nota);
  // Cicla entre los tres en vez de abrir un desplegable: son tres opciones y
  // verlas cambiar en el sitio explica mejor qué hace cada una que sus nombres.
  formatoBoton.addEventListener('click', () => {
    const actual = FORMATOS.indexOf(nota.formato ?? 'texto');
    cambiarFormato(nota, FORMATOS[(actual + 1) % FORMATOS.length]);
  });

  const chips = document.createElement('div');
  chips.className = 'nota-chips';
  chips.append(alarma, formatoBoton);

  if (nota.tema) {
    const tema = document.createElement('button');
    tema.type = 'button';
    tema.className = 'nota-tema';
    tema.textContent = `#${nota.tema}`;
    tema.setAttribute('aria-label', `Ver solo el tema ${nota.tema}`);
    // Tocar el tema de una nota filtra por él: es el gesto que uno intenta
    // instintivamente al ver una etiqueta.
    tema.addEventListener('click', () => {
      temaActivo = nota.tema;
      pintarTodo();
    });
    chips.append(tema);
  }

  cuerpo.append(texto, chips);

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'nota-borrar';
  borrar.textContent = 'x';
  borrar.setAttribute('aria-label', 'Borrar nota');
  borrar.addEventListener('click', () => borrarNota(nota));

  li.append(marca, cuerpo, borrar);
  return li;
}

// El cuerpo cambia según el formato. Texto suelto se edita tocándolo; las
// listas se pintan como tales, y en la checklist cada línea es una casilla que
// se marca sin entrar a editar.
function crearCuerpo(nota, { soloLectura = false } = {}) {
  const formato = nota.formato ?? 'texto';

  if (formato === 'texto') {
    if (!soloLectura) return crearTextoEditable(nota);
    const plano = document.createElement('div');
    plano.className = 'nota-texto';
    plano.textContent = nota.texto;
    return plano;
  }

  const contenedor = document.createElement('ul');
  contenedor.className = formato === 'checklist' ? 'nota-checklist' : 'nota-viñetas';

  itemsDe(nota.texto).forEach((item, indice) => {
    const li = document.createElement('li');

    if (formato === 'checklist') {
      const casilla = document.createElement('input');
      casilla.type = 'checkbox';
      casilla.checked = item.marcada;
      casilla.setAttribute('aria-label', item.texto);
      // Sin subir aún no se puede marcar: la casilla se guarda escribiendo en
      // el servidor, y esa nota todavía no existe allí.
      if (soloLectura) casilla.disabled = true;
      else casilla.addEventListener('change', () => marcarItem(nota, indice));

      const etiqueta = document.createElement('span');
      etiqueta.textContent = item.texto;
      if (item.marcada) etiqueta.className = 'item-marcado';

      li.append(casilla, etiqueta);
    } else {
      li.textContent = item.texto;
    }

    contenedor.append(li);
  });

  // Tocar el hueco de al lado abre la edición del texto entero, que es la vía
  // para añadir o quitar líneas sin inventarse otra interfaz.
  const envoltorio = document.createElement('div');
  envoltorio.className = 'nota-texto';
  envoltorio.append(contenedor);

  if (!soloLectura) {
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'nota-editar-texto';
    editar.textContent = 'Editar líneas';
    editar.addEventListener('click', () => editarTexto(nota, envoltorio));
    envoltorio.append(editar);
  }

  return envoltorio;
}

function pintarFormato(boton, nota) {
  const formato = nota.formato ?? 'texto';
  boton.textContent = ETIQUETAS[formato];
  boton.setAttribute('aria-label', `Formato: ${ETIQUETAS[formato]}. Tocar para cambiar`);

  // En una checklist el dato útil no es el nombre del formato sino cuánto
  // queda, así que lo sustituye.
  if (formato === 'checklist') {
    const { hechas, total } = progreso(nota.texto);
    boton.textContent = `${hechas}/${total}`;
    boton.classList.toggle('completa', total > 0 && hechas === total);
  } else {
    boton.classList.remove('completa');
  }
}

function crearTextoEditable(nota) {
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
  return texto;
}

async function marcarItem(nota, indice) {
  const nuevo = alternarItem(nota.texto, indice);
  const { error } = await db.from('notas').update({ texto: nuevo }).eq('id', nota.id);
  if (error) {
    decir(`No se pudo marcar: ${error.message}`, 'falla');
    pintarTodo();
    return;
  }
  nota.texto = nuevo;
  pintarTodo();
}

// Cambiar el formato reescribe el texto: al entrar en checklist se ponen las
// marcas y al salir se quitan, para que el texto plano no acabe lleno de "[ ]".
async function cambiarFormato(nota, formato) {
  const nuevoTexto = convertirA(formato, nota.texto);
  const { error } = await db
    .from('notas')
    .update({ formato, texto: nuevoTexto })
    .eq('id', nota.id);

  if (error) {
    decir(`No se pudo cambiar el formato: ${error.message}`, 'falla');
    return;
  }
  nota.formato = formato;
  nota.texto = nuevoTexto;
  pintarTodo();
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
  // Si el servidor no responde se sigue con lista vacía: lo que está en el
  // dispositivo tiene que verse igual. Salir aquí dejaría la pantalla en blanco
  // justo cuando acabas de capturar algo sin señal.
  let notas = [];
  try {
    notas = await traerNotas();
  } catch (e) {
    if (navigator.onLine) decir(`No se pudieron cargar: ${e.message}`, 'falla');
  }

  decir('');

  // Las pestañas se calculan sobre TODAS las notas, no sobre las filtradas: si
  // no, al entrar en un tema desaparecerían los demás y no habría forma de
  // volver.
  pintarTemas(notas);

  const visibles = notas.filter(enTemaActivo);
  const pendientes = ordenarPendientes(visibles.filter((n) => !n.hecha));
  const hechas = visibles.filter((n) => n.hecha);
  const sinSubir = (await pendientesDe('nota')).filter(enTemaActivo);

  listaPendientes.replaceChildren(
    ...sinSubir.map(crearFilaPendiente),
    ...pendientes.map(crearFila),
  );
  listaHechas.replaceChildren(...hechas.map(crearFila));

  seccionPendientes.hidden = pendientes.length === 0 && sinSubir.length === 0;
  seccionHechas.hidden = hechas.length === 0;
  botonVaciar.hidden = hechas.length === 0;
  botonVaciar.textContent = `Borrar ${hechas.length}`;
  botonVaciar.onclick = () => vaciarHechas(hechas);
  vacio.hidden = visibles.length + sinSubir.length > 0;
}

// --- Acciones ---

let deshacerPendiente = null;
const botonVaciar = document.getElementById('vaciar-hechas');

// Borrar en bloque las que ya están hechas. Con deshacer igual que el borrado
// de una sola: aquí el arrepentimiento cuesta más caro, no menos.
async function vaciarHechas(hechas) {
  const ids = hechas.map((n) => n.id);
  const { error } = await db.from('notas').delete().in('id', ids);
  if (error) {
    decir(`No se pudieron borrar: ${error.message}`, 'falla');
    return;
  }

  pintarTodo();
  ofrecerDeshacerVarias(hechas);
}

function ofrecerDeshacerVarias(notas) {
  clearTimeout(deshacerPendiente);
  textoDeshacer.textContent = `Borradas ${notas.length} notas hechas`;
  barraDeshacer.hidden = false;

  botonDeshacer.onclick = async () => {
    barraDeshacer.hidden = true;
    clearTimeout(deshacerPendiente);
    const { error } = await db.from('notas').insert(
      notas.map((n) => ({
        id: n.id,
        texto: n.texto,
        recordar_en: n.recordar_en,
        notificada_en: n.notificada_en,
        hecha: n.hecha,
        creada_en: n.creada_en,
        formato: n.formato ?? 'texto',
      })),
    );
    if (error) decir(`No se pudieron restaurar: ${error.message}`, 'falla');
    pintarTodo();
  };

  deshacerPendiente = setTimeout(() => {
    barraDeshacer.hidden = true;
  }, 7000);
}

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

    // Se vuelve a leer el tema: escribir "#otro" al editar mueve la nota de
    // tema, igual que al capturarla. Es la única forma de cambiarla de tema, y
    // funciona sin aprender nada nuevo.
    const { tema, limpio } = extraerTema(nuevo);
    const textoFinal = limpio || nuevo;

    elemento.textContent = textoFinal;
    const { error } = await db
      .from('notas')
      .update({ texto: textoFinal, tema })
      .eq('id', nota.id);

    if (error) {
      // Se revierte lo mostrado: dejar en pantalla algo que no está guardado
      // es peor que no haber editado.
      elemento.textContent = nota.texto;
      decir(`No se pudo guardar el cambio: ${error.message}`, 'falla');
      return;
    }
    nota.texto = textoFinal;
    nota.tema = tema;
    pintarTodo();
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
