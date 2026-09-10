// Anotar dinero: lo que sale y lo que entra.
//
// Mismo criterio que la captura de notas: si apuntar cuesta, no se apunta, y un
// registro incompleto de gastos no sirve para nada — peor aún, engaña, porque
// los totales parecen datos.
//
// La categoría se escribe dentro de la descripción con almohadilla ("almuerzo
// #comida"), igual que los temas de las notas. Sin lista de categorías que
// mantener y sin elegir una antes de apuntar.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';
import { encolar, nuevoId, soportaCola, quitarDeCola } from './cola.js';
import { pendientesDe, sincronizarEnSegundoPlano } from './sincronizar.js';
import { extraerTema } from './tema.js';
import { resumen, delMes } from './cuentas.js';

const form = document.getElementById('form');
const monto = document.getElementById('monto');
const descripcion = document.getElementById('descripcion');
const boton = document.getElementById('guardar');
const aviso = document.getElementById('aviso');
const avisoCategoria = document.getElementById('categoria-detectada');
const seccionLista = document.getElementById('seccion-lista');
const lista = document.getElementById('lista');
const vacio = document.getElementById('vacio');
const barraDeshacer = document.getElementById('deshacer');
const textoDeshacer = document.getElementById('deshacer-texto');
const botonDeshacer = document.getElementById('deshacer-boton');

const cifras = {
  balance: document.getElementById('balance'),
  ingresos: document.getElementById('ingresos'),
  gastos: document.getElementById('gastos'),
};

const decir = (mensaje, estado = 'neutro') => {
  aviso.textContent = mensaje;
  aviso.dataset.estado = estado;
};

const soles = (n) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(n);

const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

// Acepta "18", "18.50" y "18,50": en el teclado del celular la coma sale antes
// que el punto, y rechazar por eso sería absurdo.
function leerMonto(texto) {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const valor = Number(limpio);
  return valor > 0 ? valor : null;
}

// --- Tipo ---

const chipsTipo = [...form.querySelectorAll('[data-tipo]')];
let tipoElegido = 'gasto';

const pintarTipo = () => {
  for (const chip of chipsTipo) {
    chip.setAttribute('aria-pressed', String(chip.dataset.tipo === tipoElegido));
  }
  form.dataset.tipo = tipoElegido;
};

for (const chip of chipsTipo) {
  chip.addEventListener('click', () => {
    tipoElegido = chip.dataset.tipo;
    pintarTipo();
    monto.focus();
  });
}

pintarTipo();

// --- Categoría ---

descripcion.addEventListener('input', () => {
  const { tema } = extraerTema(descripcion.value);
  avisoCategoria.hidden = !tema;
  if (tema) avisoCategoria.textContent = `→ categoría #${tema}`;
});

// --- Datos ---

