<script setup lang="ts">
defineProps<{ value: string | null | undefined, label?: string, tone?: "default" | "pass" | "fail" | "muted" }>()
</script>

<template>
  <div class="hash" :class="`hash--${tone ?? 'default'}`">
    <span v-if="label" class="hash__label">{{ label }}</span>
    <code class="hash__value">{{ value || "（无）" }}</code>
  </div>
</template>

<style scoped>
.hash {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  align-items: baseline;
  margin: 4px 0;
  font-size: 13px;
}

.hash__label {
  color: var(--ink-soft);
  white-space: nowrap;
  font-size: 14px;
}

.hash__value {
  overflow-wrap: anywhere;
  word-break: break-all;
  line-height: 1.5;
  background: var(--card-deep);
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 12.5px;
}

.hash--pass .hash__value {
  background: var(--pass-soft);
  color: var(--pass);
}

.hash--fail .hash__value {
  background: var(--fail-soft);
  color: var(--fail);
}

.hash--muted .hash__value {
  color: var(--ink-faint);
}

@media (max-width: 640px) {
  .hash {
    grid-template-columns: 1fr;
  }
}
</style>
