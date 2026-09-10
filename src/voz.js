// Dictado por voz con la Web Speech API del navegador.
//
// Gratis y sin servicios externos, que es lo que pedía el presupuesto del
// proyecto. Dos límites que conviene tener presentes:
//
//   1. En Chrome NO transcribe en el dispositivo: manda el audio a los
//      servidores de Google. Es decir, el dictado necesita internet aunque el
//      resto de la captura funcione sin señal. Por eso el botón se apaga
//      cuando no hay conexión, en vez de fallar en silencio al pulsarlo.
//   2. Es la pieza del proyecto con más probabilidad de tener que cambiarse
//      —está por ver qué tal entiende el español—. Vive aislada aquí para que
//      sustituirla por transcripción de pago sea cambiar este archivo y nada
//      más.

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

export const soportaVoz = Boolean(Reconocimiento);

// `es-PE` y no `es`: los modelos de reconocimiento distinguen variantes, y el
// vocabulario y la entonación peruanos no son los de España.
const IDIOMA = 'es-PE';

const MENSAJES = {
  'not-allowed': 'Falta el permiso del micrófono. Se activa en los ajustes del sitio.',
  'service-not-allowed': 'Falta el permiso del micrófono.',
  'no-speech': 'No se escuchó nada.',
  'audio-capture': 'No se encontró micrófono.',
  network: 'El dictado necesita internet y ahora mismo no hay.',
  aborted: null, // Lo paró el usuario: no hay nada que avisar.
};

export function crearDictado({ alTexto, alEstado, alError }) {
  if (!soportaVoz) return null;

  const motor = new Reconocimiento();
  motor.lang = IDIOMA;
  motor.interimResults = true;
  // Una nota es una frase, no un dictado largo: parar solo al terminar de
  // hablar evita que se quede escuchando indefinidamente y gastando batería.
  motor.continuous = false;
  motor.maxAlternatives = 1;

  let escuchando = false;
  // Lo ya confirmado en esta sesión de dictado. Los resultados provisionales se
  // reemplazan a cada momento; los finales se acumulan.
  let confirmado = '';

  motor.addEventListener('start', () => {
    escuchando = true;
    confirmado = '';
    alEstado?.('escuchando');
  });

  motor.addEventListener('result', (evento) => {
    let provisional = '';

    for (let i = evento.resultIndex; i < evento.results.length; i++) {
      const resultado = evento.results[i];
      const trozo = resultado[0].transcript;
      if (resultado.isFinal) confirmado += trozo;
      else provisional += trozo;
    }

    // Se entrega todo junto para que la pantalla vea el texto creciendo
    // mientras se habla, en vez de esperar callado hasta el final.
    alTexto?.((confirmado + provisional).trim(), { definitivo: provisional === '' });
  });

  motor.addEventListener('error', (evento) => {
    escuchando = false;
    alEstado?.('parado');
    const mensaje = MENSAJES[evento.error] ?? `Falló el dictado (${evento.error}).`;
    if (mensaje) alError?.(mensaje);
  });

  motor.addEventListener('end', () => {
    escuchando = false;
    alEstado?.('parado');
  });

  return {
    get escuchando() {
      return escuchando;
    },
    alternar() {
      if (escuchando) {
        motor.stop();
        return;
      }
      try {
        motor.start();
      } catch {
        // start() lanza si ya estaba arrancando. No es un fallo que el usuario
        // deba ver: el estado real llega por los eventos.
      }
    },
    parar() {
      if (escuchando) motor.abort();
    },
  };
}
