// Puerta de entrada. Todas las páginas la llaman antes de pintar nada.
//
// No es un sistema de cuentas: hay un solo usuario y se crea a mano desde el
// panel de Supabase. Lo único que hace esto es exigir que haya sesión, para que
// las políticas de la base tengan a quién reconocer.

import { db, configurado } from './supabase.js';

export const PAGINA_ENTRAR = '/entrar.html';

// Devuelve la sesión, o redirige a la pantalla de entrada y no resuelve nunca
// —la página se está yendo, así que seguir pintando sería trabajo tirado y,
// peor, un parpadeo de contenido antes del salto.
export async function exigirSesion() {
  if (!configurado) {
    throw new Error('faltan las variables de entorno de Supabase');
  }

  const { data } = await db.auth.getSession();
  if (data.session) return data.session;

  // Se recuerda a dónde iba para volver ahí después de entrar.
  const destino = encodeURIComponent(location.pathname + location.search);
  location.replace(`${PAGINA_ENTRAR}?volver=${destino}`);
  return new Promise(() => {});
}

export async function salir() {
  await db.auth.signOut();
  location.replace(PAGINA_ENTRAR);
}
