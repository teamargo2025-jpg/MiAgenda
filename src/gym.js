// Gym: rutina del día, cronómetro de descanso y cuenta de series.
//
// Primera entrega del asistente de entrenamiento. Lo que falta —ejercicios con
// peso y repeticiones, historial de sesiones— necesita un modelo de datos que
// conviene diseñar habiendo usado esto antes.
//
// No se exige sesión en esta pantalla. El cronómetro es lo que se usa de pie y
// sin señal, y mandar a una pantalla de contraseña en mitad del entrenamiento
// sería absurdo. La rutina, que sí toca la base, se lee de una copia local y
// solo necesita conexión para escribirse.
//
// El cronómetro y el contador no tocan la base: son herramientas de mano y
// funcionan sin señal. La rutina sí se guarda en el servidor para tenerla en
// cualquier dispositivo, pero se lee de una copia local — el gimnasio suele ser
// un sótano sin cobertura.

import { DIAS, nombreDia, cargarRutinas, guardarRutina } from './rutinas.js';
import { itemsDe } from './formato.js';

const crono = document.getElementById('crono');
const etiqueta = document.getElementById('crono-etiqueta');
const cifra = document.getElementById('crono-cifra');
const accion = document.getElementById('crono-accion');
const contadorSeries = document.getElementById('series');
const lecturaSeries = document.getElementById('lectura-series');

const CLAVE_SERIES = 'miagenda-gym-series';

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
  cifra.textContent = mmss(quedan);

  if (!terminaEn) {
    crono.dataset.estado = 'parado';
    etiqueta.textContent = 'Descanso';
    accion.textContent = 'Empezar descanso';
    return;
  }

  if (quedan <= 0) {
    crono.dataset.estado = 'terminado';
    etiqueta.textContent = '¡Vamos!';
    accion.textContent = 'Otra serie';
    return;
  }

  crono.dataset.estado = 'corriendo';
  etiqueta.textContent = 'Descansando';
  accion.textContent = 'Parar';
}

// Mantener la pantalla encendida mientras corre el descanso. Sin esto el
// celular se apaga a los treinta segundos y hay que desbloquearlo con las manos
// llenas de magnesio para ver cuánto queda.
async function pedirBloqueo() {
  try {
    bloqueoPantalla = await navigator.wakeLock?.request('screen');
  } catch {
    // No está disponible o el sistema lo negó. Es una comodidad, no el
    // mecanismo: el cronómetro sigue siendo correcto al volver.
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
    // Sin audio (silenciado, sin permiso de contexto) queda la vibración.
  }
}

function arrancar() {
  terminaEn = Date.now() + duracion * 1000;
  pedirBloqueo();
  clearInterval(tic);
  tic = setInterval(() => {
    const quedan = restante();
    pintarCrono();
    if (quedan <= 0) {
      clearInterval(tic);
      tic = null;
      soltarBloqueo();
      avisar();
    }
  }, 200);
  pintarCrono();
}

function parar() {
  clearInterval(tic);
  tic = null;
  terminaEn = null;
  soltarBloqueo();
  pintarCrono();
}

accion.addEventListener('click', () => {
  if (terminaEn && restante() > 0) {
    parar();
    return;
  }
  // Terminar un descanso y empezar el siguiente es la misma acción: se apunta
  // la serie que acabas de hacer y arranca el reloj otra vez.
  if (terminaEn) sumarSeries(1);
  arrancar();
});

for (const chip of document.querySelectorAll('[data-segundos]')) {
  chip.addEventListener('click', () => {
    duracion = Number(chip.dataset.segundos);
    for (const otro of document.querySelectorAll('[data-segundos]')) {
      otro.setAttribute('aria-pressed', String(otro === chip));
    }
    // Cambiar la duración con el reloj parado actualiza lo que se ve; con el
    // reloj corriendo, no lo toca: reiniciar el descanso a mitad sin pedirlo
    // sería perder la cuenta.
    if (!terminaEn) pintarCrono();
  });
}

// --- Series ---

// Solo cuentan las de hoy: al abrir otro día, el contador vuelve a cero sin que
// haya que acordarse de reiniciarlo.
function leerSeries() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CLAVE_SERIES) || '{}');
    return bruto.dia === new Date().toDateString() ? Number(bruto.total) || 0 : 0;
  } catch {
    return 0;
  }
}

function guardarSeries(total) {
  try {
    localStorage.setItem(
      CLAVE_SERIES,
      JSON.stringify({ dia: new Date().toDateString(), total }),
    );
  } catch {
    // Sin almacenamiento el contador funciona igual, solo que no sobrevive a
    // cerrar la app.
  }
}

