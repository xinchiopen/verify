<script setup lang="ts">
import AppFooter from "@/components/layout/AppFooter.vue"
import AppHeader from "@/components/layout/AppHeader.vue"
import { hasWebCrypto } from "@/lib/hash"

const cryptoReady = hasWebCrypto()
</script>

<template>
  <AppHeader />
  <div v-if="!cryptoReady" class="crypto-banner no-print" role="alert">
    当前页面不在安全上下文中（需要 HTTPS 或 localhost），浏览器未提供 Web Crypto，无法计算 SHA-512。请改用 https 地址打开。
  </div>
  <main class="app-main">
    <RouterView />
  </main>
  <AppFooter />
</template>

<style scoped>
.crypto-banner {
  background: var(--fail-soft);
  color: var(--fail);
  border-bottom: 1px solid var(--fail);
  padding: 12px 20px;
  text-align: center;
  font-size: 15px;
}

.app-main {
  min-height: 70vh;
  padding: 32px 0 64px;
}
</style>
