<script setup lang="ts">
defineProps<{ tone?: "note" | "warn" | "fail" | "pass", title?: string }>()
</script>

<template>
  <aside class="callout" :class="`callout--${tone ?? 'note'}`">
    <p v-if="title" class="callout__title">
      {{ title }}
    </p>
    <div class="callout__body">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.callout {
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  padding: 12px 16px;
  margin: 0 0 1.2em;
  font-size: 15px;
  border-radius: 0 var(--radius) var(--radius) 0;
}

.callout--warn {
  border-color: var(--warn);
  background: var(--warn-soft);
}

.callout--fail {
  border-color: var(--fail);
  background: var(--fail-soft);
}

.callout--pass {
  border-color: var(--pass);
  background: var(--pass-soft);
}

.callout__title {
  font-weight: 600;
  margin-bottom: 4px;
}

.callout__body > :last-child {
  margin-bottom: 0;
}

.callout__body :deep(p) {
  max-width: none;
}
</style>
