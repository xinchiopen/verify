<script setup lang="ts">
import type { TrackLeg } from "./legs"
import { computed } from "vue"

const props = defineProps<{ legs: TrackLeg[], source?: [number, number] | null, target?: [number, number] | null }>()

const WIDTH = 640
const HEIGHT = 380
const PAD = 36

const projected = computed(() => {
  const all = props.legs.flatMap(leg => leg.points.map(point => [point.lat, point.lng] as [number, number]))
  if (props.source) all.push(props.source)
  if (props.target) all.push(props.target)
  if (!all.length) return null
  const lats = all.map(point => point[0])
  const lngs = all.map(point => point[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const spanLat = Math.max(maxLat - minLat, 1e-4)
  const spanLng = Math.max(maxLng - minLng, 1e-4) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const scale = Math.min((WIDTH - PAD * 2) / spanLng, (HEIGHT - PAD * 2) / spanLat)
  const project = ([lat, lng]: [number, number]) => ({
    x: PAD + ((lng - minLng) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)) * scale + ((WIDTH - PAD * 2) - spanLng * scale) / 2,
    y: HEIGHT - PAD - (lat - minLat) * scale - ((HEIGHT - PAD * 2) - spanLat * scale) / 2
  })
  return {
    legs: props.legs.map(leg => ({ ...leg, path: leg.points.map(point => project([point.lat, point.lng])), outside: leg.points.filter(point => !point.inside).map(point => project([point.lat, point.lng])) })),
    source: props.source ? project(props.source) : null,
    target: props.target ? project(props.target) : null
  }
})

function polyline(path: { x: number, y: number }[]): string {
  return path.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
}
</script>

<template>
  <figure class="sketch">
    <svg v-if="projected" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" aria-label="各运输段轨迹示意图">
      <rect x="0" y="0" :width="WIDTH" :height="HEIGHT" fill="#fbfaf7" />
      <g stroke="#e4e0d6" stroke-width="1">
        <line v-for="i in 7" :key="`v${i}`" :x1="i * WIDTH / 8" y1="0" :x2="i * WIDTH / 8" :y2="HEIGHT" />
        <line v-for="i in 4" :key="`h${i}`" x1="0" :y1="i * HEIGHT / 5" :x2="WIDTH" :y2="i * HEIGHT / 5" />
      </g>
      <g v-for="leg in projected.legs" :key="leg.leg.index">
        <polyline v-if="leg.path.length > 1" :points="polyline(leg.path)" fill="none" :stroke="leg.color" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-for="(point, index) in leg.path" :key="index" :cx="point.x" :cy="point.y" r="2.6" :fill="leg.color" />
        <circle v-for="(point, index) in leg.outside" :key="`o${index}`" :cx="point.x" :cy="point.y" r="7" fill="none" stroke="#b6322a" stroke-width="2" />
        <text v-if="leg.path.length" :x="leg.path[0].x + 8" :y="leg.path[0].y - 8" font-size="13" :fill="leg.color">第 {{ leg.leg.index }} 段起点</text>
      </g>
      <g v-if="projected.source">
        <circle :cx="projected.source.x" :cy="projected.source.y" r="9" fill="#fff" stroke="#1f1d1a" stroke-width="2" />
        <text :x="projected.source.x" :y="projected.source.y + 4" font-size="11" text-anchor="middle" fill="#1f1d1a">A</text>
      </g>
      <g v-if="projected.target">
        <circle :cx="projected.target.x" :cy="projected.target.y" r="9" fill="#1f1d1a" stroke="#1f1d1a" stroke-width="2" />
        <text :x="projected.target.x" :y="projected.target.y + 4" font-size="11" text-anchor="middle" fill="#fff">B</text>
      </g>
    </svg>
    <div v-else class="sketch__empty small muted">
      证据包里没有可绘制的轨迹点。
    </div>
    <figcaption class="small muted">
      离线示意图（WGS-84 直接投影，无底图）：A 发货地、B 收货地；每段一色，红圈为落在该段时间窗之外的点。
      <template v-for="leg in legs" :key="leg.leg.index">
        <span class="sketch__legend" :style="{ color: leg.color }">■ 第 {{ leg.leg.index }} 段 {{ leg.leg.driver_name ?? "" }} {{ leg.points.length }} 点</span>
      </template>
    </figcaption>
  </figure>
</template>

<style scoped>
.sketch {
  margin: 0 0 12px;
}

.sketch svg {
  width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  display: block;
}

.sketch__empty {
  border: 1px dashed var(--rule-strong);
  padding: 40px;
  text-align: center;
}

.sketch__legend {
  margin-left: 12px;
  white-space: nowrap;
}

figcaption {
  margin-top: 6px;
  max-width: none;
}
</style>
