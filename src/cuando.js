// Elegir cuándo recordar una nota, con el menor número de toques posible.
//
// Los atajos cubren los casos reales ("esta tarde", "mañana"); el calendario
// completo queda detrás de "Otra…". Si los atajos no bastaran, se verá en el
// uso: la nota queda guardada con su hora y se puede medir cuántas veces se
// acabó recurriendo a la fecha libre.

const AHORA_MISMO = () => new Date();

// Cada atajo devuelve una fecha, o null si ya pasó — no tiene sentido ofrecer
// "esta tarde" a las diez de la noche.
const PRESETS = {
  tarde: () => aHoraDeHoy(18, 0),
  noche: () => aHoraDeHoy(21, 0),
  manana: () => {
    const d = AHORA_MISMO();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  },
};

function aHoraDeHoy(hora, minuto) {
  const d = AHORA_MISMO();
  d.setHours(hora, minuto, 0, 0);
  return d > AHORA_MISMO() ? d : null;
}

export function crearSelectorDeCuando({ contenedor, campoLibre }) {
  const chips = [...contenedor.querySelectorAll('.chip')];
  let elegido = null; // Date | null

  // Los atajos que ya pasaron se ocultan en vez de deshabilitarse: un botón
  // apagado invita a tocarlo y a preguntarse por qué no responde.
  const repasarDisponibles = () => {
    for (const chip of chips) {
      const preset = chip.dataset.preset;
      if (preset === 'otra') continue;
      chip.hidden = PRESETS[preset]() === null;
    }
  };

  const pintarSeleccion = (activo) => {
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip === activo));
    }
  };

  const limpiar = () => {
    elegido = null;
    campoLibre.value = '';
    campoLibre.hidden = true;
    pintarSeleccion(null);
    repasarDisponibles();
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const preset = chip.dataset.preset;

      // Volver a tocar el atajo activo lo desactiva: quitar la hora tiene que
      // ser tan barato como ponerla.
      if (chip.getAttribute('aria-pressed') === 'true') {
        limpiar();
        return;
      }

      if (preset === 'otra') {
        elegido = null;
        campoLibre.hidden = false;
        pintarSeleccion(chip);
        campoLibre.focus();
        try {
          campoLibre.showPicker?.();
        } catch {
          // Ver nota en notas.js: el calendario emergente es opcional.
        }
        return;
      }

      elegido = PRESETS[preset]();
      campoLibre.hidden = true;
      campoLibre.value = '';
      pintarSeleccion(chip);
    });
  }

  campoLibre.addEventListener('change', () => {
    // El valor de datetime-local es hora local sin zona; new Date() lo
    // interpreta en la del dispositivo, que es justo lo que quiere decir el
    // usuario cuando escribe "las 3".
    elegido = campoLibre.value ? new Date(campoLibre.value) : null;
  });

  repasarDisponibles();

  return {
    // Devuelve el instante elegido en UTC, o null si la nota no lleva hora.
    valor() {
      if (!elegido) return null;
      return elegido.toISOString();
    },
    // Un recordatorio en el pasado nunca dispararía: el cron solo mira hacia
    // adelante. Mejor decirlo al guardar que dejar una nota muda.
    problema() {
      if (elegido && elegido <= AHORA_MISMO()) return 'esa hora ya pasó';
      return null;
    },
    limpiar,
  };
}

export function describirCuando(iso) {
  const fecha = new Date(iso);
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);

  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  const hora = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (mismoDia(fecha, hoy)) return `hoy ${hora}`;
  if (mismoDia(fecha, manana)) return `mañana ${hora}`;
  return fecha.toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
