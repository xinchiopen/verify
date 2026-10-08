import { resolve } from "node:path"
import { defineConfig } from "vite"

// 核验库独立构建：零 DOM 依赖的 ESM 产物，供第三方在浏览器或 Node 中直接引用
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      formats: ["es"],
      fileName: "verify"
    },
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: ["fflate"]
    }
  }
})
