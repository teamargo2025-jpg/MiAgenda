// Anotar gastos: cuánto y en qué.
//
// Mismo criterio que la captura de notas: si apuntar un gasto cuesta, no se
// apunta, y una lista incompleta de gastos no sirve para nada. Por eso no hay
// categorías, ni método de pago, ni fecha — dos campos y listo.
//
// El único número derivado es el total del mes, y va arriba: sin categorías,
// es lo que convierte una lista de apuntes en información.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';

const form = document.getElementById('form');
const monto = document.getElementById('monto');
const descripcion = document.getElementById('descripcion');
const boton = document.getElementById('guardar');
const aviso = document.getElementById('aviso');
const totalMes = document.getElementById('total-mes');
const totalDetalle = document.getElementById('total-detalle');
const seccionLista = document.getElementById('seccion-lista');
const lista = document.getElementById('lista');
const vacio = document.getElementById('vacio');
const barraDeshacer = document.getElementById('deshacer');
const textoDeshacer = document.getElementById('deshacer-texto');
const botonDeshacer = document.getElementById('deshacer-boton');

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

function inicioDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// --- Datos ---

async function traerGastos() {
  const { data, error } = await db
    .from('gastos')
    .select('id, monto, descripcion, gastado_en')
    .order('gastado_en', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function pintarTotal() {
  const desde = inicioDelMes();
  const { data, error } = await db
    .from('gastos')
    .select('monto')
    .gte('gastado_en', desde);

  if (error) {
    totalMes.textContent = '—';
    return;
  }

  // La suma se hace aquí y no en la base a propósito: para un solo usuario son
  // decenas de filas al mes, y traerlas evita montar una vista o una función
  // que habría que mantener. Si algún día fueran miles, se mueve.
  const total = (data ?? []).reduce((suma, g) => suma + Number(g.monto), 0);
  totalMes.textContent = soles(total);

  const cuantos = data?.length ?? 0;
  totalDetalle.textContent =
    cuantos === 0 ? 'sin gastos aún' : `${cuantos} ${cuantos === 1 ? 'gasto' : 'gastos'}`;
}

function crearFila(gasto) {
  const li = document.createElement('li');
  li.className = 'nota-fila gasto-fila';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'nota-cuerpo';

  const texto = document.createElement('div');
  texto.className = 'nota-texto';
  texto.textContent = gasto.descripcion;

  const cuando = document.createElement('span');
  cuando.className = 'gasto-fecha';
  cuando.textContent = fechaCorta(gasto.gastado_en);

  cuerpo.append(texto, cuando);

  const importe = document.createElement('strong');
  importe.className = 'gasto-monto';
  importe.textContent = soles(Number(gasto.monto));

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'nota-borrar';
  borrar.textContent = 'x';
  borrar.setAttribute('aria-label', 'Borrar gasto');
  borrar.addEventListener('click', () => borrarGasto(gasto));

  li.append(cuerpo, importe, borrar);
  return li;
}

async function pintarTodo() {
  let gastos;
  try {
    gastos = await traerGastos();
  } catch (e) {
    decir(`No se pudieron cargar: ${e.message}`, 'falla');
    return;
  }

  lista.replaceChildren(...gastos.map(crearFila));
  seccionLista.hidden = gastos.length === 0;
  vacio.hidden = gastos.length > 0;
  await pintarTotal();
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

  const enQue = descripcion.value.trim();
  if (!enQue) {
    decir('Falta decir en qué.', 'falla');
    descripcion.focus();
    return;
  }

  boton.disabled = true;
  decir('Guardando…');

  const { error } = await db.from('gastos').insert({ monto: valor, descripcion: enQue });
  boton.disabled = false;

  if (error) {
    // Igual que en las notas: lo escrito no se borra si falla.
    decir(`No se pudo guardar: ${error.message}. Los datos siguen aquí.`, 'falla');
    return;
  }

  monto.value = '';
  descripcion.value = '';
  monto.focus();
  decir(`Anotado ${soles(valor)}.`, 'ok');
  pintarTodo();
});

let deshacerPendiente = null;

async function borrarGasto(gasto) {
  const { error } = await db.from('gastos').delete().eq('id', gasto.id);
  if (error) {
    decir(`No se pudo borrar: ${error.message}`, 'falla');
    return;
  }

  pintarTodo();

  clearTimeout(deshacerPendiente);
  textoDeshacer.textContent = `Borrado ${soles(Number(gasto.monto))} · ${gasto.descripcion}`;
  barraDeshacer.hidden = false;

  botonDeshacer.onclick = async () => {
    barraDeshacer.hidden = true;
    clearTimeout(deshacerPendiente);
    const { error: fallo } = await db.from('gastos').insert({
      id: gasto.id,
      monto: gasto.monto,
      descripcion: gasto.descripcion,
      gastado_en: gasto.gastado_en,
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
  pintarTodo();
}
