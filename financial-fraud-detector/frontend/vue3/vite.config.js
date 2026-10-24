import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径打包：build 产物可以直接丢到任意静态服务器
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // 只在开发期兜底；前端默认直连 http://<host>:8000（后端已开 CORS）
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../vue3-dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    // 本机 esbuild 子进程在 Windows 上清理临时文件被拦截，关掉压缩与降级转译即可正常产出
    target: 'esnext',
    minify: false,
    cssMinify: false,
  },
})
