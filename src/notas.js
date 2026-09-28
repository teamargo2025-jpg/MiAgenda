// Lista de notas: ver, editar, marcar como hecha, borrar.
//
// Vive en su propia página a propósito. La pantalla de captura tiene que
// seguir siendo un campo y un botón: en cuanto se le cuelga una lista con
// acciones, deja de ser "suelto una idea en dos segundos".

import { db, configurado } from './supabase.js';
import { describirCuando } from './cuando.js';
import { extraerFecha, describirFecha } from './fecha.js';
import { exigirSesion, salir } from './sesion.js';
import { pendientesDe } from './sincronizar.js';
import { quitarDeCola } from './cola.js';
import { itemsDe, alternarItem, convertirA, progreso, ETIQUETAS, FORMATOS } from './formato.js';
import {
  cargarApartados,
  raices,
  hijosDe,
  buscarApartado,
  ramaDe,
} from './apartados.js';

const estado = document.getElementById('estado');
const vacio = document.getElementById('vacio');
const seccionPendientes = document.getElementById('seccion-pendientes');
const seccionHechas = document.getElementById('seccion-hechas');
const listaPendientes = document.getElementById('pendientes');
const listaHechas = document.getElementById('hechas');
const barraDeshacer = document.getElementById('deshacer');
const textoDeshacer = document.getElementById('deshacer-texto');
const botonDeshacer = document.getElementById('deshacer-boton');

// Fecha y hora de creación, siempre visibles. Una nota sin fecha es un trozo
// de texto suelto: saber cuándo se te ocurrió es la mitad de lo que la hace
// entendible tres semanas después.
const creadaEnTexto = (iso) => {
  const cuando = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const hora = cuando.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Para lo reciente, "hoy 14:32" se sitúa más rápido que "10 set., 14:32".
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(cuando, hoy)) return `hoy ${hora}`;
  if (mismoDia(cuando, ayer)) return `ayer ${hora}`;

  const mismoAnio = cuando.getFullYear() === hoy.getFullYear();
  return cuando.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    ...(mismoAnio ? {} : { year: 'numeric' }),
  }) + ` ${hora}`;
};

const decir = (mensaje, tipo = 'neutro') => {
  estado.textContent = mensaje;
  estado.dataset.estado = tipo;
  estado.hidden = !mensaje;
};

// --- Datos ---

async function traerNotas() {
  const { data, error } = await db
    .from('notas')
    .select('id, texto, recordar_en, notificada_en, hecha, creada_en, formato, apartado_id')
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

// --- Apartados ---

const barraApartados = document.getElementById('temas');

let apartados = [];
// null = todos. La cadena vacía es un valor real (las notas sin apartado), así
// que no puede usarse para decir "sin filtro".
let apartadoActivo = null;

function pintarApartados(notas) {
  const principales = raices(apartados);

  // Sin apartados creados no hay nada que filtrar, y una fila de pestañas que
  // no sirve para nada es ruido.
  if (principales.length === 0) {
    barraApartados.hidden = true;
    apartadoActivo = null;
    return;
  }

  const camino = apartadoActivo ? caminoActivo() : [];
  const raizActiva = camino[0] ?? null;

  const cuenta = (id) => {
    const rama = new Set(ramaDe(apartados, id));
    return notas.filter((x) => rama.has(x.apartado_id)).length;
  };

  const sinApartado = notas.filter((x) => !x.apartado_id).length;

  const fila = [botonFiltro(null, 'Todo', notas.length)];

  for (const a of principales) {
    fila.push(botonFiltro(a.id, a.nombre, cuenta(a.id), a.color, raizActiva?.id === a.id));
  }

  if (sinApartado > 0) fila.push(botonFiltro('', 'Sin apartado', sinApartado));

  // Los subapartados solo se despliegan bajo el suyo: enseñarlos todos haría
  // de la fila una lista larga en la que cuesta encontrar nada.
  if (raizActiva) {
    for (const h of hijosDe(apartados, raizActiva.id)) {
      fila.push(botonFiltro(h.id, '↳ ' + h.nombre, cuenta(h.id), h.color, apartadoActivo === h.id));
    }
  }

  // Dentro de un apartado concreto aparece la vía directa para seguir
  // añadiendo ahí: se entra a mirarlo y se acaba queriendo apuntar una más.
  if (apartadoActivo) {
    const entrar = document.createElement('a');
    entrar.className = 'entrar-tema';
    entrar.href = `/capturar.html?apartado=${encodeURIComponent(apartadoActivo)}`;
    entrar.textContent = '+ Añadir aquí';
    fila.push(entrar);
  }

  barraApartados.replaceChildren(...fila);
  barraApartados.hidden = false;
}

function botonFiltro(clave, etiqueta, total, color = null, activoForzado = null) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'chip';
  if (color) boton.dataset.color = color;

  const activo = activoForzado ?? clave === apartadoActivo;
  boton.setAttribute('aria-pressed', String(activo));

  if (color) {
    const punto = document.createElement('span');
    punto.className = 'punto-color';
    punto.setAttribute('aria-hidden', 'true');
    boton.append(punto);
  }
  boton.append(document.createTextNode(`${etiqueta} ${total}`));

  boton.addEventListener('click', () => {
    apartadoActivo = clave === apartadoActivo ? null : clave;
    pintarTodo();
  });

  return boton;
}

