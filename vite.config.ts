/// <reference types="vitest/config" />

import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import { defineConfig, loadEnv } from "vite"

// Configuring Vite: https://cn.vite.dev/config
export default defineConfig(({ mode }) => {
  const { VITE_PUBLIC_PATH } = loadEnv(mode, process.cwd(), "") as ImportMetaEnv
  return {
    base: VITE_PUBLIC_PATH || "/",
    plugins: [vue()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src")
      }
    },
    server: {
      host: true,
      port: 3334,
      strictPort: false,
      open: false,
      // 开发期由 Vite dev server 充当飞书转发代理；生产：自建站 nginx-verify.conf 同源反代，GitHub Pages 用 worker/ 的 Cloudflare Worker
      proxy: {
        "/feishu-api": {
          target: "https://open.feishu.cn",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/feishu-api/, "/open-apis")
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 2048,
      reportCompressedSize: false
    },
    esbuild: {
      drop: ["debugger"]
    },
    // 核验库测试跑在 node 环境（Web Crypto 由 Node 提供）；组件测试文件头部用 @vitest-environment happy-dom
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node"
    }
  }
})
