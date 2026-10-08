<script setup lang="ts">
import type { Check, EvidencePackage } from "@/lib/types"
import { computed, onMounted, ref, shallowRef, watch } from "vue"
import { pythonStepSource, TS_USAGE } from "@/app/codeSamples"
import Callout from "@/components/common/Callout.vue"
import CodeTabs from "@/components/common/CodeTabs.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import StepLayout from "@/components/layout/StepLayout.vue"
import CheckList from "@/components/report/CheckList.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { useFeishuConnection } from "@/composables/useFeishuConnection"
import { compareAnchor, compareSuccessorAnchor, parseFeishuMessage } from "@/lib/anchor"

const { ensure, error } = useDemoChain()
const { proxyBaseDisplay } = useFeishuConnection()
const pkg = shallowRef<EvidencePackage | null>(null)
const index = ref(1)
const text = ref("")
const node = computed(() => pkg.value?.nodes[index.value] ?? null)
const check = computed<Check | null>(() => {
  if (!node.value) return null
  if (!text.value.trim()) return { id: `anchor.${node.value.uuid}`, step: 4, title: "飞书消息对照", status: "skip", detail: "粘贴飞书群消息后开始比对" }
  const anchor = parseFeishuMessage(text.value)
  if (!anchor) return { id: `anchor.${node.value.uuid}`, step: 4, title: "飞书消息对照", status: "fail", detail: "这段文字不是节点摘要 JSON（需要 uuid / created_at / signature / signature_prev）" }
  return compareAnchor(node.value, anchor)
})

const lastNode = computed(() => pkg.value?.nodes[pkg.value.nodes.length - 1] ?? null)
const successorText = ref("")
const successorCheck = computed<Check | null>(() => {
  if (!lastNode.value?.next_node) return null
  if (!successorText.value.trim()) return { id: `anchor.next.${lastNode.value.uuid}`, step: 4, title: "后继节点飞书消息对照", status: "skip", detail: "粘贴后继节点的飞书消息后开始比对" }
  const anchor = parseFeishuMessage(successorText.value)
  if (!anchor) return { id: `anchor.next.${lastNode.value.uuid}`, step: 4, title: "后继节点飞书消息对照", status: "fail", detail: "这段文字不是节点摘要 JSON" }
  return compareSuccessorAnchor(lastNode.value, anchor)
})

function successorMessage(): string {
  const node = lastNode.value
  if (!node?.next_node) return ""
  return JSON.stringify({ uuid: node.next_node.uuid, created_at: node.next_node.created_at, signature: node.next_node.signature, signature_prev: node.signature }, null, 4)
}

function flipSuccessorPrev() {
  const match = /"signature_prev": "([0-9a-f]{128})"/.exec(successorText.value)
  if (!match) return
  const hash = match[1]
  successorText.value = successorText.value.replace(hash, `${hash.slice(0, 40)}${hash[40] === "0" ? "1" : "0"}${hash.slice(41)}`)
}

function messageFor(target: number): string {
  const current = pkg.value?.nodes[target]
  if (!current) return ""
  return JSON.stringify({ uuid: current.uuid, created_at: current.created_at, signature: current.signature, signature_prev: current.prev_signature }, null, 4)
}

onMounted(async () => {
  pkg.value = await ensure()
  text.value = messageFor(index.value)
  successorText.value = successorMessage()
})
watch(index, value => (text.value = messageFor(value)))

function flipDigit() {
  const match = /"signature": "([0-9a-f]{128})"/.exec(text.value)
  if (!match) return
  const hash = match[1]
  const flipped = `${hash.slice(0, 40)}${hash[40] === "0" ? "1" : "0"}${hash.slice(41)}`
  text.value = text.value.replace(hash, flipped)
}
</script>

