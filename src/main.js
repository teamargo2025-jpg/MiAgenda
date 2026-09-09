// Fase 0 — diagnóstico. Solo detecta capacidades del navegador; no registra
// nada todavía. Sirve para abrir la URL en el celular y ver de un vistazo
// qué soporta antes de montar el service worker (bloque B).

const set = (id, texto, estado) => {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.dataset.estado = estado;
};

const si = (cond, textoSi, textoNo) =>
  cond ? [textoSi, 'ok'] : [textoNo, 'falla'];

set('diag-origen', location.host, 'neutro');

// El push web exige contexto seguro. localhost cuenta como seguro.
set('diag-https', ...si(isSecureContext, 'contexto seguro', 'inseguro — el push no va a funcionar'));

set('diag-sw', ...si('serviceWorker' in navigator, 'soportado', 'no soportado'));

set('diag-notif', ...si('Notification' in window, `soportado (permiso: ${Notification?.permission})`, 'no soportado'));

set('diag-push', ...si('PushManager' in window, 'soportado', 'no soportado'));

const VozAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
set('diag-voz', ...si(VozAPI, 'soportado', 'no soportado'));
