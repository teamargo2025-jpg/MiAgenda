import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // La raíz es la captura: es lo que se abre cien veces al día y tiene
        // que costar cero. El diagnóstico vive aparte para no estorbar ahí,
        // pero se conserva porque es donde se suscribe el dispositivo y donde
        // se ve qué soporta el navegador cuando algo falla.
        main: resolve(__dirname, 'index.html'),
        notas: resolve(__dirname, 'notas.html'),
        gastos: resolve(__dirname, 'gastos.html'),
        entrar: resolve(__dirname, 'entrar.html'),
        diagnostico: resolve(__dirname, 'diagnostico.html'),
      },
    },
  },
});
