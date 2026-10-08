<script setup lang="ts">
import type { CheckStatus } from "@/lib/types"
import { computed } from "vue"

const props = withDefaults(defineProps<{ status: CheckStatus, label?: string, size?: "sm" | "lg", stamped?: boolean }>(), { size: "lg", stamped: true })

const DEFAULT_LABEL: Record<CheckStatus, string> = { pass: "核验通过", fail: "核验未通过", warn: "通过但有提示", skip: "未核验" }
const text = computed(() => props.label ?? DEFAULT_LABEL[props.status])
</script>

<template>
  <div class="seal" :class="[`seal--${status}`, `seal--${size}`, { 'seal--stamped': stamped }]" role="img" :aria-label="text">
    <span class="seal__ring" aria-hidden="true" />
    <span class="seal__text">{{ text }}</span>
  </div>
</template>

<style scoped>
.seal {
  --seal-color: var(--skip);
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 128px;
  height: 128px;
  color: var(--seal-color);
  transform: rotate(-8deg);
  user-select: none;
  flex-shrink: 0;
}

.seal--sm {
  width: 76px;
  height: 76px;
}

.seal--pass {
  --seal-color: var(--pass);
}

.seal--fail {
  --seal-color: var(--fail);
}

.seal--warn {
  --seal-color: var(--warn);
}

.seal__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid var(--seal-color);
  box-shadow:
    inset 0 0 0 3px transparent,
    inset 0 0 0 4px var(--seal-color);
  mask-image: radial-gradient(circle at 30% 30%, #000 60%, rgba(0, 0, 0, 0.6) 100%);
  opacity: 0.92;
}

.seal__text {
  font-weight: 700;
  font-size: 19px;
  letter-spacing: 0.12em;
  text-align: center;
  padding: 0 14px;
  line-height: 1.2;
}

.seal--sm .seal__text {
  font-size: 12px;
  letter-spacing: 0.04em;
  padding: 0 8px;
}

.seal--stamped {
  animation: stamp 320ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}

@keyframes stamp {
  from {
    transform: rotate(-8deg) scale(1.6);
    opacity: 0;
  }

  to {
    transform: rotate(-8deg) scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .seal--stamped {
    animation: none;
  }
}
</style>