let series = leerSeries();

function pintarSeries() {
  contadorSeries.textContent = String(series);
  lecturaSeries.textContent =
    series === 0
      ? 'Cada descanso que termines suma una.'
      : `${series} ${series === 1 ? 'serie' : 'series'} hoy.`;
}

function sumarSeries(cuantas) {
  series = Math.max(0, series + cuantas);
  guardarSeries(series);
  pintarSeries();
}

document.getElementById('mas').addEventListener('click', () => sumarSeries(1));
document.getElementById('menos').addEventListener('click', () => sumarSeries(-1));

document.getElementById('reiniciar').addEventListener('click', () => {
  parar();
  series = 0;
  guardarSeries(0);
  pintarSeries();
});

pintarCrono();
pintarSeries();


// --- Rutina del día ---

const barraSemana = document.getElementById('semana');
const tituloRutina = document.getElementById('titulo-rutina');
const vistaRutina = document.getElementById('rutina-vista');
const avisoRutina = document.getElementById('rutina-aviso');
const botonEditar = document.getElementById('editar-rutina');

let diaElegido = new Date().getDay();
let rutinas = {};
let editando = false;

const decirRutina = (mensaje, estado = 'neutro') => {
  avisoRutina.textContent = mensaje;
  avisoRutina.dataset.estado = estado;
  avisoRutina.hidden = !mensaje;
};

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
      // El día de hoy se marca aunque estés mirando otro: sin eso, al navegar
      // por la semana se pierde la referencia de dónde estás parado.
      boton.dataset.hoy = String(dia === hoy);
      // Un punto avisa de que ese día tiene rutina puesta, para ver la semana
      // entera de un vistazo.
      boton.dataset.tiene = String(Boolean((rutinas[dia] ?? '').trim()));
      boton.addEventListener('click', () => {
        diaElegido = dia;
        editando = false;
        pintarSemana();
        pintarRutina();
      });
      return boton;
    }),
  );
}

function pintarRutina() {
  const texto = (rutinas[diaElegido] ?? '').trim();
  const hoy = new Date().getDay();
  tituloRutina.textContent =
    diaElegido === hoy ? `Hoy · ${nombreDia(diaElegido)}` : nombreDia(diaElegido);

  botonEditar.textContent = editando ? 'Guardar' : texto ? 'Editar' : 'Escribir';

  if (editando) {
    const campo = document.createElement('textarea');
    campo.className = 'nota-editor';
    campo.id = 'campo-rutina';
    campo.rows = Math.max(4, texto.split('\n').length + 1);
    campo.placeholder = 'Press banca 4x8\nAperturas 3x12\nFondos 3 al fallo';
    campo.value = texto;
    vistaRutina.replaceChildren(campo);
    campo.focus();
    return;
  }

  if (!texto) {
    const vacio = document.createElement('p');
    vacio.className = 'nota';
    vacio.textContent = 'Sin rutina para este día.';
    vistaRutina.replaceChildren(vacio);
    return;
  }

  // Cada línea, una viñeta. Se reutiliza el mismo criterio que las notas: el
  // texto libre es el modelo, y pintarlo como lista no exige estructurarlo.
  const lista = document.createElement('ul');
  lista.className = 'nota-viñetas';
  for (const item of itemsDe(texto)) {
    const li = document.createElement('li');
    li.textContent = item.texto;
    lista.append(li);
  }
  vistaRutina.replaceChildren(lista);
}

botonEditar.addEventListener('click', async () => {
  if (!editando) {
    editando = true;
    decirRutina('');
    pintarRutina();
    return;
  }

  const campo = document.getElementById('campo-rutina');
  const nuevo = campo.value.trim();
  rutinas[diaElegido] = nuevo;
  editando = false;
  pintarSemana();
  pintarRutina();

  const { error } = await guardarRutina(diaElegido, nuevo);
  if (error) decirRutina(`Guardada aquí, pero no en el servidor: ${error.message}`, 'falla');
  else decirRutina('Guardada.', 'ok');
});

// La sesión se exige solo para la rutina, que sí toca la base. El cronómetro
// tiene que funcionar aunque no haya sesión: es lo que se usa de pie y sin
// señal, y mandarte a una pantalla de contraseña en mitad del entrenamiento
// sería absurdo.
rutinas = cargarRutinas((fresco) => {
  rutinas = fresco;
  pintarSemana();
  if (!editando) pintarRutina();
});

pintarSemana();
pintarRutina();
