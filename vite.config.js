import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // host:true is load-bearing -- this app must be tested on real phones over the
    // LAN, and localhost in a desktop browser will not surface the mobile layout or
    // iOS socket-suspension bugs.
    host: true,
  },
  build: { target: 'es2020', sourcemap: true },
  test: {
    // A DOM so components can actually be mounted. The pure-function tests are
    // useful but they cannot catch a component wiring a prop to a key that no
    // longer exists -- which is exactly how the masonry silently became a list.
    environment: 'happy-dom',
  },
})
