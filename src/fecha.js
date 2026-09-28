// Fechas escritas dentro de la nota: "llamar al dentista #lunes 15:30".
//
// Vuelve la almohadilla, pero ahora para la fecha y no para el tema. Tiene
// sentido: el tema es una de cinco opciones y se toca; la fecha es infinita y
// se escribe. Pedir un calendario para algo que ya sabes decir en dos palabras
// es justo el peaje que este proyecto quería evitar.
//
// Se acepta el día y la hora en cualquier orden, con nombre o en números, con
// o sin tilde, y con las palabras de relleno que salen solas al escribir ("3
// de octubre", "lunes a las 9"). Lo que no se acepta es adivinar: si algo no
// encaja, no se toca la nota y no se pone recordatorio. Equivocarse de día en
// silencio es peor que no haber entendido nada.

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

const MESES = {
  enero: 0, ene: 0,
  febrero: 1, feb: 1,
  marzo: 2,
  abril: 3, abr: 3,
  mayo: 4, may: 4,
  junio: 5, jun: 5,
  julio: 6, jul: 6,
  agosto: 7, ago: 7,
  septiembre: 8, setiembre: 8, sep: 8, set: 8,
  octubre: 9, oct: 9,
  noviembre: 10, nov: 10,
  diciembre: 11, dic: 11,
};

// "mar" no está en la lista a propósito: vale igual para marzo y para martes.
// Un atajo que acierta la mitad de las veces y no avisa es exactamente el tipo
// de error que este lector existe para no cometer, así que marzo se escribe
// entero.

// Palabras que salen solas al escribir una fecha y no dicen nada por sí mismas.
// Se saltan sin cortar la lectura, pero nunca se recortan de la nota si detrás
// no viene algo que sí se entienda.
const RELLENO = new Set([
  'de', 'del', 'el', 'la', 'los', 'las', 'a', 'al', 'este', 'esta',
  'proximo', 'proxima', 'que', 'viene',
]);

// Hora por defecto cuando solo se dice el día. Las ocho de la mañana es cuando
// empieza el día de verdad: un recordatorio a medianoche se duerme con uno, y
// otro "a la hora a la que lo escribiste" no significa nada.
const HORA_POR_DEFECTO = 8;

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const HORA = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i;
const PALABRA_Y_NUMERO = /^([a-záéíóúñ]+)?(\d{1,2})?$/i;
const NUMERICA = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/;
const SUFIJO_SUELTO = /^(a\.?m\.?|p\.?m\.?)$/i;

const CLAVES = ['diaSemana', 'enDias', 'numero', 'mes', 'anio'];

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

// Lo que se pueda sacar del trozo sobre el día: nombre de la semana, relativo,
// número del mes, nombre del mes, o una fecha en números.
function leerDia(trozo) {
  const numerica = trozo.match(NUMERICA);
  if (numerica) {
    const mes = Number(numerica[2]) - 1;
    if (mes < 0 || mes > 11) return null;
    const anio = numerica[3] ? Number(numerica[3]) : null;
    return {
      numero: Number(numerica[1]),
      mes,
      anio: anio === null ? null : anio < 100 ? 2000 + anio : anio,
    };
  }

  const m = trozo.match(PALABRA_Y_NUMERO);
  if (!m || (!m[1] && !m[2])) return null;

  const numero = m[2] ? Number(m[2]) : null;
  if (!m[1]) return { numero };

  const palabra = sinTildes(m[1]);
  if (palabra in DIAS_SEMANA) return { diaSemana: DIAS_SEMANA[palabra], numero };
  if (palabra in RELATIVOS) return { enDias: RELATIVOS[palabra] };
  if (palabra in MESES) return { mes: MESES[palabra], numero };
  return null;
}

// Junta lo leído en una sola fecha. Lo que ya estaba puesto no se pisa, así
// que "3 de octubre" y "octubre 3" acaban en lo mismo.
function fundir(destino, parte) {
  for (const clave of CLAVES) {
    if (parte[clave] != null && destino[clave] == null) destino[clave] = parte[clave];
  }
}

const vacio = (parte) =>
  parte.diaSemana == null && parte.enDias == null && parte.numero == null && parte.mes == null;