async function traerMovimientos() {
  const { data, error } = await db
    .from('movimientos')
    .select('id, tipo, monto, descripcion, categoria, ocurrido_en')
    .order('ocurrido_en', { ascending: false })
    .limit(60);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function pintarResumen(movimientos) {
  const { ingresos, gastos, balance } = resumen(delMes(movimientos));

  cifras.ingresos.textContent = soles(ingresos);
  cifras.gastos.textContent = soles(gastos);
  cifras.balance.textContent = soles(balance);
  // Un balance negativo no se marca solo con el signo: el menos delante de una
  // cifra se pasa por alto justo cuando más importa verlo.
  cifras.balance.dataset.negativo = String(balance < 0);
}

function crearFila(movimiento) {
  const li = document.createElement('li');
  li.className = 'nota-fila gasto-fila';
  li.dataset.tipo = movimiento.tipo;
  if (movimiento.sinSubir) li.classList.add('sin-subir');

  const cuerpo = document.createElement('div');
  cuerpo.className = 'nota-cuerpo';

  const texto = document.createElement('div');
  texto.className = 'nota-texto';
  texto.textContent = movimiento.descripcion;

  const pie = document.createElement('div');
  pie.className = 'nota-chips';

  const cuando = document.createElement('span');
  cuando.className = movimiento.sinSubir ? 'marca-espera' : 'gasto-fecha';
  cuando.textContent = movimiento.sinSubir
    ? 'en el dispositivo'
    : fechaCorta(movimiento.ocurrido_en);
  pie.append(cuando);

  if (movimiento.categoria) {
    const etiqueta = document.createElement('span');
    etiqueta.className = 'nota-tema';
    etiqueta.textContent = `#${movimiento.categoria}`;
    pie.append(etiqueta);
  }

  cuerpo.append(texto, pie);

  const importe = document.createElement('strong');
  importe.className = 'gasto-monto';
  // El signo hace evidente de un vistazo en qué dirección va el dinero, sin
  // tener que fijarse en el color ni en la posición.
  const signo = movimiento.tipo === 'ingreso' ? '+' : '−';
  importe.textContent = `${signo} ${soles(Number(movimiento.monto))}`;

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'nota-borrar';
  borrar.textContent = 'x';
  borrar.setAttribute('aria-label', 'Borrar movimiento');
  borrar.addEventListener('click', () => borrar1(movimiento));

  li.append(cuerpo, importe, borrar);
  return li;
}

async function pintarTodo() {
  // Si el servidor no responde se sigue con lista vacía: lo que está en el
  // dispositivo tiene que verse igual. Salir aquí dejaría la pantalla en blanco
  // justo cuando acabas de anotar algo sin señal.
  let movimientos = [];
  try {
    movimientos = await traerMovimientos();
  } catch (e) {
    if (navigator.onLine) decir(`No se pudieron cargar: ${e.message}`, 'falla');
  }

  const enCola = (await pendientesDe('movimiento')).map((e) => ({ ...e, sinSubir: true }));
  const todos = [...enCola, ...movimientos];

  lista.replaceChildren(...todos.map(crearFila));
  seccionLista.hidden = todos.length === 0;
  vacio.hidden = todos.length > 0;

  // Lo pendiente de subir cuenta en el resumen: un balance que no incluye lo
  // que acabas de anotar sin señal es un balance equivocado, y encima justo
  // cuando lo estás mirando para decidir si gastas más.
  pintarResumen(todos);
}

// --- Acciones ---

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const valor = leerMonto(monto.value);
  if (valor === null) {
    decir('El monto no se entiende. Prueba con algo como 18.50', 'falla');
    monto.focus();
    return;
  }

  const { tema: categoria, limpio } = extraerTema(descripcion.value);
  if (!limpio) {
    decir('Falta decir en qué.', 'falla');
    descripcion.focus();
    return;
  }

  boton.disabled = true;
  decir('Guardando…');

  const fila = {
    id: nuevoId(),
    tipo: tipoElegido,
    monto: valor,
    descripcion: limpio,
    categoria,
    ocurrido_en: new Date().toISOString(),
  };

  const guardado = await guardar(fila);
  boton.disabled = false;
  if (guardado === 'falla') return;

  monto.value = '';
  descripcion.value = '';
  avisoCategoria.hidden = true;
  monto.focus();

  const verbo = tipoElegido === 'ingreso' ? 'Ingreso' : 'Gasto';
  const enCategoria = categoria ? ` en #${categoria}` : '';
  const cola = guardado === 'cola' ? ' — se subirá al volver la conexión' : '';
  decir(`${verbo} de ${soles(valor)}${enCategoria} anotado${cola}.`, 'ok');
  pintarTodo();
});

// Devuelve 'servidor', 'cola' o 'falla'. Mismo criterio que en las notas: solo
// se guarda en local lo que falló por no poder llegar al servidor; un error de
// datos no se arregla esperando, así que se dice.
async function guardar(fila) {
  if (navigator.onLine) {
    const { error } = await db.from('movimientos').insert(fila);
    if (!error) return 'servidor';
    if (error.code && error.message !== 'Failed to fetch') {
      decir(`No se pudo guardar: ${error.message}. Los datos siguen aquí.`, 'falla');
      return 'falla';
    }
  }

  if (!soportaCola) {
    decir('Sin conexión y este navegador no puede guardar en el dispositivo.', 'falla');
    return 'falla';
  }

  try {
    await encolar({ ...fila, coleccion: 'movimiento' });
    return 'cola';
  } catch {
    decir('No se pudo guardar en el dispositivo. Los datos siguen aquí.', 'falla');
    return 'falla';
  }
}

let deshacerPendiente = null;

async function borrar1(movimiento) {
  // Lo que todavía está en la cola se quita de ahí: intentar borrarlo del
  // servidor no haría nada, porque nunca llegó.
  if (movimiento.sinSubir) {
    await quitarDeCola(movimiento.id);
    pintarTodo();
    return;
  }

  const { error } = await db.from('movimientos').delete().eq('id', movimiento.id);
  if (error) {
    decir(`No se pudo borrar: ${error.message}`, 'falla');
    return;
  }

  pintarTodo();

  clearTimeout(deshacerPendiente);
  textoDeshacer.textContent = `Borrado ${soles(Number(movimiento.monto))} · ${movimiento.descripcion}`;
  barraDeshacer.hidden = false;

  botonDeshacer.onclick = async () => {
    barraDeshacer.hidden = true;
    clearTimeout(deshacerPendiente);
    const { error: fallo } = await db.from('movimientos').insert({
      id: movimiento.id,
      tipo: movimiento.tipo,
      monto: movimiento.monto,
      descripcion: movimiento.descripcion,
      categoria: movimiento.categoria,
      ocurrido_en: movimiento.ocurrido_en,
    });
    if (fallo) decir(`No se pudo restaurar: ${fallo.message}`, 'falla');
    pintarTodo();
  };

  deshacerPendiente = setTimeout(() => {
    barraDeshacer.hidden = true;
  }, 7000);
}

// Enter en el monto salta a la descripción en vez de enviar a medias.
monto.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    descripcion.focus();
  }
});

// --- Arranque ---

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else {
  await exigirSesion();
  sincronizarEnSegundoPlano(() => pintarTodo());
  pintarTodo();
}
