<script setup lang="ts">
import { ref } from "vue"

const props = defineProps<{ typescript: string, python: string }>()
const active = ref<"typescript" | "python">("typescript")
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(active.value === "typescript" ? props.typescript : props.python)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="code-tabs">
    <div class="code-tabs__bar" role="tablist">
      <button type="button" role="tab" :aria-selected="active === 'typescript'" class="code-tabs__tab" :class="{ 'is-active': active === 'typescript' }" @click="active = 'typescript'">
        TypeScript（核验库）
      </button>
      <button type="button" role="tab" :aria-selected="active === 'python'" class="code-tabs__tab" :class="{ 'is-active': active === 'python' }" @click="active = 'python'">
        Python（参考脚本）
      </button>
      <button type="button" class="btn--quiet small code-tabs__copy no-print" @click="copy">
        {{ copied ? "已复制" : "复制" }}
      </button>
    </div>
    <pre class="code-tabs__pre"><code>{{ active === "typescript" ? typescript : python }}</code></pre>
  </div>
</template>

<style scoped>
.code-tabs {
  margin: 0 0 1.4em;
}

.code-tabs__bar {
  display: flex;
  align-items: center;
  gap: 2px;
  border-bottom: 1px solid var(--rule);
}

.code-tabs__tab {
  border: 0;
  background: transparent;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--ink-soft);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  border-radius: 0;
}

.code-tabs__tab.is-active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.code-tabs__copy {
  margin-left: auto;
}

.code-tabs__pre {
  border-top: 0;
  border-radius: 0 0 var(--radius) var(--radius);
  max-height: 480px;
  font-size: 12.5px;
}
</style>
