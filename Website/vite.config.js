import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  publicDir: 'public',
 
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