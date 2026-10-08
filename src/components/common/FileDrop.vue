<script setup lang="ts">
import { ref } from "vue"

defineProps<{ busy?: boolean }>()
const emit = defineEmits<{ file: [file: File] }>()
const dragging = ref(false)
const input = ref<HTMLInputElement | null>(null)

function pick(files: FileList | null | undefined) {
  const file = files?.[0]
  if (file) emit("file", file)
}
</script>

<template>
  <label
    class="file-drop"
    :class="{ 'is-dragging': dragging, 'is-busy': busy }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="dragging = false; pick($event.dataTransfer?.files)"
  >
    <input ref="input" type="file" accept=".zip,application/zip" class="visually-hidden" :disabled="busy" @change="pick(($event.target as HTMLInputElement).files); if (input) input.value = ''">
    <span class="file-drop__title">拖入证据包 zip，或点击选择文件</span>
    <span class="file-drop__hint small muted">文件仅在本机浏览器内解压与计算，不会上传。</span>
  </label>
</template>

<style scoped>
.file-drop {
  display: grid;
  gap: 4px;
  justify-items: center;
  text-align: center;
  padding: 44px 20px;
  border: 2px dashed var(--rule-strong);
  border-radius: var(--radius);
  background: var(--card);
  cursor: pointer;
}

.file-drop:hover,
.file-drop.is-dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.file-drop.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.file-drop__title {
  font-size: 18px;
  font-weight: 600;
}
</style>
