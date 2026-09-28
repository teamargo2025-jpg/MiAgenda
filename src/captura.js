// Pantalla de captura. Lo único que hace: recoger una línea y guardarla.
//
// El objetivo declarado del proyecto es que anotar cueste menos que no anotar,
// así que aquí se decide lo mínimo: dónde va y qué dice. Se escribe y se
// guarda — con señal o sin ella.
//
// El apartado ocupa el primer sitio porque es la decisión que se toma siempre.
// La fecha va plegada detrás de un botón: solo una nota de cada varias lleva
// recordatorio, y tenerla desplegada cobraba un peaje visual en todas.

import { db, configurado } from './supabase.js';
import { crearSelectorDeCuando, describirCuando } from './cuando.js';
import { exigirSesion } from './sesion.js';
import { encolar, nuevoId, soportaCola } from './cola.js';
import { pendientesDe, sincronizarEnSegundoPlano } from './sincronizar.js';
import { crearDictado, soportaVoz } from './voz.js';
import { convertirA, lineasDe } from './formato.js';
import {
  cargarApartados,
  crearApartado,
  colorLibre,
  raices,
  hijosDe,
  buscarApartado,
  caminoDe,
} from './apartados.js';

const form = document.getElementById('form');
const texto = document.getElementById('texto');
const boton = document.getElementById('guardar');
const aviso = document.getElementById('aviso');
const recientes = document.getElementById('recientes');
const lista = document.getElementById('lista');

const cuando = crearSelectorDeCuando({
  contenedor: document.getElementById('cuando'),
  campoLibre: document.getElementById('fecha-libre'),
});

const decir = (mensaje, estado = 'neutro') => {
  aviso.textContent = mensaje;
  aviso.dataset.estado = estado;
};

// --- Apartados ---

const CLAVE_ELEGIDO = 'miagenda-apartado-elegido';

const filaApartados = document.getElementById('apartados');
const filaSub = document.getElementById('subapartados');
const cajaNuevo = document.getElementById('nuevo-apartado');
const campoNuevo = document.getElementById('nombre-apartado');
const botonCrear = document.getElementById('crear-apartado');

let apartados = [];
// El elegido se recuerda entre sesiones: se captura en rachas dentro del mismo
// apartado, y volver a elegirlo en cada nota sería el peaje que este proyecto
// existe para quitar.
let elegido = leerElegido();

function leerElegido() {
  try {
    return localStorage.getItem(CLAVE_ELEGIDO) || null;
  } catch {
    return null;
  }
}

function guardarElegido(id) {
  try {
    if (id) localStorage.setItem(CLAVE_ELEGIDO, id);
    else localStorage.removeItem(CLAVE_ELEGIDO);
  } catch {
    // Sin almacenamiento se pierde el recuerdo, no la captura.
  }
}

function chipApartado(apartado, activo) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.dataset.color = apartado.color;
  chip.setAttribute('aria-pressed', String(activo));

  const punto = document.createElement('span');
  punto.className = 'punto-color';
  punto.setAttribute('aria-hidden', 'true');

  chip.append(punto, document.createTextNode(apartado.nombre));

  chip.addEventListener('click', () => {
    // Volver a tocar el elegido lo deselecciona: dejar una nota sin clasificar
    // tiene que costar lo mismo que clasificarla.
    elegido = elegido === apartado.id ? null : apartado.id;
    guardarElegido(elegido);
    pintarApartados();
  });

  return chip;
}

function pintarApartados() {
  const principales = raices(apartados);
  const camino = elegido ? caminoDe(apartados, elegido) : [];
  const raizActiva = camino[0] ?? null;

  filaApartados.replaceChildren(
    ...principales.map((a) => chipApartado(a, raizActiva?.id === a.id)),
    chipNuevo(),
  );

  // Los subapartados solo aparecen cuando su padre está elegido: enseñarlos
  // todos convertiría la fila en una lista de veinte, y elegir volvería a ser
  // una tarea en vez de un gesto.
  const hijos = raizActiva ? hijosDe(apartados, raizActiva.id) : [];
  filaSub.hidden = hijos.length === 0;
  if (hijos.length) {
    filaSub.replaceChildren(...hijos.map((h) => chipApartado(h, elegido === h.id)));
  }
}

function chipNuevo() {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip chip-nuevo';
  chip.textContent = '+ Apartado';
  chip.addEventListener('click', () => {
    cajaNuevo.hidden = !cajaNuevo.hidden;
    if (!cajaNuevo.hidden) campoNuevo.focus();
  });
  return chip;
}

async function crearDesdeCaptura() {
  const nombre = campoNuevo.value.trim();
  if (!nombre) return;

  botonCrear.disabled = true;
  const { apartado, error } = await crearApartado({
    nombre,
    color: colorLibre(apartados),
  });
  botonCrear.disabled = false;

  if (error) {
    decir(`No se pudo crear el apartado: ${error.message}`, 'falla');
    return;
  }

  apartados = [...apartados, apartado];
  elegido = apartado.id;
  guardarElegido(elegido);
  campoNuevo.value = '';
  cajaNuevo.hidden = true;
  pintarApartados();
  texto.focus();
}

