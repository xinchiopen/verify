<script setup lang="ts">
import type { TrackLeg } from "./legs"
import type { AMapMap } from "@/app/amap"
import { onBeforeUnmount, ref } from "vue"
import { amapConfigured, loadAmap } from "@/app/amap"
import { wgs84ToGcj02 } from "@/lib/geo"

const props = defineProps<{ legs: TrackLeg[], source?: [number, number] | null, target?: [number, number] | null }>()

const available = amapConfigured()
const opened = ref(false)
const loading = ref(false)
const error = ref("")
const container = ref<HTMLDivElement | null>(null)
let map: AMapMap | null = null

async function open() {
  opened.value = true
  loading.value = true
  error.value = ""
  try {
    const AMap = await loadAmap()
    if (!container.value) return
    map = new AMap.Map(container.value, { viewMode: "2D", zoom: 12, resizeEnable: true })
    const overlays = props.legs.filter(leg => leg.points.length > 1).map(leg => new AMap.Polyline({
      path: leg.points.map((point) => {
        const [lat, lng] = wgs84ToGcj02(point.lat, point.lng)
        return [lng, lat] as [number, number]
      }),
      strokeColor: leg.color,
      strokeWeight: 5,
      strokeOpacity: 0.9,
      lineJoin: "round"
    }))
    for (const [title, point] of [["发货地", props.source], ["收货地", props.target]] as const) {
      if (!point) continue
      const [lat, lng] = wgs84ToGcj02(point[0], point[1])
      overlays.push(new AMap.Marker({ position: [lng, lat], title }))
    }
    map.add(overlays)
    map.setFitView(overlays)
  } catch (exc) {
    error.value = exc instanceof Error ? exc.message : "地图加载失败"
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => map?.destroy())
</script>

<template>
  <div v-if="available" class="amap no-print">
    <button v-if="!opened" type="button" class="btn" @click="open">
      在高德地图上查看（将向高德请求底图，坐标会发送给地图服务商）
    </button>
    <p v-if="loading" class="small muted">
      正在加载地图…
    </p>
    <p v-if="error" class="small status-fail">
      {{ error }}
    </p>
    <div v-show="opened" ref="container" class="amap__canvas" />
  </div>
</template>

<style scoped>
.amap {
  margin-bottom: 12px;
}

.amap__canvas {
  width: 100%;
  height: 420px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  margin-top: 10px;
}
</style>
