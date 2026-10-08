<script setup lang="ts">
import type { Check, EvidencePackage } from "@/lib/types"
import { computed, onMounted, ref, shallowRef, watch } from "vue"
import { pythonStepSource, TS_USAGE } from "@/app/codeSamples"
import Callout from "@/components/common/Callout.vue"
import CodeTabs from "@/components/common/CodeTabs.vue"
import JsonEditor from "@/components/common/JsonEditor.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import StepLayout from "@/components/layout/StepLayout.vue"
import CheckList from "@/components/report/CheckList.vue"
import HashBlock from "@/components/report/HashBlock.vue"
import SealMark from "@/components/report/SealMark.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { computeNodeSignature, verifyLinks } from "@/lib/node"

const { ensure, clonePackage, error } = useDemoChain()
const pkg = shallowRef<EvidencePackage | null>(null)
const index = ref(0)
const originalData = ref("")
const data = ref("")
const createdAt = ref("")
const recomputed = ref("")
const links = ref<Check[]>([])
const node = computed(() => pkg.value?.nodes[index.value] ?? null)
const ok = computed(() => node.value ? recomputed.value === node.value.signature : false)
const NAMES = ["提货签收（司机甲）", "接力（甲交给乙）", "送货签收（司机乙）"]

onMounted(async () => {
  pkg.value = clonePackage(await ensure())
  select(0)
})

async function select(target: number) {
  index.value = target
  if (!node.value) return
  originalData.value = (await ensure()).nodes[target].data
  data.value = node.value.data
  createdAt.value = node.value.created_at
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([data, createdAt], () => {
  clearTimeout(timer)
  timer = setTimeout(recompute, 120)
})

async function recompute() {
  if (!node.value || !pkg.value) return
  node.value.data = data.value
  node.value.created_at = createdAt.value
  recomputed.value = await computeNodeSignature(node.value)
  links.value = verifyLinks(pkg.value.nodes)
}

async function restore() {
  const demoPkg = await ensure()
  const fresh = clonePackage(demoPkg)
  pkg.value = fresh
  await select(index.value)
  await recompute()
}
</script>

<template>
  <StepLayout :step="1" title="重算节点哈希，核对链接关系" lede="每个节点的哈希仅由四段输入决定。按原文拼接后重算 SHA-512，结果与记录一致，即证明四段输入自写链以来未发生改动。">
    <template #explain>
      <h2>公式</h2>
      <pre><code>raw       = uuid + created_at + prev_signature + data
signature = SHA-512(raw 的 UTF-8 字节)，小写十六进制，128 位</code></pre>
      <ul>
        <li>四段<strong>直接拼接</strong>，中间没有任何分隔符。</li>
        <li><code>created_at</code> 是形如 <code>2026-04-14 09:00:03.412587</code> 的字符串，恒带 6 位微秒。</li>
        <li><code>prev_signature</code> 是前一个节点的哈希；整条链的第一个节点为空字符串。</li>
        <li><code>data</code> 是数据库里保存的 JSON 原文。<strong>必须按原文字符串参与</strong>——解析后再重新序列化，哪怕只是空格或键的顺序不同，哈希就变了。</li>
      </ul>
      <h2>链接关系的证明范围</h2>
      <p>
        前驱哈希是本节点哈希的输入之一，本节点重算一致即同时证明其引用的前驱哈希未被替换。
        证明「后继节点确实引用了本节点」需要后继节点的原文；相邻节点通常属于<strong>其他客户的运单</strong>，证据包不包含其原文，仅提供编号、时间、哈希与飞书消息 id 作为线索。核验工具将该项记为「跳过」（包内不可核验），后继关系由第四步以后继节点的飞书消息佐证。
      </p>
      <Callout title="哈希链自身不排除整体重建">
        <p>哈希计算不含密钥，控制数据库的一方理论上可自某一节点起重算其后整条链。约束此类重建的，是写链当时已交付至业务系统之外的副本，见第四步「链外锚点」。</p>
      </Callout>
      <h2>示例代码</h2>
      <CodeTabs :typescript="TS_USAGE[1]" :python="pythonStepSource(1)" />
    </template>
    <template #demo>
      <p v-if="error" class="status-fail">
        演示链生成失败：{{ error }}
      </p>
      <PaperCard v-else-if="node" title="演示链 · 现场重算" subtitle="演示链由浏览器现场生成（提货 → 接力 → 送货），哈希公式与真实链一致。">
        <div class="picker no-print">
          <button v-for="(name, i) in NAMES" :key="name" type="button" class="small" :class="{ 'btn--primary': i === index }" @click="select(i)">
            节点 {{ i + 1 }} · {{ name }}
          </button>
        </div>
        <div class="verdict">
          <SealMark :status="ok ? 'pass' : 'fail'" size="sm" :label="ok ? '一致' : '不一致'" :stamped="false" />
          <div>
            <HashBlock label="记录的哈希" :value="node.signature" />
            <HashBlock label="重算的哈希" :value="recomputed" :tone="ok ? 'pass' : 'fail'" />
          </div>
        </div>
        <label class="field">
          <span class="small muted">① 节点编号 uuid（不可编辑）</span>
          <code class="field__code">{{ node.uuid }}</code>
        </label>
        <label class="field">
          <span class="small muted">② 上链时间 created_at（可修改末位微秒观察变化）</span>
          <input v-model="createdAt" type="text" class="mono" spellcheck="false">
        </label>
        <label class="field">
          <span class="small muted">③ 前驱哈希 prev_signature（不可编辑）</span>
          <code class="field__code">{{ node.prev_signature || "（空字符串）" }}</code>
        </label>
        <JsonEditor v-model="data" :rows="12" label="④ 节点原文 data（修改任一字符后观察上方重算结果）" :original="originalData" />
        <button type="button" class="btn small no-print" @click="restore">
          恢复这个节点
        </button>
      </PaperCard>
      <PaperCard v-if="links.length" title="链接关系">
        <CheckList :checks="links" show-subject />
        <p class="small muted">
          演示链的首节点前驱与尾节点后继均指向「其他运单」的节点，因此这两项记为「跳过」，真实证据包亦如此；尾节点的后继关系在第四步以后继节点的飞书消息佐证。
        </p>
      </PaperCard>
    </template>
  </StepLayout>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.verdict {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
}

.field {
  display: block;
  margin-bottom: 12px;
}

.field__code {
  display: block;
  padding: 6px 8px;
  overflow-wrap: anywhere;
  font-size: 12.5px;
}
</style>
