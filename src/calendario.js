// El minicalendario del lobby.
//
// Las notas con recordatorio ya se ven en "Hoy", pero solo las de hoy. Lo que
// falta es la otra pregunta, la que se hace antes de comprometerse a algo:
// cómo tengo la semana que viene. Una lista no la contesta; una cuadrícula de
// un mes sí, de un vistazo y sin leer nada.
//
// No es un calendario de verdad: no se crea nada desde aquí. Es un mapa de
// dónde hay algo puesto, y un atajo para ver qué es.

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// La semana empieza el lunes, como se lee aquí. getDay() cuenta desde el
// domingo, así que hay que rotarlo.
const columnaDe = (fecha) => (fecha.getDay() + 6) % 7;

const mismoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const clave = (fecha) => `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;

export function crearCalendario({ mes, titulo, cuadricula, detalle, antes, despues, alPintarNota }) {
  // El mes que se está mirando y el día abierto. Poder pasar de mes no es un
  // lujo: a final de mes casi todo lo que tienes puesto cae en el siguiente, y
  // un calendario que no llega hasta ahí no sirve para lo que se abre.
  let visible = new Date();
  visible.setDate(1);
  visible.setHours(0, 0, 0, 0);

  let elegido = null;
  let notas = [];
  let apartados = [];

  antes.addEventListener('click', () => mover(-1));
  despues.addEventListener('click', () => mover(1));

  function mover(meses) {
    visible = new Date(visible.getFullYear(), visible.getMonth() + meses, 1);
    // Al cambiar de mes se cierra el día abierto: seguiría mostrando notas de
    // un día que ya no está en pantalla.
    elegido = null;
    pintar();
  }

  // Las notas con fecha, agrupadas por día.
  function porDia() {
    const mapa = new Map();
    for (const nota of notas) {
      if (!nota.recordar_en) continue;
      const cuando = new Date(nota.recordar_en);
      if (Number.isNaN(cuando.getTime())) continue;
      const k = clave(cuando);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(nota);
    }
    return mapa;
  }

  function colorDe(nota) {
    if (!nota.apartado_id) return null;
    return apartados.find((a) => a.id === nota.apartado_id)?.color ?? null;
  }

  function celdaDia(fecha, delDia) {
    const hoy = new Date();
    const celda = document.createElement(delDia.length ? 'button' : 'div');
    celda.className = 'cal-dia';
    if (delDia.length) celda.type = 'button';
    if (mismoDia(fecha, hoy)) celda.classList.add('es-hoy');
    if (elegido && mismoDia(fecha, elegido)) celda.classList.add('esta-abierto');

    const numero = document.createElement('span');
    numero.className = 'cal-numero';
    numero.textContent = String(fecha.getDate());
    celda.append(numero);

    if (delDia.length) {
      // Puntos y no solo color de fondo: el color dice de qué apartado es,
      // pero que haya algo ese día tiene que verse sin depender del color.
      const puntos = document.createElement('span');
      puntos.className = 'cal-puntos';
      puntos.setAttribute('aria-hidden', 'true');
      for (const nota of delDia.slice(0, 3)) {
        const punto = document.createElement('span');
        punto.className = 'cal-punto';
        const color = colorDe(nota);
        if (color) punto.dataset.color = color;
        puntos.append(punto);
      }
      celda.append(puntos);

      const cuantas = delDia.length === 1 ? '1 recordatorio' : `${delDia.length} recordatorios`;
      celda.setAttribute(
        'aria-label',
        `${fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}, ${cuantas}`,
      );

      celda.addEventListener('click', () => {
        // Volver a tocar el día abierto lo cierra.
        elegido = elegido && mismoDia(fecha, elegido) ? null : fecha;
        pintar();
      });
    }

    return celda;
  }

  function pintarDetalle(mapa) {
    if (!elegido) {
      detalle.hidden = true;
      return;
    }

    const delDia = (mapa.get(clave(elegido)) ?? []).sort(
      (a, b) => new Date(a.recordar_en) - new Date(b.recordar_en),
    );

    detalle.replaceChildren(...delDia.map((nota) => alPintarNota(nota)));
    detalle.hidden = delDia.length === 0;
  }

  function pintar() {
    titulo.textContent = visible
      .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
      .replace(/^./, (c) => c.toUpperCase());

    const mapa = porDia();
    const hijos = [];

    for (const dia of DIAS) {
      const cabecera = document.createElement('span');
      cabecera.className = 'cal-cabecera-dia';
      cabecera.setAttribute('aria-hidden', 'true');
      cabecera.textContent = dia;
      hijos.push(cabecera);
    }

    // Huecos hasta que empieza el mes, para que cada día caiga bajo su
    // columna de la semana.
    const primero = new Date(visible.getFullYear(), visible.getMonth(), 1);
    for (let i = 0; i < columnaDe(primero); i++) {
      const hueco = document.createElement('span');
      hueco.className = 'cal-hueco';
      hijos.push(hueco);
    }

    const ultimo = new Date(visible.getFullYear(), visible.getMonth() + 1, 0).getDate();
    for (let dia = 1; dia <= ultimo; dia++) {
      const fecha = new Date(visible.getFullYear(), visible.getMonth(), dia);
      hijos.push(celdaDia(fecha, mapa.get(clave(fecha)) ?? []));
    }

    cuadricula.replaceChildren(...hijos);
    pintarDetalle(mapa);
  }

  return {
    actualizar(nuevasNotas, nuevosApartados) {
      notas = nuevasNotas;
      apartados = nuevosApartados;
      // Se pinta siempre, aunque no haya nada puesto. Estuvo un rato oculto
      // hasta que existiera la primera nota con fecha, con la idea de que cada
      // bloque del lobby se gane su sitio; pero un mes vacío ya contesta la
      // pregunta que se le hace —"¿tengo algo esta semana?"— y esconderlo
      // justo cuando no tienes nada puesto es esconderlo siempre al principio.
      mes.hidden = false;
      pintar();
    },
  };
}
