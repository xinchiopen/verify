<script setup lang="ts">
defineProps<{ title?: string, subtitle?: string, tone?: "default" | "deep" }>()
</script>

<template>
  <section class="paper-card" :class="{ 'paper-card--deep': tone === 'deep' }">
    <header v-if="title || $slots.header" class="paper-card__header">
      <slot name="header">
        <h3 class="paper-card__title">
          {{ title }}
        </h3>
        <p v-if="subtitle" class="paper-card__subtitle muted small">
          {{ subtitle }}
        </p>
      </slot>
    </header>
    <div class="paper-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.paper-card {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 20px 22px;
  margin-bottom: 20px;
}

.paper-card--deep {
  background: var(--card-deep);
}

.paper-card__header {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rule);
}

.paper-card__title {
  margin: 0;
  font-size: 18px;
}

.paper-card__subtitle {
  margin: 4px 0 0;
  max-width: none;
}

.paper-card__body > :last-child {
  margin-bottom: 0;
}
</style>
