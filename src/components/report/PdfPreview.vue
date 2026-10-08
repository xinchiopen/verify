<script setup lang="ts">
import type { Check, ManifestFile } from "@/lib/types"
import { computed, onBeforeUnmount } from "vue"
import { bytesToObjectUrl, downloadBytes, formatBytes } from "@/app/download"
import { expectedQrTexts } from "@/lib/files"
import CheckList from "./CheckList.vue"

const props = defineProps<{ file: ManifestFile, bytes: Uint8Array | undefined, sn: string, checks: Check[] }>()

const url = computed(() => props.bytes ? bytesToObjectUrl(props.bytes, "application/pdf") : "")
onBeforeUnmount(() => {
  if (url.value) URL.revokeObjectURL(url.value)
})
const qrTexts = computed(() => expectedQrTexts(props.sn, props.file.page_count ?? 0))
</script>

<template>
  <article class="pdf-card">
    <div class="pdf-card__frame">
      <object v-if="url" :data="url" type="application/pdf" class="pdf-card__object" :aria-label="`电子回执 ${file.uuid}`">
        <p class="small muted">
          浏览器不支持内嵌预览。<a :href="url" target="_blank" rel="noopener">在新窗口打开</a>
        </p>
      </object>
      <div v-else class="pdf-card__missing small">
        证据包内没有该回执
      </div>
    </div>
    <div class="pdf-card__meta">
      <p class="mono small pdf-card__name">
        {{ file.uuid }}.pdf <span class="faint">· {{ formatBytes(file.size) }} · {{ file.page_count ?? "?" }} 页</span>
      </p>
      <p class="small">
        每页右上角二维码的内容应为：
      </p>
      <ul class="small pdf-card__qr">
        <li v-for="text in qrTexts" :key="text">
          <code>{{ text }}</code>
        </li>
      </ul>
      <p class="small faint">
        二维码内容只是页码索引，不是证据要素；文件是否被改动以上面的 SHA-512 为准。
      </p>
      <CheckList :checks="checks" />
      <button v-if="bytes" type="button" class="small no-print" @click="downloadBytes(bytes, `${file.uuid}.pdf`, 'application/pdf')">
        另存回执 PDF
      </button>
    </div>
  </article>
</template>

<style scoped>
.pdf-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: 18px;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.pdf-card__object {
  width: 100%;
  height: 520px;
  border: 1px solid var(--rule);
  background: #fff;
}

.pdf-card__missing {
  border: 1px dashed var(--rule-strong);
  padding: 60px 12px;
  text-align: center;
  color: var(--ink-faint);
}

.pdf-card__name {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}

.pdf-card__qr {
  padding-left: 18px;
}

@media (max-width: 900px) {
  .pdf-card {
    grid-template-columns: 1fr;
  }

  .pdf-card__object {
    height: 420px;
  }
}
</style>