botonCrear.addEventListener('click', crearDesdeCaptura);
campoNuevo.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    crearDesdeCaptura();
  }
});

// --- Recordatorio plegado ---

const abrirCuando = document.getElementById('abrir-cuando');
const filaCuando = document.getElementById('cuando');

abrirCuando.addEventListener('click', () => {
  const abierto = !filaCuando.hidden;
  filaCuando.hidden = abierto;
  abrirCuando.setAttribute('aria-pressed', String(!abierto));
  if (abierto) cuando.limpiar();
});

const plegarCuando = () => {
  filaCuando.hidden = true;
  abrirCuando.setAttribute('aria-pressed', 'false');
  cuando.limpiar();
};

// --- Formato ---

const grupoFormato = document.getElementById('formato');
const chipsFormato = [...grupoFormato.querySelectorAll('[data-formato]')];
let formatoElegido = 'texto';

const pintarFormato = () => {
  for (const chip of chipsFormato) {
    chip.setAttribute('aria-pressed', String(chip.dataset.formato === formatoElegido));
  }
};

// El selector aparece y desaparece según haga falta. Una nota de una línea no
// tiene formato posible, y ofrecerlo sería añadir una decisión a la captura.
const repasarFormato = () => {
  const varias = lineasDe(texto.value).length > 1;
  grupoFormato.hidden = !varias;
  if (!varias && formatoElegido !== 'texto') {
    formatoElegido = 'texto';
    pintarFormato();
  }
};

for (const chip of chipsFormato) {
  chip.addEventListener('click', () => {
    formatoElegido = chip.dataset.formato;
    pintarFormato();
    // Al elegir checklist se ven las casillas en el propio campo, para que no
    // haya sorpresa entre lo que se escribe y lo que se guarda.
    texto.value = convertirA(formatoElegido, texto.value);
  });
}

texto.addEventListener('input', repasarFormato);

// --- Dictado ---

const microfono = document.getElementById('microfono');

// Lo que había escrito antes de empezar a dictar. El dictado se añade a
// continuación en vez de reemplazarlo: se puede escribir media frase, dictar el
// resto, y seguir escribiendo.
let textoPrevio = '';

const dictado = crearDictado({
  alTexto(transcrito) {
    const separador = textoPrevio && !textoPrevio.endsWith(' ') ? ' ' : '';
    texto.value = textoPrevio + separador + transcrito;
    repasarFormato();
  },
  alEstado(estado) {
    const escuchando = estado === 'escuchando';
    microfono.setAttribute('aria-pressed', String(escuchando));
    microfono.classList.toggle('escuchando', escuchando);
    if (escuchando) decir('Escuchando…');
    else if (aviso.textContent === 'Escuchando…') decir('');
  },
  alError(mensaje) {
    decir(mensaje, 'falla');
  },
});

if (soportaVoz && dictado) {
  microfono.hidden = false;

  microfono.addEventListener('click', () => {
    if (!dictado.escuchando && !navigator.onLine) {
      // Chrome manda el audio a Google para transcribirlo, así que el dictado
      // necesita internet aunque el resto de la captura no. Decirlo antes es
      // mejor que dejar que falle con un error de red.
      decir('El dictado necesita internet. Sin señal puedes escribir igual.', 'falla');
      return;
    }
    textoPrevio = dictado.escuchando ? textoPrevio : texto.value.trim();
    dictado.alternar();
  });
}

// --- Últimas ---

const formatearFecha = (iso) =>
  new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// Se muestran unas pocas notas recientes como acuse de recibo: ver la frase
// aparecer en la lista es lo que convence de que quedó guardada.
async function pintarRecientes() {
  if (!configurado) return;

  const { data } = await db
    .from('notas')
    .select('id, texto, creada_en, recordar_en, apartado_id')
    .order('creada_en', { ascending: false })
    .limit(5);

  // Lo que aún no ha subido se muestra igual, y arriba. Capturar algo sin señal
  // y no verlo en ningún sitio se siente exactamente como haberlo perdido.
  const enCola = await pendientesDe('nota');

  const todas = [...enCola.map((e) => ({ ...e, sinSubir: true })), ...(data ?? [])].slice(0, 5);

  if (!todas.length) {
    recientes.hidden = true;
    return;
  }

  lista.replaceChildren(
    ...todas.map((nota) => {
      const li = document.createElement('li');
      if (nota.sinSubir) li.classList.add('sin-subir');

      const cuerpo = document.createElement('span');
      cuerpo.className = 'texto';
      cuerpo.textContent = nota.texto.split('\n')[0].replace(/^\[[ xX]\]\s?/, '');

      const derecha = document.createElement('span');
      derecha.className = 'nota-chips';

      // A qué apartado pertenece, con su color. Es lo que permite reconocer de
      // un vistazo si la nota cayó donde tocaba.
      const suyo = nota.apartado_id ? buscarApartado(apartados, nota.apartado_id) : null;
      if (suyo) derecha.append(selloApartado(suyo));

      const marca = document.createElement('time');
      if (nota.sinSubir) {
        marca.textContent = 'en el dispositivo';
        marca.title = 'Se subirá cuando vuelva la conexión';
      } else if (nota.recordar_en) {
        marca.dateTime = nota.recordar_en;
        marca.textContent = describirCuando(nota.recordar_en);
        marca.classList.add('con-alarma');
      } else {
        marca.dateTime = nota.creada_en;
        marca.textContent = formatearFecha(nota.creada_en);
      }

      derecha.append(marca);
      li.append(cuerpo, derecha);
      return li;
    }),
  );
  recientes.hidden = false;
}

