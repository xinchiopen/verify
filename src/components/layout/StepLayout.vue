<script setup lang="ts">
import { RouterLink } from "vue-router"
import { STEP_TITLES } from "@/router"

const props = defineProps<{ step: 1 | 2 | 3 | 4, title: string, lede: string }>()
const prev = props.step > 1 ? `/steps/${props.step - 1}` : "/"
const next = props.step < 4 ? `/steps/${props.step + 1}` : "/verify"
const prevTitle = props.step > 1 ? STEP_TITLES[props.step - 2] : ""
const nextTitle = (STEP_TITLES as readonly string[])[props.step] ?? ""
</script>

<template>
  <div class="container step">
    <nav class="step-nav no-print" aria-label="核验步骤">
      <RouterLink v-for="(name, index) in STEP_TITLES" :key="name" :to="`/steps/${index + 1}`" class="step-nav__item" :class="{ 'is-current': index + 1 === step }">
        <span class="step-nav__num">{{ index + 1 }}</span>
        <span>{{ name }}</span>
      </RouterLink>
    </nav>
    <header class="step__head">
      <p class="step__kicker muted">
        第 {{ ["一", "二", "三", "四"][step - 1] }} 步
      </p>
      <h1>{{ title }}</h1>
      <p class="step__lede">
        {{ lede }}
      </p>
    </header>
    <div class="step__grid">
      <div class="step__explain">
        <slot name="explain" />
      </div>
      <div class="step__demo">
        <slot name="demo" />
      </div>
    </div>
    <nav class="step__pager no-print">
      <RouterLink :to="prev" class="btn">
        {{ step > 1 ? `上一步：${prevTitle}` : "回到原理" }}
      </RouterLink>
      <RouterLink :to="next" class="btn btn--primary">
        {{ step < 4 ? `下一步：${nextTitle}` : "去核验真实证据包" }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.step-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  margin-bottom: 28px;
  font-size: 15px;
}

.step-nav__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
  text-decoration: none;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
}

.step-nav__item.is-current {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.step-nav__num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid currentcolor;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
}

.step__kicker {
  margin-bottom: 4px;
}

.step__lede {
  font-size: 18px;
  color: var(--ink-soft);
}

.step__grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 40px;
  align-items: start;
  margin-top: 28px;
}

.step__explain :deep(h2) {
  margin-top: 1.4em;
  font-size: 22px;
}

.step__explain :deep(h2:first-child) {
  margin-top: 0;
}

.step__pager {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 48px;
  flex-wrap: wrap;
}

@media (max-width: 1023px) {
  .step__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
