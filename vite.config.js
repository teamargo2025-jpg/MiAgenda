import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    // Sin esto Vite se queda siempre en 5173 y choca con cualquier otro
    // servidor de desarrollo que ya lo tenga. Nada aquí depende de ese puerto
    // en concreto —no hay callbacks de OAuth ni webhooks apuntando a él—, así
    // que se acepta el que asigne el entorno.
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      input: {
        // La raíz es la captura: es lo que se abre cien veces al día y tiene
        // que costar cero. El diagnóstico vive aparte para no estorbar ahí,
        // pero se conserva porque es donde se suscribe el dispositivo y donde
        // se ve qué soporta el navegador cuando algo falla.
        main: resolve(__dirname, 'index.html'),
        capturar: resolve(__dirname, 'capturar.html'),
        notas: resolve(__dirname, 'notas.html'),
        finanzas: resolve(__dirname, 'finanzas.html'),
        gym: resolve(__dirname, 'gym.html'),
        analisis: resolve(__dirname, 'analisis.html'),
        entrar: resolve(__dirname, 'entrar.html'),
        diagnostico: resolve(__dirname, 'diagnostico.html'),
      },
    },
  },
});
