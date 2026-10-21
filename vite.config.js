import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env': {}
  },
  server: {
    port: 3000,
    open: '/login'
  },
  build: {
    target: 'esnext'
  }
});
