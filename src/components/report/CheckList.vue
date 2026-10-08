<script setup lang="ts">
import type { Check, CheckStatus } from "@/lib/types"
import { computed, ref } from "vue"
import CheckItem from "./CheckItem.vue"

const props = withDefaults(defineProps<{ checks: Check[], showSubject?: boolean, collapsePass?: boolean, title?: string }>(), { collapsePass: false })

const hidePass = ref(props.collapsePass)
const counts = computed(() => {
  const summary: Record<CheckStatus, number> = { pass: 0, fail: 0, warn: 0, skip: 0 }
  for (const check of props.checks) summary[check.status] += 1
  return summary
})
const visible = computed(() => hidePass.value ? props.checks.filter(check => check.status !== "pass") : props.checks)
</script>

<template>
  <div class="check-list">
    <div v-if="title || checks.length > 3" class="check-list__bar">
      <strong v-if="title">{{ title }}</strong>
      <span class="small muted">通过 {{ counts.pass }} · 失败 {{ counts.fail }} · 提示 {{ counts.warn }} · 跳过 {{ counts.skip }}</span>
      <button v-if="counts.pass > 0 && checks.length > 3" type="button" class="btn--quiet small no-print" @click="hidePass = !hidePass">
        {{ hidePass ? "显示通过项" : "只看未通过项" }}
      </button>
    </div>
    <ul class="check-list__items">
      <CheckItem v-for="check in visible" :key="check.id" :check="check" :show-subject="showSubject" />
      <li v-if="!visible.length" class="small muted check-list__empty">
        没有需要关注的项。
      </li>
    </ul>
  </div>
</template>

<style scoped>
.check-list__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  margin-bottom: 6px;
}

.check-list__items {
  margin: 0;
  padding: 0;
  max-width: none;
}

.check-list__empty {
  list-style: none;
  padding: 8px 0;
}
</style>
