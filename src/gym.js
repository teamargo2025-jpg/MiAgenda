// Gym: rutina del día, registro de series y cronómetro de descanso.
//
// El criterio de toda esta pantalla es que se usa de pie, sudando, con una
// mano y a metro y medio del celular. Cada cosa que hay que hacer entre serie y
// serie tiene que costar un toque: apuntar la serie arranca el descanso, y el
// peso viene puesto desde la rutina o desde lo que levantaste la última vez.
//
// No se exige sesión aquí. Mandar a una pantalla de contraseña en mitad del
// entrenamiento sería absurdo, y todo lo que se registra pasa por la cola: se
// guarda en el dispositivo y sube cuando haya señal, que en un sótano no la
// hay.

import { DIAS, nombreDia, cargarRutinas, guardarRutina } from './rutinas.js';
import { ejerciciosDe, escribirEjercicio, formatearPeso, resumirSeries } from './ejercicios.js';
import {
  cargarSeries,
  seriesCompletas,
  registrarSerie,
  borrarSerie,
  seriesDeHoy,
  ultimaVez,
} from './entrenamiento.js';
import { sincronizarEnSegundoPlano } from './sincronizar.js';

const crono = document.getElementById('crono');
const etiquetaCrono = document.getElementById('crono-etiqueta');
const cifraCrono = document.getElementById('crono-cifra');
const accionCrono = document.getElementById('crono-accion');

const barraSemana = document.getElementById('semana');
const tituloRutina = document.getElementById('titulo-rutina');
const vistaRutina = document.getElementById('rutina-vista');
const avisoRutina = document.getElementById('rutina-aviso');
const botonEditar = document.getElementById('editar-rutina');
const panelHoy = document.getElementById('panel-hoy');

let diaElegido = new Date().getDay();
let rutinas = {};
let series = [];
let editando = false;

const decirRutina = (mensaje, estado = 'neutro') => {
  avisoRutina.textContent = mensaje;
  avisoRutina.dataset.estado = estado;
  avisoRutina.hidden = !mensaje;
};

// --- Descanso ---

let duracion = 90;
let terminaEn = null; // marca de tiempo absoluta, o null si está parado
let tic = null;
let bloqueoPantalla = null;

const mmss = (segundos) => {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// El tiempo restante se calcula contra el reloj, no descontando de un contador
// en cada tic. El navegador ralentiza los temporizadores cuando la pantalla se
// apaga o la app pasa a segundo plano, y un contador que resta tics se quedaría
// corto justo mientras estás haciendo la serie.
const restante = () => (terminaEn ? (terminaEn - Date.now()) / 1000 : duracion);

function pintarCrono() {
  const quedan = restante();
  cifraCrono.textContent = mmss(quedan);

  if (!terminaEn) {
    crono.dataset.estado = 'parado';
    etiquetaCrono.textContent = 'Descanso';
    accionCrono.textContent = 'Empezar descanso';
    return;
  }

  if (quedan <= 0) {
    crono.dataset.estado = 'terminado';
    etiquetaCrono.textContent = '¡Vamos!';
    accionCrono.textContent = 'Entendido';
    return;
  }

  crono.dataset.estado = 'corriendo';
  etiquetaCrono.textContent = 'Descansando';
  accionCrono.textContent = 'Parar';
}

// Mantener la pantalla encendida mientras corre el descanso. Sin esto el
// celular se apaga a los treinta segundos y hay que desbloquearlo con las manos
// llenas de magnesio para ver cuánto queda.
async function pedirBloqueo() {
  try {
    bloqueoPantalla = await navigator.wakeLock?.request('screen');
  } catch {
    // No disponible o denegado. Es una comodidad, no el mecanismo: el
    // cronómetro sigue siendo correcto al volver.
  }
}

function soltarBloqueo() {
  bloqueoPantalla?.release?.().catch(() => {});
  bloqueoPantalla = null;
}

// Android recupera el bloqueo al volver a la pantalla, pero lo suelta al salir.
// Sin volver a pedirlo, el segundo descanso ya no lo tendría.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && terminaEn && restante() > 0) pedirBloqueo();
  pintarCrono();
});

