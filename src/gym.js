// Gym: cronómetro de descanso y cuenta de series.
//
// Primera entrega de lo que será el asistente de entrenamiento. Rutinas
// guardadas, ejercicios y peso levantado necesitan un modelo de datos y una
// pantalla de administración; esto no necesita nada y ya sirve el próximo día
// que pises el gimnasio.
//
// No toca la base ni exige sesión: es una herramienta de mano, funciona sin
// señal y sin cuenta. Lo poco que recuerda —cuántas series llevas hoy— vive en
// el dispositivo, que es donde está el gimnasio.

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
