import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // This codebase keeps JSX in .js files. Vite 8 transforms with oxc instead of
  // esbuild, and oxc skips .js by default and infers "no JSX" from the
  // extension, so both the filter and the language have to be set explicitly.
  // The old `esbuild: { loader: 'jsx' }` does not carry over — Vite's
  // esbuild-to-oxc shim maps jsx/define and silently drops `loader`.
  oxc: {
    include: /src\/.*\.jsx?$/,
    exclude: [],
    lang: 'jsx',
  },
  resolve: {
    alias: {
      'cloudflare:email': path.resolve(__dirname, 'src/__tests__/mocks/cloudflare-email.js'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js', 'src/**/*.jsx'],
      exclude: ['src/__tests__/**', 'src/index.js', 'node_modules/**'],
    },
  },
});
