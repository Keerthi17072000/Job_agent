import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// base './' so the build works under https://<user>.github.io/<repo>/
export default defineConfig({ base: './', plugins: [react(), tailwind()] });
