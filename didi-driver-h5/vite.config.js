import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver({ importStyle: true })],
    }),
  ],
  server: {
    // 默认只绑 ::1 时，用 http://127.0.0.1:5174 会连不上；true 同时监听 IPv4 + 可局域网调试
    host: true,
    port: 5174,
    strictPort: true,
  },
})
