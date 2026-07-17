import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/@vue/') || id.includes('/vue/') || id.includes('/vue-router/')) return 'vue'
          if (id.includes('/dayjs/')) return 'date'
          if (id.includes('/async-validator/')) return 'form-validator'
          if (id.includes('/@floating-ui/') || id.includes('/@popperjs/')) return 'floating-ui'
        }
      }
    }
  },
  server: {
    port: 6275,
    strictPort: true,
  },
})
