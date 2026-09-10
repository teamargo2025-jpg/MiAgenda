// Pantalla de captura. Lo único que hace: recoger una línea y guardarla.
//
// El objetivo declarado del proyecto es que anotar cueste menos que no anotar,
// así que aquí no se pide categoría, ni tablero, ni confirmación. Se escribe y
// se guarda — con señal o sin ella.

import { db, configurado } from './supabase.js';
import { crearSelectorDeCuando, describirCuando } from './cuando.js';
import { exigirSesion } from './sesion.js';
import { encolar, nuevoId, soportaCola } from './cola.js';
import { pendientesDe, sincronizarEnSegundoPlano } from './sincronizar.js';
import { crearDictado, soportaVoz } from './voz.js';
import { convertirA, lineasDe } from './formato.js';
import { extraerTema, leerTemaActivo, guardarTemaActivo } from './tema.js';

const form = document.getElementById('form');
const texto = document.getElementById('texto');
const boton = document.getElementById('guardar');
const aviso = document.getElementById('aviso');
const recientes = document.getElementById('recientes');
const lista = document.getElementById('lista');

const cuando = crearSelectorDeCuando({
  contenedor: document.getElementById('cuando'),
  campoLibre: document.getElementById('fecha-libre'),
});

const decir = (mensaje, estado = 'neutro') => {
  aviso.textContent = mensaje;
  aviso.dataset.estado = estado;
};

// --- Tema ---

const avisoTema = document.getElementById('tema');
const banda = document.getElementById('banda-tema');
const bandaNombre = document.getElementById('banda-tema-nombre');
const bandaSalir = document.getElementById('banda-tema-salir');

// Se puede entrar a un tema desde la lista (…/?tema=salud) o venir de una
// sesión anterior. El parámetro manda: es una acción que se acaba de hacer.
const temaDeLaUrl = new URLSearchParams(location.search).get('tema');
let temaActivo = temaDeLaUrl || leerTemaActivo();
if (temaDeLaUrl) {
  guardarTemaActivo(temaDeLaUrl);
  // Se limpia la URL para que recargar o compartir el enlace no vuelva a
  // meterte en un tema del que ya saliste.
  history.replaceState(null, '', location.pathname);
}

const pintarBanda = () => {
  banda.hidden = !temaActivo;
  if (temaActivo) bandaNombre.textContent = `Añadiendo a #${temaActivo}`;
};

bandaSalir.addEventListener('click', () => {
  temaActivo = null;
  guardarTemaActivo(null);
  pintarBanda();
  texto.focus();
});

pintarBanda();

// Se muestra en cuanto se teclea la almohadilla. La etiqueta se quita del texto
// al guardar, así que verla reconocida antes evita la sensación de que algo se
// borró solo.
const repasarTema = () => {
  const { tema } = extraerTema(texto.value);
  // Escribir una etiqueta gana al tema activo: lo explícito manda sobre lo
  // heredado. Solo se avisa si de verdad cambia el destino.
  const distinto = tema && tema !== temaActivo;
  avisoTema.hidden = !distinto;
  if (distinto) avisoTema.textContent = `→ tema #${tema}`;
};

// --- Formato ---

const grupoFormato = document.getElementById('formato');
const chipsFormato = [...grupoFormato.querySelectorAll('[data-formato]')];
let formatoElegido = 'texto';

const pintarFormato = () => {
  for (const chip of chipsFormato) {
    chip.setAttribute('aria-pressed', String(chip.dataset.formato === formatoElegido));
  }
};

// El selector aparece y desaparece según haga falta. Una nota de una línea no
// tiene formato posible, y ofrecerlo sería añadir una decisión a la captura.
const repasarFormato = () => {
  const varias = lineasDe(texto.value).length > 1;
  grupoFormato.hidden = !varias;
  if (!varias && formatoElegido !== 'texto') {
    formatoElegido = 'texto';
    pintarFormato();
  }
};

