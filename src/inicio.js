// El lobby: a dónde se llega al abrir la app.
//
// Existe porque entrar directamente a un campo de texto con el teclado
// levantándose es brusco: la app pide antes de saludar. Pero un lobby que solo
// saluda es un toque de más, así que tiene que ganarse el sitio contando algo
// que ahorre entrar a mirarlo: qué toca hoy, cuánto queda pendiente y cómo va
// el mes.
//
// Capturar sigue a un toque desde cualquier pantalla, y aquí es lo más grande
// que hay.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';
import { pendientesDe, sincronizarEnSegundoPlano } from './sincronizar.js';
import { describirCuando } from './cuando.js';
import { resumen, delMes } from './cuentas.js';

const estado = document.getElementById('estado');
const seccionHoy = document.getElementById('seccion-hoy');
const listaHoy = document.getElementById('hoy');
const seccionResumen = document.getElementById('seccion-resumen');
const sinNada = document.getElementById('sin-nada');

const decir = (mensaje, tipo = 'neutro') => {
  estado.textContent = mensaje;
  estado.dataset.estado = tipo;
  estado.hidden = !mensaje;
};

const soles = (n) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(n);

// --- Saludo ---

// Un saludo genérico ("Hola") no aporta nada. Uno que reconoce la hora sí:
// abrir la app a las once de la noche y que diga "buenas noches" es la
// diferencia entre una herramienta y algo que sabe que estás ahí.
function momentoDelDia(hora = new Date().getHours()) {
  if (hora < 6) return 'Buenas noches';
  if (hora < 13) return 'Buenos días';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

document.getElementById('momento').textContent = momentoDelDia();
document.getElementById('fecha').textContent = new Date()
  .toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
  .replace(/^./, (c) => c.toUpperCase());

// --- Hoy ---

const esHoy = (iso) => {
  const cuando = new Date(iso);
  const hoy = new Date();
  return cuando.toDateString() === hoy.toDateString();
};

async function traerNotas() {
  const { data, error } = await db
    .from('notas')
    .select('id, texto, recordar_en, hecha, tema')
    .eq('hecha', false);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function traerMovimientos() {
  const { data, error } = await db
    .from('movimientos')
    .select('tipo, monto, ocurrido_en');

  if (error) throw new Error(error.message);
  return data ?? [];
}

function pintarHoy(notas) {
  // Lo de hoy y lo que ya venció sin hacerse. Un recordatorio que se pasó no
  // deja de importar por haber pasado — al contrario.
  const ahora = new Date();
  const relevantes = notas
    .filter((n) => n.recordar_en && (esHoy(n.recordar_en) || new Date(n.recordar_en) < ahora))
    .sort((a, b) => new Date(a.recordar_en) - new Date(b.recordar_en));

  seccionHoy.hidden = relevantes.length === 0;
  if (!relevantes.length) return;

  listaHoy.replaceChildren(
    ...relevantes.slice(0, 6).map((nota) => {
      const li = document.createElement('li');
      li.className = 'nota-fila';

      const cuerpo = document.createElement('div');
      cuerpo.className = 'nota-cuerpo';

      const texto = document.createElement('div');
      texto.className = 'nota-texto';
      // Solo la primera línea: en el lobby interesa reconocer la nota, no
      // leerla entera. Para eso está su pantalla.
      texto.textContent = nota.texto.split('\n')[0].replace(/^\[[ xX]\]\s?/, '');

      const cuando = document.createElement('span');
      const vencida = new Date(nota.recordar_en) < ahora;
      cuando.className = vencida ? 'marca-vencida' : 'gasto-fecha';
      cuando.textContent = describirCuando(nota.recordar_en);

      cuerpo.append(texto, cuando);
      li.append(cuerpo);
      return li;
    }),
  );
}

function pintarResumen(notas, movimientos) {
  document.getElementById('cifra-notas').textContent = String(notas.length);

  const { balance } = resumen(delMes(movimientos));
  const nodo = document.getElementById('cifra-balance');
  nodo.textContent = soles(balance);
  nodo.dataset.negativo = String(balance < 0);

  seccionResumen.hidden = false;
}

async function pintarTodo() {
  let notas = [];
  let movimientos = [];
  let fallo = null;

  // Las dos consultas van en paralelo: son independientes, y encadenarlas
  // duplicaría la espera en la pantalla que más veces se abre.
  const [resNotas, resMovimientos] = await Promise.allSettled([
    traerNotas(),
    traerMovimientos(),
  ]);

  if (resNotas.status === 'fulfilled') notas = resNotas.value;
  else fallo = resNotas.reason;

  if (resMovimientos.status === 'fulfilled') movimientos = resMovimientos.value;
  else fallo ??= resMovimientos.reason;

  // Lo pendiente de subir cuenta: si acabas de anotar tres cosas sin señal, un
  // lobby que dice "0 pendientes" te haría dudar de si se guardaron.
  const notasEnCola = await pendientesDe('nota');
  const movimientosEnCola = await pendientesDe('movimiento');

  const todasLasNotas = [...notasEnCola, ...notas];
  const todosLosMovimientos = [...movimientosEnCola, ...movimientos];

  pintarHoy(todasLasNotas);
  pintarResumen(todasLasNotas, todosLosMovimientos);

  sinNada.hidden = todasLasNotas.length + todosLosMovimientos.length > 0;

  if (fallo && navigator.onLine) decir(`No se pudo cargar todo: ${fallo.message}`, 'falla');
  else decir('');
}

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else {
  await exigirSesion();
  sincronizarEnSegundoPlano(() => pintarTodo());
  pintarTodo();
}