function avisar() {
  // Vibración y pitido: en un gimnasio con música alta el sonido solo no basta,
  // y con el celular en el bolsillo la vibración es lo único que llega.
  navigator.vibrate?.([200, 100, 200, 100, 400]);

  try {
    const audio = new AudioContext();
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.frequency.value = 880;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.35);
    setTimeout(() => audio.close(), 600);
  } catch {
    // Silenciado o sin contexto de audio: queda la vibración.
  }
}

function arrancarDescanso() {
  terminaEn = Date.now() + duracion * 1000;
  pedirBloqueo();
  clearInterval(tic);
  tic = setInterval(() => {
    pintarCrono();
    if (restante() <= 0) {
      clearInterval(tic);
      tic = null;
      soltarBloqueo();
      avisar();
    }
  }, 200);
  pintarCrono();
}

function pararDescanso() {
  clearInterval(tic);
  tic = null;
  terminaEn = null;
  soltarBloqueo();
  pintarCrono();
}

accionCrono.addEventListener('click', () => {
  if (terminaEn) {
    pararDescanso();
    return;
  }
  arrancarDescanso();
});

for (const chip of crono.querySelectorAll('[data-segundos]')) {
  chip.addEventListener('click', () => {
    duracion = Number(chip.dataset.segundos);
    for (const otro of crono.querySelectorAll('[data-segundos]')) {
      otro.setAttribute('aria-pressed', String(otro === chip));
    }
    // Con el reloj parado se actualiza lo que se ve; corriendo no se toca:
    // reiniciar el descanso a mitad sin pedirlo sería perder la cuenta.
    if (!terminaEn) pintarCrono();
  });
}

// --- Semana ---

function pintarSemana() {
  const hoy = new Date().getDay();

  barraSemana.replaceChildren(
    ...DIAS.map(({ dia, corto, largo }) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'dia';
      boton.textContent = corto;
      boton.setAttribute('aria-label', largo);
      boton.setAttribute('aria-pressed', String(dia === diaElegido));
      // Hoy se marca aunque estés mirando otro día: sin esa referencia,
      // navegar por la semana te deja sin saber dónde estás parado.
      boton.dataset.hoy = String(dia === hoy);
      boton.dataset.tiene = String(Boolean((rutinas[dia] ?? '').trim()));
      boton.addEventListener('click', () => {
        diaElegido = dia;
        editando = false;
        decirRutina('');
        pintarSemana();
        pintarRutina();
      });
      return boton;
    }),
  );
}

// --- Rutina y registro ---

const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

function pintarRutina() {
  const texto = (rutinas[diaElegido] ?? '').trim();
  const hoy = new Date().getDay();
  const esHoy = diaElegido === hoy;

  tituloRutina.textContent = esHoy ? `Hoy · ${nombreDia(diaElegido)}` : nombreDia(diaElegido);
  botonEditar.textContent = editando ? 'Guardar' : texto ? 'Editar' : 'Escribir';

  if (editando) {
    vistaRutina.replaceChildren(crearEditor(texto));
    return;
  }

  if (!texto) {
    const vacio = document.createElement('p');
    vacio.className = 'nota';
    vacio.textContent = 'Sin rutina para este día.';
    vistaRutina.replaceChildren(vacio);
    return;
  }

  const lista = document.createElement('div');
  lista.className = 'ejercicios';
  for (const ejercicio of ejerciciosDe(texto)) {
    lista.append(crearTarjeta(ejercicio, esHoy));
  }
  vistaRutina.replaceChildren(lista);
}

function crearEditor(texto) {
  const campo = document.createElement('textarea');
  campo.className = 'nota-editor';
  campo.id = 'campo-rutina';
  campo.rows = Math.max(5, texto.split('\n').length + 1);
  campo.placeholder = 'Press banca 4x8 60kg\nAperturas 3x12 12kg\nFondos 3x10';
  campo.value = texto;
  setTimeout(() => campo.focus(), 0);
  return campo;
}