<template>
  <StepLayout :step="4" title="链外锚点对照" lede="写链的同一事务内，业务系统将节点摘要发送至飞书群。群消息保存在飞书服务器，业务系统事后无法修改，可用于证明节点在该时刻已经存在。">
    <template #explain>
      <h2>锚点的内容</h2>
      <pre><code>{
    "uuid": "节点编号",
    "created_at": "上链时间（微秒）",
    "signature": "本节点哈希",
    "signature_prev": "前驱哈希（首节点为空字符串）"
}</code></pre>
      <p>
        四项与证据包节点逐一比对。飞书消息的发送时间与节点 <code>created_at</code> 相符且哈希一致，即可排除事后重算整条链的可能：重算后的哈希不可能与当时发出的消息相同。
      </p>
      <h2>飞书消息的获取</h2>
      <p>
        每个节点文件带有 <code>feishu_msg_id</code>。出具方运营人员可据此在存证群中定位该消息并提供截图或正文；飞书消息自带的发送时间应与节点上链时间相符。
      </p>
      <h2>以飞书凭证直接拉取</h2>
      <p>
        核验页支持填入飞书自建应用的 App ID / App Secret。工具按节点文件中的消息 id 逐条拉取正文并比对，并核对<strong>飞书服务器记录的发送时间</strong>与节点上链时间的差值是否在 5 分钟以内；该时间由飞书给出，具有独立于业务系统的时间证明力。
        该应用的机器人须已加入存证群并开通「获取单聊、群组消息」权限（<code>im:message:readonly</code>，群消息另需 <code>im:message.group_msg</code>）。
        飞书接口不支持浏览器跨域直连，请求经飞书转发代理原样转发（本站当前配置：<code>{{ proxyBaseDisplay }}</code>，核验页可改为自建代理）；代理不持有凭证、不记录内容。不经由任何代理的核验方可使用 Python 参考脚本直连。
      </p>
      <h2>后继关系的佐证</h2>
      <p>
        第一步对属于其他运单的后继节点仅记为「跳过」。后继节点写链时同样发送了飞书消息，其 <code>signature_prev</code> 即本节点哈希。
        节点文件的 <code>next_node.feishu_msg_id</code> 指向该消息；将其粘贴至核验页的「后继节点的飞书消息」，工具核对其确实指向本节点。由此得出的「链在当时已从本节点继续」的结论来源于飞书的记录，而非证据包自身。
      </p>
      <Callout tone="warn" title="证明范围">
        <p>锚点证明该哈希在该时刻已存在于业务系统之外，不证明节点内容本身的真实性；后者由第二、三步的原件核验与业务核验承担。京东侧另保存一份完整节点副本，本工具暂不比对。</p>
      </Callout>
      <h2>示例代码</h2>
      <CodeTabs :typescript="TS_USAGE[4]" :python="pythonStepSource(4)" />
    </template>
    <template #demo>
      <p v-if="error" class="status-fail">
        演示链生成失败：{{ error }}
      </p>
      <PaperCard v-else-if="node" title="演示 · 粘贴飞书消息比对" subtitle="预填内容为演示链对应节点应收到的飞书消息。演示链的消息 id 为虚构值，无法实际从飞书拉取。">
        <div class="picker no-print">
          <button v-for="(name, i) in ['提货', '接力', '送货']" :key="name" type="button" class="small" :class="{ 'btn--primary': i === index }" @click="index = i">
            节点 {{ i + 1 }} · {{ name }}
          </button>
        </div>
        <textarea v-model="text" rows="9" spellcheck="false" aria-label="飞书消息 JSON" />
        <div class="actions no-print">
          <button type="button" class="small" @click="flipDigit">
            改掉哈希中的一位
          </button>
          <button type="button" class="small" @click="text = messageFor(index)">
            恢复消息
          </button>
        </div>
        <CheckList v-if="check" :checks="[check]" />
      </PaperCard>
      <PaperCard v-if="lastNode?.next_node" title="演示 · 后继节点的飞书消息" :subtitle="`尾节点 ${lastNode.uuid} 的后继属于其他运单，飞书消息 id ${lastNode.next_node.feishu_msg_id ?? ''}。预填内容为该后继消息。`">
        <textarea v-model="successorText" rows="9" spellcheck="false" aria-label="后继节点飞书消息 JSON" />
        <div class="actions no-print">
          <button type="button" class="small" @click="flipSuccessorPrev">
            改掉 signature_prev 中的一位
          </button>
          <button type="button" class="small" @click="successorText = successorMessage()">
            恢复消息
          </button>
        </div>
        <CheckList v-if="successorCheck" :checks="[successorCheck]" />
      </PaperCard>
    </template>
  </StepLayout>
</template>

<style scoped>
.picker,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}

.actions {
  margin-top: 10px;
}
</style>
