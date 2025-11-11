import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  publicDir: 'public',
    build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        home:    resolve(__dirname, 'client/index.html'),
        timeline:resolve(__dirname, 'client/timeline.html'),
        about:   resolve(__dirname, 'client/about.html'),
        country: resolve(__dirname, 'client/country.html'),
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        //target: 'http://10.129.111.24:3000',//
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});