<script setup lang="ts">
import type { TrackLeg } from "./legs"
import type { AMapMap } from "@/app/amap"
import { onBeforeUnmount, onMounted, ref } from "vue"
import { amapConfigured, loadAmap } from "@/app/amap"
import { wgs84ToGcj02 } from "@/lib/geo"

const props = defineProps<{ legs: TrackLeg[], source?: [number, number] | null, target?: [number, number] | null }>()
/** `shown`：地图成功渲染为 true、加载失败为 false；父组件据此在屏幕上隐藏 / 恢复离线草图（打印态始终用草图）。 */
const emit = defineEmits<{ shown: [value: boolean] }>()

const available = amapConfigured()
const loading = ref(false)
const error = ref("")
const container = ref<HTMLDivElement | null>(null)
let map: AMapMap | null = null

async function open() {
  loading.value = true
  error.value = ""
  try {
    const AMap = await loadAmap()
    if (!container.value) return
    map?.destroy()
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
    emit("shown", true)
  } catch (exc) {
    error.value = exc instanceof Error ? exc.message : "地图加载失败"
    emit("shown", false)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (available) void open()
})
onBeforeUnmount(() => map?.destroy())
</script>

<template>
  <div v-if="available" class="amap no-print">
    <p class="small muted amap__note">
      底图由高德地图提供，轨迹坐标已发送给地图服务商并按 GCJ-02 偏转显示；核验结论只依据证据包内的 WGS-84 原始坐标，打印时仍使用离线草图。
    </p>
    <p v-if="loading" class="small muted">
      正在加载地图…
    </p>
    <p v-if="error" class="small status-fail">
      {{ error }}，已改用离线草图。
      <button type="button" class="btn--quiet small" @click="open">
        重试
      </button>
    </p>
    <div v-show="!error" ref="container" class="amap__canvas" />
  </div>
</template>

<style scoped>
.amap {
  margin-bottom: 12px;
}

.amap__note {
  margin: 0 0 8px;
  max-width: none;
}

.amap__canvas {
  width: 100%;
  height: 420px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}
</style>
