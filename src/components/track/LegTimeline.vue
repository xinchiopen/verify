<script setup lang="ts">
import type { TrackLeg } from "./legs"
import { computed } from "vue"

const props = defineProps<{ legs: TrackLeg[] }>()

const range = computed(() => {
  const times = props.legs.flatMap(leg => [leg.start, leg.end, ...leg.points.map(point => point.timestamp)]).filter((value): value is number => value !== null && value > 0)
  if (!times.length) return null
  const min = Math.min(...times)
  const max = Math.max(...times)
  const span = Math.max(max - min, 60 * 1000)
  return { min, max, span, pct: (value: number) => `${((value - min) / span * 100).toFixed(2)}%` }
})
</script>

<template>
  <div v-if="range" class="timeline" role="img" aria-label="各运输段时间窗与轨迹点时间分布">
    <div v-for="leg in legs" :key="leg.leg.index" class="timeline__row">
      <span class="timeline__label small">第 {{ leg.leg.index }} 段</span>
      <div class="timeline__track">
        <span v-if="leg.start !== null && leg.end !== null" class="timeline__window" :style="{ left: range.pct(leg.start), width: `calc(${range.pct(leg.end)} - ${range.pct(leg.start)})`, background: leg.color }" />
        <span v-for="(point, index) in leg.points" :key="index" class="timeline__tick" :class="{ 'is-outside': !point.inside }" :style="{ left: range.pct(point.timestamp) }" :title="point.time" />
      </div>
      <span class="timeline__time small muted">{{ leg.leg.start_time }} → {{ leg.leg.end_time }}</span>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.timeline__row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 4px 10px;
  align-items: center;
}

.timeline__track {
  position: relative;
  height: 18px;
  background: var(--card-deep);
  border-radius: 9px;
  overflow: hidden;
}

.timeline__window {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: 0.35;
}

.timeline__tick {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 2px;
  background: var(--ink);
  transform: translateX(-1px);
}

.timeline__tick.is-outside {
  background: var(--fail);
  width: 4px;
  top: 0;
  bottom: 0;
}

.timeline__time {
  grid-column: 2;
}
</style>
