// Pantalla de entrada. Correo y contraseña, del único usuario que existe.
//
// No hay registro ni recuperación: el usuario se crea a mano desde el panel de
// Supabase. Montar esos flujos para una sola persona sería construir un sistema
// de cuentas, que es justo lo que el documento descarta.

import { db, configurado } from './supabase.js';

const form = document.getElementById('form');
const correo = document.getElementById('correo');
const clave = document.getElementById('clave');
const boton = document.getElementById('entrar');
const aviso = document.getElementById('aviso');

const decir = (mensaje, estado = 'neutro') => {
  aviso.textContent = mensaje;
  aviso.dataset.estado = estado;
};

const destino = () => {
  const volver = new URLSearchParams(location.search).get('volver');
  // Solo rutas de este mismo sitio: un parámetro de vuelta sin filtrar es una
  // forma clásica de acabar redirigiendo a donde no toca.
  if (volver && volver.startsWith('/') && !volver.startsWith('//')) return volver;
  return '/';
};

if (!configurado) {
  decir('Falta configurar Supabase.', 'falla');
  boton.disabled = true;
}

// Si ya hay sesión, no tiene sentido enseñar el formulario.
db?.auth.getSession().then(({ data }) => {
  if (data.session) location.replace(destino());
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  boton.disabled = true;
  decir('Entrando…');

  const { error } = await db.auth.signInWithPassword({
    email: correo.value.trim(),
    password: clave.value,
  });

  if (error) {
    boton.disabled = false;
    // El mensaje de Supabase no distingue si falló el correo o la contraseña,
    // y así debe ser: decirlo ayudaría más a quien prueba a entrar que a ti.
    decir('No se pudo entrar. Revisa el correo y la contraseña.', 'falla');
    return;
  }

  location.replace(destino());
});