export function selloApartado(apartado) {
  const sello = document.createElement('span');
  sello.className = 'sello-apartado';
  sello.dataset.color = apartado.color;
  const punto = document.createElement('span');
  punto.className = 'punto-color';
  punto.setAttribute('aria-hidden', 'true');
  sello.append(punto, document.createTextNode(apartado.nombre));
  return sello;
}

// --- Guardar ---

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const contenido = texto.value.trim();
  if (!contenido) return;

  if (!configurado) {
    decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
    return;
  }

  const problema = cuando.problema();
  if (problema) {
    decir(`No se guardó: ${problema}.`, 'falla');
    return;
  }

  boton.disabled = true;
  decir('Guardando…');

  const recordarEn = cuando.valor();
  // El id se genera aquí: la nota tiene identidad antes de existir en el
  // servidor, así que reintentar la subida no puede duplicarla.
  const fila = {
    id: nuevoId(),
    texto: convertirA(formatoElegido, contenido),
    recordar_en: recordarEn,
    formato: formatoElegido,
    apartado_id: elegido,
    // La hora la pone el dispositivo y no el servidor: si la nota se captura
    // sin señal y sube tres horas después, la fecha correcta es cuando se te
    // ocurrió, no cuando hubo cobertura.
    creada_en: new Date().toISOString(),
  };

  const guardado = await guardar(fila);
  boton.disabled = false;

  if (guardado === 'falla') return;

  dictado?.parar();
  textoPrevio = '';
  texto.value = '';
  formatoElegido = 'texto';
  pintarFormato();
  repasarFormato();
  plegarCuando();
  texto.focus();

  const suyo = elegido ? buscarApartado(apartados, elegido) : null;
  const dondeVa = suyo ? ` en ${suyo.nombre}` : '';
  const base = recordarEn
    ? `Guardado${dondeVa}. Te aviso ${describirCuando(recordarEn)}`
    : `Guardado${dondeVa}`;

  decir(guardado === 'cola' ? `${base} — se subirá al volver la conexión.` : `${base}.`, 'ok');
  pintarRecientes();
});

// Devuelve 'servidor', 'cola' o 'falla'.
async function guardar(fila) {
  if (navigator.onLine) {
    const { error } = await db.from('notas').insert(fila);
    if (!error) return 'servidor';

    // Un error de datos (texto inválido, sesión caducada) no se arregla
    // esperando, así que no se encola: se dice. Solo se guarda en local lo que
    // falló por no poder llegar al servidor.
    if (!esFalloDeRed(error)) {
      decir(`No se pudo guardar: ${error.message}. El texto sigue aquí.`, 'falla');
      return 'falla';
    }
  }

  if (!soportaCola) {
    decir('Sin conexión y este navegador no puede guardar en el dispositivo.', 'falla');
    return 'falla';
  }

  try {
    await encolar({ ...fila, coleccion: 'nota' });
    return 'cola';
  } catch {
    decir('No se pudo guardar en el dispositivo. El texto sigue aquí.', 'falla');
    return 'falla';
  }
}

// supabase-js no distingue el fallo de red del rechazo del servidor con un
// código propio: cuando no hay respuesta, llega un TypeError de fetch sin
// `code`. Es lo que se usa para separarlos.
function esFalloDeRed(error) {
  return !error.code || error.message === 'Failed to fetch';
}

// Ctrl+Enter (o Cmd+Enter) guarda sin levantar la mano del teclado.
texto.addEventListener('keydown', (evento) => {
  if ((evento.metaKey || evento.ctrlKey) && evento.key === 'Enter') {
    form.requestSubmit();
  }
});

// El service worker se registra también aquí: si la primera visita es a la
// captura, la app debe quedar instalable desde ahí.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

// --- Arranque ---

await exigirSesion();

// Se puede llegar desde un apartado concreto (…/capturar.html?apartado=<id>).
// El parámetro manda sobre lo recordado: es una acción que se acaba de hacer.
const pedido = new URLSearchParams(location.search).get('apartado');
if (pedido) {
  elegido = pedido;
  guardarElegido(elegido);
  history.replaceState(null, '', location.pathname);
}

apartados = cargarApartados((frescos) => {
  apartados = frescos;
  // Si el apartado recordado ya no existe —se borró desde otro dispositivo—,
  // se suelta en vez de guardar notas contra un identificador fantasma.
  if (elegido && !buscarApartado(apartados, elegido)) {
    elegido = null;
    guardarElegido(null);
  }
  pintarApartados();
  pintarRecientes();
});

pintarApartados();
sincronizarEnSegundoPlano(() => pintarRecientes());
pintarRecientes();
