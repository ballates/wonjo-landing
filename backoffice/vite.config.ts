import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: servi sous wonjo.app/backoffice/ (chemin choisi pour ne pas entrer
// en collision avec /admin, l'interface Decap CMS des textes juridiques).
export default defineConfig({
  base: '/backoffice/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