function crearTarjeta(ejercicio, esHoy) {
  const hechas = seriesDeHoy(series, ejercicio.nombre);
  const previa = ultimaVez(series, ejercicio.nombre);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'ejercicio';

  // Peso de partida: lo que dice la rutina, y si no, lo que levantaste la
  // última vez. Llegar a la máquina y que ya proponga el peso correcto es la
  // diferencia entre apuntar y no apuntar.
  const ultimoPeso = previa?.series?.at(-1)?.peso ?? null;
  let peso = hechas.at(-1)?.peso ?? ejercicio.peso ?? ultimoPeso;
  let repeticiones = hechas.at(-1)?.repeticiones ?? ejercicio.repeticiones ?? 10;

  const cabecera = document.createElement('div');
  cabecera.className = 'ejercicio-cabecera';

  const nombre = document.createElement('h3');
  nombre.className = 'ejercicio-nombre';
  nombre.textContent = ejercicio.nombre;

  const objetivo = document.createElement('span');
  objetivo.className = 'ejercicio-objetivo';
  objetivo.textContent =
    ejercicio.series && ejercicio.repeticiones
      ? `${ejercicio.series} × ${ejercicio.repeticiones}`
      : 'libre';

  cabecera.append(nombre, objetivo);
  tarjeta.append(cabecera);

  // Un punto por serie objetivo; se rellenan según las vas haciendo. Se ve
  // cuánto queda sin leer un número.
  if (ejercicio.series || hechas.length) {
    const puntos = document.createElement('div');
    puntos.className = 'series-puntos';
    const total = Math.max(ejercicio.series ?? 0, hechas.length);
    for (let i = 0; i < total; i++) {
      const punto = document.createElement('button');
      punto.type = 'button';
      punto.className = 'punto';
      punto.dataset.hecha = String(i < hechas.length);
      if (i < hechas.length) {
        const s = hechas[i];
        punto.title = `${s.repeticiones} reps${s.peso ? ` · ${formatearPeso(s.peso)}kg` : ''} — tocar para borrar`;
        punto.setAttribute('aria-label', `Borrar serie ${i + 1}`);
        punto.addEventListener('click', () => quitarSerie(s.id));
      } else {
        punto.disabled = true;
        punto.setAttribute('aria-hidden', 'true');
      }
      puntos.append(punto);
    }
    tarjeta.append(puntos);
  }

  if (esHoy) {
    tarjeta.append(crearControles());
  }

  if (hechas.length) {
    const hoyResumen = document.createElement('p');
    hoyResumen.className = 'ejercicio-linea';
    hoyResumen.textContent = `Hoy: ${resumirSeries(hechas)}`;
    tarjeta.append(hoyResumen);
  }

  // El dato que hace falta delante de la máquina: con cuánto acabaste la
  // última vez. Sin esto, el historial se guarda pero no sirve de nada.
  const linea = document.createElement('p');
  linea.className = 'ejercicio-linea tenue';
  linea.textContent = previa
    ? `${fechaCorta(previa.fecha)}: ${resumirSeries(previa.series)}`
    : 'Primera vez con este ejercicio.';
  tarjeta.append(linea);

  return tarjeta;

  function crearControles() {
    const controles = document.createElement('div');
    controles.className = 'ejercicio-controles';

    const campoReps = campoNumero('reps', repeticiones, (v) => {
      repeticiones = v;
    });
    const campoPeso = campoNumero('kg', peso, (v) => {
      peso = v;
    });

    const anotar = document.createElement('button');
    anotar.type = 'button';
    anotar.className = 'anotar-serie';
    anotar.textContent = '+ Serie';
    anotar.addEventListener('click', async () => {
      anotar.disabled = true;
      // Apuntar la serie arranca el descanso: son la misma acción desde el
      // punto de vista de quien entrena, y separarlas obliga a dos toques
      // justo cuando menos ganas hay de tocar la pantalla.
      arrancarDescanso();
      await anotarSerie(ejercicio.nombre, repeticiones, peso);
      anotar.disabled = false;
    });

    controles.append(campoReps, campoPeso, anotar);
    return controles;
  }
}