for (const chip of chipsFormato) {
  chip.addEventListener('click', () => {
    formatoElegido = chip.dataset.formato;
    pintarFormato();
    // Al elegir checklist se ven las casillas en el propio campo, para que no
    // haya sorpresa entre lo que se escribe y lo que se guarda.
    texto.value = convertirA(formatoElegido, texto.value);
  });
}

texto.addEventListener('input', () => {
  repasarFormato();
  repasarTema();
});

// --- Dictado ---

const microfono = document.getElementById('microfono');

// Lo que había escrito antes de empezar a dictar. El dictado se añade a
// continuación en vez de reemplazarlo: se puede escribir media frase, dictar el
// resto, y seguir escribiendo.
let textoPrevio = '';

const dictado = crearDictado({
  alTexto(transcrito) {
    const separador = textoPrevio && !textoPrevio.endsWith(' ') ? ' ' : '';
    texto.value = textoPrevio + separador + transcrito;
    repasarFormato();
    repasarTema();
  },
  alEstado(estado) {
    const escuchando = estado === 'escuchando';
    microfono.setAttribute('aria-pressed', String(escuchando));
    microfono.classList.toggle('escuchando', escuchando);
    if (escuchando) decir('Escuchando…');
    else if (aviso.textContent === 'Escuchando…') decir('');
  },
  alError(mensaje) {
    decir(mensaje, 'falla');
  },
});

if (soportaVoz && dictado) {
  microfono.hidden = false;

  microfono.addEventListener('click', () => {
    if (!dictado.escuchando && !navigator.onLine) {
      // Chrome manda el audio a Google para transcribirlo, así que el dictado
      // necesita internet aunque el resto de la captura no. Decirlo antes es
      // mejor que dejar que falle con un error de red.
      decir('El dictado necesita internet. Sin señal puedes escribir igual.', 'falla');
      return;
    }
    textoPrevio = dictado.escuchando ? textoPrevio : texto.value.trim();
    dictado.alternar();
  });
}

const formatearFecha = (iso) =>
  new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// Se muestran unas pocas notas recientes como acuse de recibo: ver la frase
// aparecer en la lista es lo que convence de que quedó guardada. La pantalla
// completa de gestión llega en su propio bloque.
async function pintarRecientes() {
  if (!configurado) return;

  const { data } = await db
    .from('notas')
    .select('id, texto, creada_en, recordar_en')
    .order('creada_en', { ascending: false })
    .limit(5);

  // Lo que aún no ha subido se muestra igual, y arriba. Capturar algo sin señal
  // y no verlo en ningún sitio se siente exactamente como haberlo perdido.
  const enCola = await pendientesDe('nota');

  const todas = [
    ...enCola.map((e) => ({ ...e, sinSubir: true })),
    ...(data ?? []),
  ].slice(0, 5);

  if (!todas.length) {
    recientes.hidden = true;
    return;
  }

  lista.replaceChildren(
    ...todas.map((nota) => {
      const li = document.createElement('li');
      if (nota.sinSubir) li.classList.add('sin-subir');

      const cuerpo = document.createElement('span');
      cuerpo.className = 'texto';
      cuerpo.textContent = nota.texto;

      const marca = document.createElement('time');
      if (nota.sinSubir) {
        marca.textContent = 'en el dispositivo';
        marca.title = 'Se subirá cuando vuelva la conexión';
      } else if (nota.recordar_en) {
        // Cuando hay recordatorio se muestra ese, no la fecha de creación: es
        // el dato que importa mirar de un vistazo.
        marca.dateTime = nota.recordar_en;
        marca.textContent = `⏰ ${describirCuando(nota.recordar_en)}`;
        marca.classList.add('con-alarma');
      } else {
        marca.dateTime = nota.creada_en;
        marca.textContent = formatearFecha(nota.creada_en);
      }

      li.append(cuerpo, marca);
      return li;
    }),
  );
  recientes.hidden = false;
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const contenido = texto.value.trim();
  if (!contenido) return;

  if (!configurado) {
    decir('Falta configurar Supabase — mira el diagnóstico.', 'falla');
    return;
  }

  const problema = cuando.problema();
  if (problema) {
    decir(`No se guardó: ${problema}.`, 'falla');
    return;
  }

  boton.disabled = true;
  decir('Guardando…');

  const recordarEn = cuando.valor();
  // El tema se separa ANTES de dar formato: si no, "#salud" acabaría
  // convertido en una línea más de la lista o en una casilla de la checklist.
  const { tema: temaEscrito, limpio } = extraerTema(contenido);
  const tema = temaEscrito ?? temaActivo;

  if (!limpio) {
    decir('Eso es solo una etiqueta. Escribe también qué quieres anotar.', 'falla');
    boton.disabled = false;
    return;
  }

  // El id se genera aquí: la nota tiene identidad antes de existir en el
  // servidor, así que reintentar la subida no puede duplicarla.
  const fila = {
    id: nuevoId(),
    texto: convertirA(formatoElegido, limpio),
    recordar_en: recordarEn,
    formato: formatoElegido,
    tema,
  };

  const guardado = await guardar(fila);
  boton.disabled = false;

  if (guardado === 'falla') return;

  dictado?.parar();
  textoPrevio = '';
  texto.value = '';
  formatoElegido = 'texto';
  pintarFormato();
  repasarFormato();
  repasarTema();
  cuando.limpiar();
  texto.focus();

  const enTema = tema ? ` en #${tema}` : '';
  const base = recordarEn
    ? `Guardado${enTema}. Te aviso ${describirCuando(recordarEn)}`
    : `Guardado${enTema}`;
  decir(
    guardado === 'cola' ? `${base} — se subirá al volver la conexión.` : `${base}.`,
    'ok',
  );
  pintarRecientes();
});