const caminoActivo = () => {
  const actual = buscarApartado(apartados, apartadoActivo);
  if (!actual) return [];
  return actual.padre_id ? [buscarApartado(apartados, actual.padre_id), actual] : [actual];
};

// Elegir un apartado general incluye lo que hay en sus subapartados: al entrar
// en "Proyectos" se espera verlo todo, no solo lo que quedó suelto en la raíz.
const enApartadoActivo = (nota) => {
  if (apartadoActivo === null) return true;
  if (apartadoActivo === '') return !nota.apartado_id;
  const rama = new Set(ramaDe(apartados, apartadoActivo));
  return rama.has(nota.apartado_id);
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

  const pie = document.createElement('div');
  pie.className = 'nota-chips';

  // La hora de creación se conoce aunque no haya subido: la puso el dispositivo
  // al capturarla.
  if (nota.creada_en) {
    const creada = document.createElement('time');
    creada.className = 'nota-creada';
    creada.dateTime = nota.creada_en;
    creada.textContent = creadaEnTexto(nota.creada_en);
    pie.append(creada);
  }

  const marca = document.createElement('span');
  marca.className = 'marca-espera';
  marca.textContent = nota.recordar_en
    ? `en el dispositivo · aviso ${describirCuando(nota.recordar_en)}`
    : 'en el dispositivo';
  marca.title = 'Se subirá cuando vuelva la conexión';
  pie.append(marca);

  cuerpo.append(texto, pie);

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
  alarma.addEventListener('click', () => {
    // Si la nota trae una fecha escrita que nunca llegó a aplicarse, el primer
    // toque la aplica en vez de abrir el calendario: es lo que se quiso decir
    // al escribirla, y hacérselo teclear otra vez sería cobrar dos veces.
    if (!nota.recordar_en && fechaEscritaDe(nota)) rescatarFecha(nota, alarma);
    else editarAlarma(nota, alarma);
  });

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

  const creada = document.createElement('time');
  creada.className = 'nota-creada';
  creada.dateTime = nota.creada_en;
  creada.textContent = creadaEnTexto(nota.creada_en);

  const chips = document.createElement('div');
  chips.className = 'nota-chips';
  chips.append(creada, alarma, formatoBoton);

  // A qué apartado pertenece, con su color. Tocarlo abre el selector para
  // moverla: desde que el apartado no se escribe dentro del texto, esta es la
  // única forma de cambiarlo, y tiene que estar donde se mira el dato.
  const suyo = nota.apartado_id ? buscarApartado(apartados, nota.apartado_id) : null;

  const sello = document.createElement('button');
  sello.type = 'button';
  sello.className = suyo ? 'sello-apartado' : 'nota-formato';
  if (suyo) {
    sello.dataset.color = suyo.color;
    const punto = document.createElement('span');
    punto.className = 'punto-color';
    punto.setAttribute('aria-hidden', 'true');
    sello.append(punto, document.createTextNode(suyo.nombre));
    sello.setAttribute('aria-label', `En ${suyo.nombre}. Tocar para mover`);
  } else {
    sello.textContent = 'sin apartado';
    sello.setAttribute('aria-label', 'Sin apartado. Tocar para elegir uno');
  }
  sello.addEventListener('click', () => abrirSelector(nota, cuerpo));
  chips.append(sello);

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

// La fecha que quedó escrita dentro del texto y nunca se aplicó. Pasa con lo
// capturado antes de que existiera el lector, y pasaría otra vez si algún día
// se escribe un "#" que en ese momento no se supo leer. Perder la fecha por eso
// sería hacerle pagar al usuario un cambio nuestro.
function fechaEscritaDe(nota) {
  if (nota.recordar_en || !nota.texto.includes('#')) return null;
  const { fecha } = extraerFecha(nota.texto);
  // Se enseña aunque ya haya pasado. Pedía que fuera futura, y eso volvía a
  // esconder en silencio una fecha perfectamente entendida: escribir "#29" el
  // día 29 por la tarde dejaba la nota igual que si no se hubiera escrito
  // nada. Esta pantalla ya muestra los avisos vencidos en vez de tragárselos
  // —haberse pasado no los hace menos importantes—, y aquí vale lo mismo.
  return fecha ?? null;
}

async function rescatarFecha(nota, boton) {
  const { fecha, limpio } = extraerFecha(nota.texto);
  if (!fecha) return;

  const iso = fecha.toISOString();
  const { error } = await db
    .from('notas')
    .update({ recordar_en: iso, texto: limpio, notificada_en: null })
    .eq('id', nota.id);

  if (error) {
    decir(`No se pudo poner el aviso: ${error.message}`, 'falla');
    return;
  }

  nota.recordar_en = iso;
  nota.texto = limpio;
  nota.notificada_en = null;
  decir(`Aviso puesto: ${describirCuando(iso)}.`, 'ok');
  pintarTodo();
}

function pintarAlarma(boton, nota) {
  if (!nota.recordar_en) {
    const escrita = fechaEscritaDe(nota);
    // Se enseña lo que se entendió, no un "aplicar fecha" genérico: hay que
    // poder ver si acertó antes de tocarlo.
    boton.textContent = escrita ? `Poner aviso ${describirFecha(escrita)}` : '+ recordar';
    boton.classList.toggle('por-aplicar', Boolean(escrita));
    // Una fecha escrita que ya pasó se marca como tal. Sigue pudiendo
    // aplicarse —queda como aviso vencido, que es lo que es— pero no debe
    // parecer que va a sonar.
    boton.classList.toggle('vencida', Boolean(escrita) && escrita <= new Date());
    boton.classList.remove('activa');
    return;
  }
  boton.classList.remove('por-aplicar');
  const vencida = new Date(nota.recordar_en) <= new Date();
  boton.textContent = `Aviso ${describirCuando(nota.recordar_en)}`;
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
  pintarApartados(notas);

  const visibles = notas.filter(enApartadoActivo);
  const pendientes = ordenarPendientes(visibles.filter((n) => !n.hecha));
  const hechas = visibles.filter((n) => n.hecha);
  const sinSubir = (await pendientesDe('nota')).filter(enApartadoActivo);

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

// Selector para mover una nota. Se abre dentro de la propia fila en vez de en
// un diálogo: la nota sigue a la vista mientras eliges, que es lo que permite
// decidir sin recordar de cuál se trataba.
function abrirSelector(nota, cuerpo) {
  const previo = cuerpo.querySelector('.selector-apartado');
  if (previo) {
    previo.remove();
    return;
  }

  const caja = document.createElement('div');
  caja.className = 'chips selector-apartado';

  const opcion = (id, etiqueta, color) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    if (color) chip.dataset.color = color;
    chip.setAttribute('aria-pressed', String((nota.apartado_id ?? null) === id));
    if (color) {
      const punto = document.createElement('span');
      punto.className = 'punto-color';
      punto.setAttribute('aria-hidden', 'true');
      chip.append(punto);
    }
    chip.append(document.createTextNode(etiqueta));
    chip.addEventListener('click', () => moverNota(nota, id));
    return chip;
  };

  caja.append(opcion(null, 'Sin apartado', null));
  for (const a of raices(apartados)) {
    caja.append(opcion(a.id, a.nombre, a.color));
    for (const h of hijosDe(apartados, a.id)) {
      caja.append(opcion(h.id, '↳ ' + h.nombre, h.color));
    }
  }

  cuerpo.append(caja);
}

async function moverNota(nota, apartadoId) {
  const anterior = nota.apartado_id ?? null;
  nota.apartado_id = apartadoId;
  pintarTodo();

  const { error } = await db
    .from('notas')
    .update({ apartado_id: apartadoId })
    .eq('id', nota.id);

  if (error) {
    // Se revierte: dejar la nota en pantalla dentro de un apartado en el que no
    // está guardada sería peor que no haberla movido.
    nota.apartado_id = anterior;
    decir(`No se pudo mover: ${error.message}`, 'falla');
    pintarTodo();
  }
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

    // El texto es solo texto: desde que los apartados son entidades, editar
    // una nota no puede moverla de sitio sin querer.
    const textoFinal = nuevo;

    elemento.textContent = textoFinal;
    const { error } = await db
      .from('notas')
      .update({ texto: textoFinal })
      .eq('id', nota.id);

    if (error) {
      // Se revierte lo mostrado: dejar en pantalla algo que no está guardado
      // es peor que no haber editado.
      elemento.textContent = nota.texto;
      decir(`No se pudo guardar el cambio: ${error.message}`, 'falla');
      return;
    }
    nota.texto = textoFinal;
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

  apartados = cargarApartados((frescos) => {
    apartados = frescos;
    pintarTodo();
  });

  pintarTodo();
}
