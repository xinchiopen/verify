<script setup lang="ts">
defineProps<{ rows?: number, label?: string, original?: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="json-editor">
    <div v-if="label || original !== undefined" class="json-editor__bar">
      <span class="small muted">{{ label }}</span>
      <button v-if="original !== undefined && original !== model" type="button" class="btn--quiet small" @click="model = original">
        恢复原文
      </button>
    </div>
    <textarea v-model="model" :rows="rows ?? 10" spellcheck="false" />
  </div>
</template>

<style scoped>
.json-editor__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
</style>
