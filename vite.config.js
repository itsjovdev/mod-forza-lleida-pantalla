import { defineConfig } from 'vite';

// base relativa: el build (dist/) funciona servit des de qualsevol ruta o com a fitxer local a OBS
export default defineConfig({ base: './', build: { target: 'es2022' } });