function construir(parteDia, parteHora, ahora) {
  const hora = parteHora ? parteHora.hora : HORA_POR_DEFECTO;
  const minuto = parteHora ? parteHora.minuto : 0;
  const dia = parteDia.numero;

  // Mes dicho a propósito. Aquí no se busca "el próximo que cuadre": si has
  // escrito noviembre, es noviembre, y solo se pasa al año que viene cuando
  // esa fecha ya quedó atrás.
  if (parteDia.mes != null) {
    if (dia == null) return null;
    const anio = parteDia.anio ?? ahora.getFullYear();
    const candidato = new Date(anio, parteDia.mes, dia, hora, minuto, 0, 0);
    // Un 31 en un mes de treinta se desborda al siguiente sin avisar.
    if (candidato.getDate() !== dia || candidato.getMonth() !== parteDia.mes) return null;
    if (candidato > ahora || parteDia.anio != null) return candidato;
    return new Date(anio + 1, parteDia.mes, dia, hora, minuto, 0, 0);
  }

  // Día del mes a secas: el próximo que caiga. El nombre del día que a veces
  // lo acompaña —"lunes12"— sirve de confirmación para quien escribe, pero
  // manda el número: es el dato que no admite dos lecturas.
  if (dia != null) {
    if (dia < 1 || dia > 31) return null;
    for (let salto = 0; salto < 13; salto++) {
      const candidato = new Date(ahora.getFullYear(), ahora.getMonth() + salto, dia, hora, minuto, 0, 0);
      if (candidato.getDate() !== dia) continue;
      if (candidato > ahora) return candidato;
    }
    return null;
  }

  if (parteDia.enDias != null) {
    const candidato = new Date(ahora);
    candidato.setDate(candidato.getDate() + parteDia.enDias);
    candidato.setHours(hora, minuto, 0, 0);
    return candidato;
  }

  if (parteDia.diaSemana != null) {
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

  const parteDia = {};
  let parteHora = null;
  let fin = 0;
  let mirados = 0;

  // Se recorre palabra a palabra guardando dónde acaba la última que se
  // entendió. Cortar por posición y no rehaciendo la cadena evita que los
  // espacios de más o de menos descoloquen el recorte, y deja fuera el relleno
  // que se quedó al final sin nada detrás.
  const palabras = /\S+/g;
  let palabra;

  while (mirados < 6 && (palabra = palabras.exec(resto)) !== null) {
    mirados++;
    const crudo = palabra[0];
    // La puntuación de la frase se pega a la palabra al escribir ("#martes,
    // salón 3"). Se prueba primero tal cual, para no romper "p.m.".
    const podado = crudo.replace(/[.,;:!?)\]]+$/, '');

    let consumido = false;

    for (const trozo of podado === crudo ? [crudo] : [crudo, podado]) {
      if (!trozo) continue;

      // "3:40 p.m." llega en dos palabras.
      if (parteHora && !parteHora.conSufijo && SUFIJO_SUELTO.test(trozo)) {
        aplicarSufijo(parteHora, trozo);
        consumido = true;
        break;
      }

      // "8 pm" también: el 8 se leyó como día del mes, porque un número pelado
      // lo es, y el sufijo que viene detrás lo corrige a hora.
      if (
        !parteHora &&
        SUFIJO_SUELTO.test(trozo) &&
        parteDia.numero != null &&
        parteDia.numero <= 23 &&
        parteDia.mes == null &&
        parteDia.diaSemana == null &&
        parteDia.enDias == null
      ) {
        parteHora = { hora: parteDia.numero, minuto: 0, conSufijo: false };
        aplicarSufijo(parteHora, trozo);
        parteDia.numero = null;
        consumido = true;
        break;
      }

      if (!parteHora) {
        const hora = leerHora(trozo);
        if (hora) {
          parteHora = hora;
          consumido = true;
          break;
        }
      }

      // Se acepta mientras aporte algo que todavía no estaba: así el día y el
      // mes pueden venir en palabras distintas y en cualquier orden.
      const dia = leerDia(trozo);
      if (dia && CLAVES.some((k) => dia[k] != null && parteDia[k] == null)) {
        fundir(parteDia, dia);
        consumido = true;
        break;
      }
    }

    if (consumido) {
      fin = palabras.lastIndex;
      continue;
    }

    // El relleno no cuenta como fecha, pero tampoco la corta: se sigue mirando
    // por si detrás viene lo que falta.
    if (RELLENO.has(sinTildes(podado))) continue;

    // La primera palabra que no encaja cierra la fecha: lo que viene detrás es
    // la nota.
    break;
  }

  if (!fin || (vacio(parteDia) && !parteHora)) return { fecha: null, limpio: texto.trim() };

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

  // El año solo se dice cuando no es este: repetirlo en cada fecha es ruido.
  const otroAnio = fecha.getFullYear() !== ahora.getFullYear();
  return `${fecha.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    ...(otroAnio ? { year: 'numeric' } : {}),
  })} ${hora}`;
}
