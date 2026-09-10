// Análisis del mes. Sin IA: sumas, porcentajes y una regla de tres.
//
// El trabajo aquí no es calcular —eso está en finanzas.js y son cuatro
// operaciones— sino elegir qué mirar y decirlo en una frase. Un panel con doce
// cifras no informa: obliga a hacer el análisis a quien lo mira, que es
// exactamente lo que debería ahorrarle.

import { db, configurado } from './supabase.js';
import { exigirSesion } from './sesion.js';
import {
  resumen,
  distribucion,
  ritmo,
  variacion,
  delMes,
  mesAnteriorA,
} from './cuentas.js';

const estado = document.getElementById('estado');
const contenido = document.getElementById('contenido');
const titulo = document.getElementById('titulo');

const el = (id) => document.getElementById(id);

const soles = (n) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(n);

const porcentaje = (p) =>
  new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 0 }).format(p);

const decir = (mensaje, tipo = 'neutro') => {
  estado.textContent = mensaje;
  estado.dataset.estado = tipo;
  estado.hidden = !mensaje;
};

async function traerMovimientos() {
  // Dos meses bastan para todo lo que se muestra, y traer solo eso mantiene la
  // consulta pequeña por mucho que crezca el historial.
  const desde = mesAnteriorA(new Date()).toISOString();

  const { data, error } = await db
    .from('movimientos')
    .select('tipo, monto, categoria, ocurrido_en')
    .gte('ocurrido_en', desde);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function pintarMes(mes) {
  const { ingresos, gastos, balance, proporcionGastada } = resumen(mes);

  el('ingresos').textContent = soles(ingresos);
  el('gastos').textContent = soles(gastos);
  el('balance').textContent = soles(balance);
  el('balance').dataset.negativo = String(balance < 0);

  const lectura = el('proporcion');
  if (proporcionGastada === null) {
    // Sin ingresos anotados la proporción no existe. Decirlo es más útil que
    // enseñar un guion, porque explica qué falta para que aparezca.
    lectura.textContent = gastos > 0
      ? 'Anota también lo que entra y podré decirte qué proporción se va.'
      : '';
    return;
  }

  const pct = porcentaje(proporcionGastada);
  lectura.textContent =
    proporcionGastada > 1
      ? `Llevas gastado el ${pct} de lo que entró: estás tirando de lo que había.`
      : `Se ha ido el ${pct} de lo que entró.`;
  lectura.dataset.alerta = String(proporcionGastada > 0.9);
}

function pintarRitmo(mes) {
  const r = ritmo(mes);
  const { ingresos } = resumen(mes);

  el('media').textContent = soles(r.mediaDiaria);
  el('proyeccion').textContent = soles(r.proyeccion);

  const nodo = el('aviso-ritmo');

  if (!r.fiable) {
    nodo.textContent = `Con ${r.transcurridos} ${r.transcurridos === 1 ? 'día' : 'días'} de datos la proyección todavía no dice mucho.`;
    nodo.dataset.alerta = 'false';
    return;
  }

  // Lo que de verdad hay que decir no es la proyección, sino si esa proyección
  // se sale de lo que entró. Enseñar el número y callar la conclusión sería
  // dejarle el análisis a quien vino buscando justo eso.
  const seSale = ingresos > 0 && r.proyeccion > ingresos;

  nodo.textContent = seSale
    ? `A este ritmo cierras en ${soles(r.proyeccion)}, que es ${soles(r.proyeccion - ingresos)} más de lo que entró.`
    : `A este ritmo, el mes cierra en ${soles(r.proyeccion)}.`;
  nodo.dataset.alerta = String(seSale);
}

function pintarDistribucion(mes) {
  const partes = distribucion(mes);
  const lista = el('distribucion');
  el('sin-distribucion').hidden = partes.length > 0;

  lista.replaceChildren(
    ...partes.map(({ categoria, monto, parte }) => {
      const li = document.createElement('li');

      const cabecera = document.createElement('div');
      cabecera.className = 'distribucion-cabecera';

      const nombre = document.createElement('span');
      nombre.className = 'distribucion-nombre';
      // Lo que no lleva etiqueta se nombra, no se esconde: una distribución
      // que no suma el total hace desconfiar de todo lo demás.
      nombre.textContent = categoria ? `#${categoria}` : 'sin categoría';

      const cifra = document.createElement('span');
      cifra.className = 'distribucion-cifra';
      cifra.textContent = `${soles(monto)} · ${porcentaje(parte)}`;

      cabecera.append(nombre, cifra);

      // La barra es un div con ancho proporcional, no un gráfico: para una
      // comparación de cinco valores no hace falta traer una librería entera.
      const barra = document.createElement('div');
      barra.className = 'barra-dato';
      const relleno = document.createElement('div');
      relleno.className = 'barra-relleno';
      relleno.style.width = `${Math.max(2, parte * 100)}%`;
      barra.append(relleno);

      li.append(cabecera, barra);
      return li;
    }),
  );
}

function pintarComparacion(mes, anterior) {
  const ahora = resumen(mes);
  const antes = resumen(anterior);

  const pintar = (id, actual, previo, masEsPeor) => {
    const cambio = variacion(actual, previo);
    const nodo = el(id);
    if (cambio === null) {
      nodo.textContent = 'sin datos';
      nodo.dataset.alerta = 'false';
      return null;
    }
    const signo = cambio > 0 ? '+' : '';
    nodo.textContent = `${signo}${porcentaje(cambio)}`;
    nodo.dataset.alerta = String(masEsPeor ? cambio > 0.1 : cambio < -0.1);
    return cambio;
  };

  const varGastos = pintar('var-gastos', ahora.gastos, antes.gastos, true);
  pintar('var-ingresos', ahora.ingresos, antes.ingresos, false);

  const lectura = el('lectura-comparacion');
  if (varGastos === null) {
    lectura.textContent = 'El mes que viene ya habrá con qué comparar.';
    return;
  }

  const diferencia = ahora.gastos - antes.gastos;
  lectura.textContent =
    diferencia >= 0
      ? `Llevas ${soles(diferencia)} más de gasto que el mes pasado.`
      : `Llevas ${soles(-diferencia)} menos de gasto que el mes pasado.`;
}

async function pintarTodo() {
  let movimientos;
  try {
    movimientos = await traerMovimientos();
  } catch (e) {
    decir(`No se pudo cargar: ${e.message}`, 'falla');
    return;
  }

  const mes = delMes(movimientos);
  const anterior = delMes(movimientos, mesAnteriorA(new Date()));

  titulo.textContent = new Date()
    .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase());

  pintarMes(mes);
  pintarRitmo(mes);
  pintarDistribucion(mes);
  pintarComparacion(mes, anterior);

  decir('');
  contenido.hidden = false;
}

if (!configurado) {
  decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
} else {
  await exigirSesion();
  pintarTodo();
}