// Devuelve 'servidor', 'cola' o 'falla'.
async function guardar(fila) {
  if (navigator.onLine) {
    const { error } = await db.from('notas').insert(fila);
    if (!error) return 'servidor';

    // Un error de datos (texto inválido, sesión caducada) no se arregla
    // esperando, así que no se encola: se dice. Solo se guarda en local lo que
    // falló por no poder llegar al servidor.
    if (!esFalloDeRed(error)) {
      decir(`No se pudo guardar: ${error.message}. El texto sigue aquí.`, 'falla');
      return 'falla';
    }
  }

  if (!soportaCola) {
    decir('Sin conexión y este navegador no puede guardar en el dispositivo.', 'falla');
    return 'falla';
  }

  try {
    await encolar({ ...fila, coleccion: 'nota' });
    return 'cola';
  } catch {
    decir('No se pudo guardar en el dispositivo. El texto sigue aquí.', 'falla');
    return 'falla';
  }
}

// supabase-js no distingue el fallo de red del rechazo del servidor con un
// código propio: cuando no hay respuesta, llega un TypeError de fetch sin
// `code`. Es lo que se usa para separarlos.
function esFalloDeRed(error) {
  return !error.code || error.message === 'Failed to fetch';
}

// Ctrl+Enter (o Cmd+Enter) guarda sin levantar la mano del teclado. En el
// celular el botón queda a mano; en la computadora esto ahorra el viaje al ratón.
texto.addEventListener('keydown', (evento) => {
  if ((evento.metaKey || evento.ctrlKey) && evento.key === 'Enter') {
    form.requestSubmit();
  }
});

// El service worker se registra también aquí, no solo en el diagnóstico: si la
// primera visita es a la captura —que es lo normal— la app debe quedar
// instalable desde ahí.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Que falle el registro no debe impedir capturar; solo se pierde la
    // instalación y el aviso, que se diagnostican en la otra página.
  });
}

// La sesión se comprueba antes de pedir nada a la base: sin ella las políticas
// devolverían cero filas y la pantalla mentiría diciendo que no hay notas, en
// vez de mandarte a entrar.
await exigirSesion();
sincronizarEnSegundoPlano(() => pintarRecientes());
pintarRecientes();
