// Fechas escritas dentro de la nota: "llamar al dentista #lunes 15:30".
//
// Vuelve la almohadilla, pero ahora para la fecha y no para el tema. Tiene
// sentido: el tema es una de cinco opciones y se toca; la fecha es infinita y
// se escribe. Pedir un calendario para algo que ya sabes decir en dos palabras
// es justo el peaje que este proyecto quería evitar.
//
// Se acepta el día y la hora en cualquier orden, pegados o separados, con o
// sin tilde. Lo que no se acepta es adivinar: si algo no encaja, no se toca la
// nota y no se pone recordatorio.

const DIAS_SEMANA = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const RELATIVOS = { hoy: 0, manana: 1, pasado: 2 };

// Hora por defecto cuando solo se dice el día. Las ocho de la mañana es cuando
// empieza el día de verdad: un recordatorio a medianoche se duerme con uno y
// otro "a la hora a la que lo escribiste" no significa nada.
const HORA_POR_DEFECTO = 8;

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const HORA = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i;
const DIA = /^([a-záéíóúñ]+)?(\d{1,2})?$/i;
const SUFIJO_SUELTO = /^(a\.?m\.?|p\.?m\.?)$/i;

function aplicarSufijo(parte, sufijo) {
  const s = sinTildes(sufijo).replace(/\./g, '');
  if (s === 'pm' && parte.hora < 12) parte.hora += 12;
  if (s === 'am' && parte.hora === 12) parte.hora = 0;
  parte.conSufijo = true;
}

function leerHora(trozo) {
  const m = trozo.match(HORA);
  if (!m) return null;

  // Un número pelado es un día del mes, no una hora. Es la regla que
  // desambigua "#12", y va escrita porque no es evidente: para decir las doce
  // se escribe "12:00".
  if (!m[2] && !m[3]) return null;

  const parte = { hora: Number(m[1]), minuto: Number(m[2] ?? 0), conSufijo: false };
  if (parte.minuto > 59) return null;
  if (m[3]) aplicarSufijo(parte, m[3]);
  if (parte.hora > 23) return null;
  return parte;
}

function leerDia(trozo) {
  const m = trozo.match(DIA);
  if (!m || (!m[1] && !m[2])) return null;

  const numero = m[2] ? Number(m[2]) : null;
  if (!m[1]) return { diaSemana: null, numero };

  const palabra = sinTildes(m[1]);
  if (palabra in DIAS_SEMANA) return { diaSemana: DIAS_SEMANA[palabra], numero };
  if (palabra in RELATIVOS) return { enDias: RELATIVOS[palabra], numero: null };
  return null;
}

function construir(parteDia, parteHora, ahora) {
  const hora = parteHora ? parteHora.hora : HORA_POR_DEFECTO;
  const minuto = parteHora ? parteHora.minuto : 0;

  // Día concreto del mes. El nombre que a veces lo acompaña —"lunes12"— sirve
  // de confirmación para quien escribe, pero manda el número: es el dato que
  // no admite dos lecturas.
  if (parteDia?.numero != null) {
    const dia = parteDia.numero;
    if (dia < 1 || dia > 31) return null;

    for (let salto = 0; salto < 13; salto++) {
      const candidato = new Date(ahora.getFullYear(), ahora.getMonth() + salto, dia, hora, minuto, 0, 0);
      // Si el mes no tiene ese día, la fecha se desborda al mes siguiente. Se
      // nota comparando el día y se prueba con el mes que viene.
      if (candidato.getDate() !== dia) continue;
      if (candidato > ahora) return candidato;
    }
    return null;
  }

  if (parteDia?.enDias != null) {
    const candidato = new Date(ahora);
    candidato.setDate(candidato.getDate() + parteDia.enDias);
    candidato.setHours(hora, minuto, 0, 0);
    return candidato;
  }

  if (parteDia?.diaSemana != null) {
    const candidato = new Date(ahora);
    candidato.setHours(hora, minuto, 0, 0);

    // El día de la semana que viene. Si hoy es ese día y la hora todavía no ha
    // llegado, es hoy: decir "el lunes" un lunes por la mañana no significa
    // dentro de siete días.
    let saltos = (parteDia.diaSemana - candidato.getDay() + 7) % 7;
    if (saltos === 0 && candidato <= ahora) saltos = 7;
    candidato.setDate(candidato.getDate() + saltos);
    return candidato;
  }

  // Solo hora: hoy si aún no ha pasado, mañana si sí.
  const candidato = new Date(ahora);
  candidato.setHours(hora, minuto, 0, 0);
  if (candidato <= ahora) candidato.setDate(candidato.getDate() + 1);
  return candidato;
}

// Extrae la fecha escrita y devuelve el texto ya sin ella.
//
// Devuelve `fecha: null` y el texto intacto cuando no hay nada que leer o
// cuando lo que hay no se entiende: más vale una nota sin recordatorio que una
// nota con un recordatorio inventado.
export function extraerFecha(texto, ahora = new Date()) {
  // La almohadilla tiene que abrir palabra, para que "C#" o "n.º 3" no se
  // conviertan en fechas por accidente.
  const marca = texto.match(/(^|\s)#[ \t]*/);
  if (!marca) return { fecha: null, limpio: texto.trim() };

  const inicio = marca.index + marca[1].length;
  const desde = marca.index + marca[0].length;
  const resto = texto.slice(desde).split('\n')[0];

  let parteDia = null;
  let parteHora = null;
  let fin = 0;
  let leidos = 0;

  // Se recorre palabra a palabra guardando dónde acaba la última que se
  // entendió. Cortar por posición y no rehaciendo la cadena evita que los
  // espacios de más o de menos descoloquen el recorte.
  const palabras = /\S+/g;
  let palabra;
  while (leidos < 3 && (palabra = palabras.exec(resto)) !== null) {
    const trozo = palabra[0];

    // "3:40 p.m." llega en dos palabras; el sufijo suelto solo vale detrás de
    // una hora que todavía no lo tenía.
    if (parteHora && !parteHora.conSufijo && SUFIJO_SUELTO.test(trozo)) {
      aplicarSufijo(parteHora, trozo);
      fin = palabras.lastIndex;
      leidos++;
      continue;
    }

    if (!parteHora) {
      const hora = leerHora(trozo);
      if (hora) {
        parteHora = hora;
        fin = palabras.lastIndex;
        leidos++;
        continue;
      }
    }

    if (!parteDia) {
      const dia = leerDia(trozo);
      if (dia) {
        parteDia = dia;
        fin = palabras.lastIndex;
        leidos++;
        continue;
      }
    }

    // La primera palabra que no encaja cierra la fecha: lo que viene detrás es
    // la nota.
    break;
  }

  if (!fin) return { fecha: null, limpio: texto.trim() };

  const fecha = construir(parteDia, parteHora, ahora);
  if (!fecha) return { fecha: null, limpio: texto.trim() };

  const limpio = (texto.slice(0, inicio) + texto.slice(desde + fin))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { fecha, limpio };
}

// Cómo se ha entendido lo escrito, para poder confirmarlo de un vistazo.
export function describirFecha(fecha, ahora = new Date()) {
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);

  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  const hora = fecha.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (mismoDia(fecha, ahora)) return `hoy ${hora}`;
  if (mismoDia(fecha, manana)) return `mañana ${hora}`;

  if ((fecha - ahora) / 86400000 < 7) {
    return `${fecha.toLocaleDateString('es-PE', { weekday: 'long' })} ${hora}`;
  }

  return `${fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} ${hora}`;
}
