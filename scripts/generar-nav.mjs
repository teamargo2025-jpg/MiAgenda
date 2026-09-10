// Reescribe la barra de navegación en todas las páginas desde una sola
// definición.
//
// La barra vive duplicada en cada HTML a propósito: es estática, sin
// parpadeo al cargar, y funciona aunque el JavaScript falle. Lo que no puede
// ser es mantenerla a mano en seis ficheros — a la tercera edición, uno se
// queda con una pestaña de menos.
//
//   node scripts/generar-nav.mjs
//
// Correrlo después de tocar SECCIONES o de añadir una página.

import { readFileSync, writeFileSync } from 'node:fs';

const SECCIONES = [
  {
    id: 'inicio',
    href: '/',
    etiqueta: 'Inicio',
    icono: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>',
  },
  {
    id: 'capturar',
    href: '/capturar.html',
    etiqueta: 'Capturar',
    icono: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  },
  {
    id: 'notas',
    href: '/notas.html',
    etiqueta: 'Notas',
    icono:
      '<path d="M9 6h12"/><path d="M9 12h12"/><path d="M9 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  },
  {
    id: 'dinero',
    href: '/dinero.html',
    etiqueta: 'Dinero',
    icono: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  },
];

// Qué sección queda marcada en cada página. Análisis marca Dinero porque es
// donde vive: una pestaña que no se ilumina en ninguna parte deja al usuario
// sin saber dónde está.
const PAGINAS = {
  'index.html': 'inicio',
  'capturar.html': 'capturar',
  'notas.html': 'notas',
  'dinero.html': 'dinero',
  'analisis.html': 'dinero',
};

const barra = (actual) => `    <nav class="barra-nav" aria-label="Secciones">
${SECCIONES.map(
  (s) => `      <a href="${s.href}" class="pestana"${s.id === actual ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s.icono}</svg>
        <span>${s.etiqueta}</span>
      </a>`,
).join('\n')}
    </nav>`;

const MARCA = /( *)<nav class="barra-nav"[\s\S]*?<\/nav>/;

for (const [fichero, actual] of Object.entries(PAGINAS)) {
  const antes = readFileSync(fichero, 'utf8');
  if (!MARCA.test(antes)) {
    console.error(`sin barra que reemplazar en ${fichero}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(fichero, antes.replace(MARCA, barra(actual)));
  console.log(`barra actualizada en ${fichero}`);
}
