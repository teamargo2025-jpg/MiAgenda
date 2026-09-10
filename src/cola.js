// Cola de escrituras pendientes, guardada en el propio dispositivo.
//
// La premisa del proyecto es que anotar sea siempre más fácil que no anotar. Si
// la app falla cuando no hay señal, la premisa se rompe justo en el momento en
// que más falta hace —en la calle, en el micro, en un ascensor—. Así que lo
// capturado se guarda aquí primero y sube cuando se pueda.
//
// IndexedDB y no localStorage: localStorage es síncrono (bloquea la pantalla al
// escribir) y guarda solo texto, así que habría que serializar a mano. Para una
// cola que se escribe justo mientras el usuario espera, no compensa.

const BASE = 'miagenda';
const VERSION = 1;
const ALMACEN = 'pendientes';

let promesaBase = null;

function abrir() {
  if (promesaBase) return promesaBase;

  promesaBase = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION);

    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      if (!base.objectStoreNames.contains(ALMACEN)) {
        // La clave es el id de la fila, generado en el cliente. Eso hace que
        // reintentar sea inofensivo: encolar dos veces lo mismo lo deja una vez.
        base.createObjectStore(ALMACEN, { keyPath: 'id' });
      }
    };

    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });

  return promesaBase;
}

function transaccion(modo, trabajo) {
  return abrir().then(
    (base) =>
      new Promise((resolver, rechazar) => {
        const tx = base.transaction(ALMACEN, modo);
        const almacen = tx.objectStore(ALMACEN);
        const resultado = trabajo(almacen);
        tx.oncomplete = () => resolver(resultado?.result ?? resultado);
        tx.onerror = () => rechazar(tx.error);
      }),
  );
}

export const soportaCola = typeof indexedDB !== 'undefined';

export function encolar(entrada) {
  return transaccion('readwrite', (almacen) => almacen.put(entrada));
}

export function quitarDeCola(id) {
  return transaccion('readwrite', (almacen) => almacen.delete(id));
}

export function leerCola() {
  return transaccion('readonly', (almacen) => almacen.getAll());
}

// Sube lo pendiente. Devuelve cuántas subieron y cuántas siguen esperando.
//
// `insertar` recibe la fila y devuelve { error } al estilo de supabase-js.
export async function vaciarCola(insertar) {
  if (!soportaCola || !navigator.onLine) return { subidas: 0, pendientes: null };

  const entradas = await leerCola();
  let subidas = 0;

  for (const entrada of entradas) {
    const { error } = await insertar(entrada);

    // 23505 es clave duplicada: la fila ya había llegado, seguramente porque se
    // subió y se perdió la respuesta. Encolarla otra vez sería correcto por
    // nuestra parte y molesto para el usuario, así que se da por buena.
    if (!error || error.code === '23505') {
      await quitarDeCola(entrada.id);
      subidas++;
      continue;
    }

    // Un fallo de red detiene el vaciado: reintentar el resto solo sumaría
    // esperas. Uno de datos (un texto vacío, una fila mal formada) también,
    // pero ese hay que verlo, no esconderlo.
    break;
  }

  const restantes = await leerCola();
  return { subidas, pendientes: restantes.length };
}

// El id se genera aquí y no en la base: así la fila tiene identidad antes de
// existir en el servidor, y reintentar la subida no puede duplicarla.
export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Navegadores antiguos sin randomUUID: sirve cualquier valor único, la base
  // solo lo usa como clave primaria.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
