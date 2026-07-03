import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const normalizedId = id.replace(/\\/g, '/');

          if (
            normalizedId.includes('/@emotion/')
            || normalizedId.includes('/@mui/')
            || normalizedId.includes('/stylis/')
          ) {
            return 'vendor-ui';
          }
          if (normalizedId.includes('/react-router') || normalizedId.includes('/@remix-run/')) {
            return 'vendor-router';
          }
          if (normalizedId.includes('/recharts/') || normalizedId.includes('/d3-')) {
            return 'vendor-charts';
          }
          if (normalizedId.includes('/framer-motion/') || normalizedId.includes('/motion-dom/') || normalizedId.includes('/motion-utils/')) {
            return 'vendor-motion';
          }
          if (normalizedId.includes('/hls.js/')) {
            return 'vendor-hls';
          }
          if (normalizedId.includes('/react-icons/')) {
            return 'vendor-react-icons';
          }
          if (normalizedId.includes('/axios/')) {
            return 'vendor-axios';
          }
          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
