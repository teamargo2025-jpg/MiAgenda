// Historial de entrenamiento.
//
// Registrar series solo tiene sentido si después se pueden mirar. Y mirarlas
// solo sirve si el resumen dice algo: por eso cada sesión se cuenta por
// ejercicios y volumen, no como una lista cruda de cincuenta filas.

import { cargarSeries, seriesCompletas, porDia } from './entrenamiento.js';
import { resumirSeries, formatearPeso, claveEjercicio } from './ejercicios.js';

const el = (id) => document.getElementById(id);

const fechaLarga = (iso) =>
  new Date(iso)
    .toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, (c) => c.toUpperCase());

// Volumen = peso × repeticiones sumado. Es la medida más simple de cuánto
// trabajo hiciste, y la única que permite comparar dos días con ejercicios
// distintos.
const volumenDe = (series) =>
  series.reduce((suma, s) => suma + (s.peso ?? 0) * s.repeticiones, 0);

function pintarResumen(dias) {
  const hace28 = Date.now() - 28 * 86400000;
  const recientes = dias.filter((d) => new Date(d.fecha).getTime() >= hace28);
  const todas = recientes.flatMap((d) => d.series);

  el('total-sesiones').textContent = String(recientes.length);
  el('total-series').textContent = String(todas.length);
  el('total-volumen').textContent = `${formatearPeso(Math.round(volumenDe(todas)))} kg`;

  if (!recientes.length) {
    el('lectura').textContent = 'Nada en las últimas cuatro semanas.';
    return;
  }

  // Lo útil no es el total sino el ritmo: cuántas veces por semana vas. Es el
  // número que dice si el plan se está cumpliendo.
  const porSemana = (recientes.length / 4).toFixed(1).replace('.0', '');
  el('lectura').textContent = `${porSemana} ${porSemana === '1' ? 'sesión' : 'sesiones'} por semana de media.`;
}

function crearSesion(dia) {
  const seccion = document.createElement('article');
  seccion.className = 'sesion';

  const cabecera = document.createElement('div');
  cabecera.className = 'sesion-cabecera';

  const titulo = document.createElement('h3');
  titulo.className = 'sesion-fecha';
  titulo.textContent = fechaLarga(dia.fecha);

  const cifra = document.createElement('span');
  cifra.className = 'sesion-volumen';
  const volumen = volumenDe(dia.series);
  cifra.textContent = volumen
    ? `${formatearPeso(Math.round(volumen))} kg · ${dia.series.length} series`
    : `${dia.series.length} series`;

  cabecera.append(titulo, cifra);
  seccion.append(cabecera);

  // Se agrupa por ejercicio: una sesión son cinco ejercicios, no veinte filas
  // sueltas, y así se lee igual que como se entrenó.
  const porEjercicio = new Map();
  for (const s of dia.series) {
    const clave = claveEjercicio(s.ejercicio);
    if (!porEjercicio.has(clave)) porEjercicio.set(clave, { nombre: s.ejercicio, series: [] });
    porEjercicio.get(clave).series.push(s);
  }

  const lista = document.createElement('ul');
  lista.className = 'sesion-ejercicios';
  for (const { nombre, series } of porEjercicio.values()) {
    const li = document.createElement('li');

    const quien = document.createElement('span');
    quien.className = 'sesion-ejercicio';
    quien.textContent = nombre;

    const que = document.createElement('span');
    que.className = 'sesion-detalle';
    que.textContent = resumirSeries(series);

    li.append(quien, que);
    lista.append(li);
  }

  seccion.append(lista);
  return seccion;
}

function pintar(series) {
  const dias = porDia(series);

  pintarResumen(dias);
  el('vacio').hidden = dias.length > 0;

  // Un tope: el historial completo en una sola página acabaría siendo
  // ilegible, y lo que se consulta de verdad es lo reciente.
  el('sesiones').replaceChildren(...dias.slice(0, 30).map(crearSesion));
}

const refrescar = async (delServidor) => pintar(await seriesCompletas(delServidor));

refrescar(cargarSeries((frescas) => refrescar(frescas)));
