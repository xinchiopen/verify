<script setup lang="ts">
import { RouterLink } from "vue-router"

// 品牌字样只来自构建变量：公开仓默认「存证链核验」，各部署方可注入自己的名称
const brandName = import.meta.env.VITE_APP_TITLE || "存证链核验"
</script>

<template>
  <header class="app-header no-print">
    <div class="container app-header__inner">
      <RouterLink to="/" class="brand">
        <span class="brand__mark" aria-hidden="true" />
        <span class="brand__name">{{ brandName }}</span>
      </RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink to="/">
          原理
        </RouterLink>
        <RouterLink to="/steps/1" :class="{ 'router-link-active': $route.path.startsWith('/steps') }">
          分步演示
        </RouterLink>
        <RouterLink to="/verify" class="nav__cta">
          核验证据包
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
  position: sticky;
  top: 0;
  z-index: 10;
}

.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 60px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
  font-size: 17px;
}

.brand__mark {
  width: 22px;
  height: 22px;
  border: 2px solid var(--fail);
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 2px var(--paper),
    inset 0 0 0 3px var(--fail);
}

.nav {
  display: flex;
  gap: 22px;
  align-items: center;
  font-size: 15px;
}

.nav a {
  color: var(--ink-soft);
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
}

.nav a.router-link-active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.nav__cta {
  color: var(--accent) !important;
}

@media (max-width: 640px) {
  .brand__name {
    display: none;
  }

  .nav {
    gap: 14px;
  }
}
</style>
