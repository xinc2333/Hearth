import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    root: path.resolve(__dirname, 'src/web'),
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, 'dist/web'),
        emptyOutDir: true,
        chunkSizeWarningLimit: 1200,
    },
    server: {
        port: 5173,
        proxy: { '/api': 'http://127.0.0.1:8730' },
    },
});
