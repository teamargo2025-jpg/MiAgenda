// Pantalla de captura. Lo único que hace: recoger una línea y guardarla.
//
// El objetivo declarado del proyecto es que anotar cueste menos que no anotar,
// así que aquí no se pide categoría, ni tablero, ni confirmación. Se escribe y
// se guarda.

import { db, configurado } from './supabase.js';
import { crearSelectorDeCuando, describirCuando } from './cuando.js';
import { exigirSesion } from './sesion.js';

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

  const { data, error } = await db
    .from('notas')
    .select('id, texto, creada_en, recordar_en')
    .order('creada_en', { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    recientes.hidden = true;
    return;
  }

  lista.replaceChildren(
    ...data.map((nota) => {
      const li = document.createElement('li');
      const cuerpo = document.createElement('span');
      cuerpo.className = 'texto';
      cuerpo.textContent = nota.texto;
      const marca = document.createElement('time');
      if (nota.recordar_en) {
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
  const { error } = await db.from('notas').insert({
    texto: contenido,
    recordar_en: recordarEn,
  });

  boton.disabled = false;

  if (error) {
    // El texto NO se borra si falla: perder lo escrito es exactamente el
    // problema que la app viene a resolver. Guardar sin conexión llega en su
    // propio bloque; hasta entonces, al menos la nota sigue en pantalla.
    decir(`No se pudo guardar: ${error.message}. El texto sigue aquí.`, 'falla');
    return;
  }

  texto.value = '';
  cuando.limpiar();
  texto.focus();
  decir(recordarEn ? `Guardado. Te aviso ${describirCuando(recordarEn)}.` : 'Guardado.', 'ok');
  // La sesión se comprueba antes de pedir nada a la base: sin ella las
// políticas devolverían cero filas y la pantalla mentiría diciendo que no hay
// notas, en vez de mandarte a entrar.
await exigirSesion();
pintarRecientes();
});

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

pintarRecientes();
