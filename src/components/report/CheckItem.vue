<script setup lang="ts">
import type { Check } from "@/lib/types"
import HashBlock from "./HashBlock.vue"

defineProps<{ check: Check, showSubject?: boolean }>()

const MARK: Record<Check["status"], string> = { pass: "✓", fail: "✕", warn: "!", skip: "–" }
const TEXT: Record<Check["status"], string> = { pass: "通过", fail: "失败", warn: "提示", skip: "跳过" }
</script>

<template>
  <li class="check-item" :class="`check-item--${check.status}`">
    <span class="check-item__mark" :aria-label="TEXT[check.status]">{{ MARK[check.status] }}</span>
    <div class="check-item__body">
      <div class="check-item__head">
        <span class="check-item__title">{{ check.title }}</span>
        <span class="check-item__status">{{ TEXT[check.status] }}</span>
        <code v-if="showSubject && (check.subject?.filePath || check.subject?.nodeUuid)" class="check-item__subject faint">{{ check.subject?.filePath ?? check.subject?.nodeUuid }}</code>
      </div>
      <p v-if="check.detail" class="check-item__detail">
        {{ check.detail }}
      </p>
      <details v-if="check.expected !== undefined || check.actual !== undefined" class="check-item__values">
        <summary class="small muted">
          期望值 / 实际值
        </summary>
        <HashBlock label="期望" :value="check.expected" :tone="check.status === 'fail' ? 'default' : 'pass'" />
        <HashBlock label="实际" :value="check.actual" :tone="check.status === 'fail' ? 'fail' : 'pass'" />
      </details>
      <code class="check-item__id faint">{{ check.id }}</code>
    </div>
  </li>
</template>

<style scoped>
.check-item {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--rule);
  list-style: none;
}

.check-item:last-child {
  border-bottom: 0;
}

.check-item__mark {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--skip);
  margin-top: 3px;
}

.check-item--pass .check-item__mark {
  background: var(--pass);
}

.check-item--fail .check-item__mark {
  background: var(--fail);
}

.check-item--warn .check-item__mark {
  background: var(--warn);
}

.check-item__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.check-item__title {
  font-weight: 600;
}

.check-item__status {
  font-size: 13px;
}

.check-item--pass .check-item__status {
  color: var(--pass);
}

.check-item--fail .check-item__status {
  color: var(--fail);
}

.check-item--warn .check-item__status {
  color: var(--warn);
}

.check-item--skip .check-item__status {
  color: var(--skip);
}

.check-item__subject {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.check-item__detail {
  margin: 4px 0;
  font-size: 15px;
  max-width: none;
  color: var(--ink-soft);
}

.check-item__values {
  margin: 4px 0;
}

.check-item__id {
  font-size: 11.5px;
  display: block;
  margin-top: 2px;
  overflow-wrap: anywhere;
}
</style>