function campoNumero(sufijo, valor, alCambiar) {
  const envoltorio = document.createElement('label');
  envoltorio.className = 'campo-numero';

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.inputMode = 'decimal';
  campo.value = valor ?? '';
  campo.setAttribute('aria-label', sufijo === 'kg' ? 'Peso en kilos' : 'Repeticiones');
  campo.addEventListener('input', () => {
    const limpio = campo.value.trim().replace(',', '.');
    // Vacío es un valor válido para el peso: hay ejercicios sin peso, y
    // obligar a poner cero diría algo distinto.
    alCambiar(limpio === '' ? null : Number(limpio));
  });

  const etiqueta = document.createElement('span');
  etiqueta.textContent = sufijo;

  envoltorio.append(campo, etiqueta);
  return envoltorio;
}

async function anotarSerie(ejercicio, repeticiones, peso) {
  if (!Number.isFinite(repeticiones) || repeticiones <= 0) {
    decirRutina('Las repeticiones tienen que ser un número mayor que cero.', 'falla');
    return;
  }

  const { fila, destino } = await registrarSerie({ ejercicio, repeticiones, peso });

  series = [fila, ...series];
  decirRutina(destino === 'servidor' ? '' : 'Guardada aquí; subirá con señal.', 'neutro');
  pintarRutina();
  pintarHoy();
}

async function quitarSerie(id) {
  series = series.filter((s) => s.id !== id);
  pintarRutina();
  pintarHoy();
  await borrarSerie(id);
}

botonEditar.addEventListener('click', async () => {
  if (!editando) {
    editando = true;
    decirRutina('');
    pintarRutina();
    return;
  }

  const campo = document.getElementById('campo-rutina');
  // Se normaliza al guardar: lo que se reconoce como ejercicio vuelve escrito
  // en el mismo formato, así la rutina queda uniforme aunque se escriba de
  // cuatro maneras distintas.
  const nuevo = ejerciciosDe(campo.value).map(escribirEjercicio).join('\n');

  rutinas[diaElegido] = nuevo;
  editando = false;
  pintarSemana();
  pintarRutina();

  const { error } = await guardarRutina(diaElegido, nuevo);
  if (error) decirRutina(`Guardada aquí, pero no en el servidor: ${error.message}`, 'falla');
  else decirRutina('Guardada.', 'ok');
});

// --- Resumen del día ---

function pintarHoy() {
  const hoy = series.filter(
    (s) => new Date(s.hecha_en).toDateString() === new Date().toDateString(),
  );

  panelHoy.hidden = hoy.length === 0;
  if (!hoy.length) return;

  const reps = hoy.reduce((suma, s) => suma + s.repeticiones, 0);
  // Volumen = peso × repeticiones sumado. Es la medida más simple de cuánto
  // trabajo hiciste, y la única que permite comparar dos días con ejercicios
  // distintos.
  const volumen = hoy.reduce((suma, s) => suma + (s.peso ?? 0) * s.repeticiones, 0);

  document.getElementById('total-series').textContent = String(hoy.length);
  document.getElementById('total-reps').textContent = String(reps);
  document.getElementById('total-volumen').textContent = `${formatearPeso(Math.round(volumen))} kg`;

  const ejercicios = new Set(hoy.map((s) => s.ejercicio.toLowerCase()));
  document.getElementById('lectura-hoy').textContent =
    `${hoy.length} ${hoy.length === 1 ? 'serie' : 'series'} en ${ejercicios.size} ${ejercicios.size === 1 ? 'ejercicio' : 'ejercicios'}.`;
}

// --- Arranque ---

rutinas = cargarRutinas((fresco) => {
  rutinas = fresco;
  pintarSemana();
  if (!editando) pintarRutina();
});

const refrescarSeries = async (delServidor) => {
  series = await seriesCompletas(delServidor);
  if (!editando) pintarRutina();
  pintarHoy();
};

refrescarSeries(cargarSeries((frescas) => refrescarSeries(frescas)));

sincronizarEnSegundoPlano(() => refrescarSeries(cargarSeries()));

pintarCrono();
pintarSemana();
pintarRutina();
