import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anon);

// Si faltan las variables la app no debe reventar al cargar: el panel de
// diagnóstico tiene que poder decir "falta configurar Supabase" en vez de
// quedarse en blanco con un error en consola.
export const db = configurado
  ? createClient(url, anon, { auth: { persistSession: false } })
  : null;

export const VAPID_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// El navegador pide la clave como Uint8Array, no como el base64url que sale
// del generador.
export const base64UrlABytes = (base64url) => {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(base64);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
};
