<script setup lang="ts">
import type { Check, ManifestFile, NodePayloadImage } from "@/lib/types"
import { computed, onBeforeUnmount, watchEffect } from "vue"
import { bytesToObjectUrl, formatBytes } from "@/app/download"
import { parseUserComment } from "@/lib/exif"
import { buildWatermarkLines } from "@/lib/watermark"
import CheckList from "./CheckList.vue"

const props = defineProps<{ file: ManifestFile, bytes: Uint8Array | undefined, chainImage: NodePayloadImage | undefined, checks: Check[] }>()

let url = ""
const objectUrl = computed(() => {
  if (url) URL.revokeObjectURL(url)
  url = props.bytes ? bytesToObjectUrl(props.bytes, "image/jpeg") : ""
  return url
})
watchEffect(() => objectUrl.value)
onBeforeUnmount(() => {
  if (url) URL.revokeObjectURL(url)
})

const record = computed(() => props.bytes ? parseUserComment(props.bytes) : null)
const coordinates = computed(() => {
  const latitude = typeof record.value?.latitude === "string" ? record.value.latitude : null
  const longitude = typeof record.value?.longitude === "string" ? record.value.longitude : null
  return latitude && longitude ? { latitude, longitude } : null
})
const expectedLines = computed(() => record.value
  ? buildWatermarkLines({ sn: String(record.value.sn ?? ""), uploadedAt: String(record.value.uploaded_at ?? ""), uuid: String(record.value.uuid ?? ""), ...coordinates.value })
  : (props.chainImage?.watermark_text?.split("\n") ?? []))
const worst = computed(() => props.checks.some(check => check.status === "fail") ? "fail" : props.checks.some(check => check.status === "warn") ? "warn" : "pass")
</script>

<template>
  <article class="image-card" :class="`image-card--${worst}`">
    <div class="image-card__media">
      <img v-if="objectUrl" :src="objectUrl" :alt="`签单图片 ${file.uuid}`">
      <div v-else class="image-card__missing small">
        证据包内没有该图片
      </div>
    </div>
    <div class="image-card__meta">
      <p class="image-card__name mono small">
        {{ file.uuid }}.jpg <span class="faint">· {{ formatBytes(file.size) }}</span>
      </p>
      <table class="small">
        <tbody>
          <tr>
            <th>EXIF 记录</th>
            <td v-if="record">
              <div>图片编号 <code>{{ record.uuid }}</code></div>
              <div>申请单号 <code>{{ record.sn }}</code></div>
              <div>上传时间 <code>{{ record.uploaded_at }}</code></div>
              <div>原图摘要 <code class="image-card__hash">{{ record.raw_sha512 }}</code></div>
              <div v-if="coordinates">
                经纬度 <code>{{ coordinates.latitude }}, {{ coordinates.longitude }}</code> <span class="faint">（签单令牌位置，WGS-84）</span>
              </div>
            </td>
            <td v-else class="muted">
              未读到本系统写入的 EXIF 记录
            </td>
          </tr>
          <tr>
            <th>应印水印</th>
            <td>
              <div v-for="line in expectedLines" :key="line">
                <code>{{ line }}</code>
              </div>
              <span class="faint">图上左下角各行须与此一致，请目视核对</span>
            </td>
          </tr>
        </tbody>
      </table>
      <CheckList :checks="checks" />
    </div>
  </article>
</template>

<style scoped>
.image-card {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 18px;
  background: var(--card);
  border: 1px solid var(--rule);
  border-top: 3px solid var(--pass);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.image-card--fail {
  border-top-color: var(--fail);
}

.image-card--warn {
  border-top-color: var(--warn);
}

.image-card__media img {
  width: 100%;
  height: auto;
  display: block;
  border: 1px solid var(--rule);
  background: #fff;
}

.image-card__missing {
  border: 1px dashed var(--rule-strong);
  padding: 40px 12px;
  text-align: center;
  color: var(--ink-faint);
}

.image-card__name {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}

.image-card__hash {
  overflow-wrap: anywhere;
}

.image-card__meta table {
  margin-bottom: 8px;
}

.image-card__meta th {
  width: 84px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .image-card {
    grid-template-columns: 1fr;
  }
}
</style>
