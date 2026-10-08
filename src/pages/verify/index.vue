<script setup lang="ts">
import type { Check, ManifestFile } from "@/lib/types"
import { computed, ref } from "vue"
import { RouterLink } from "vue-router"
import { formatBytes } from "@/app/download"
import Callout from "@/components/common/Callout.vue"
import FileDrop from "@/components/common/FileDrop.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import CheckList from "@/components/report/CheckList.vue"
import FeishuConnect from "@/components/report/FeishuConnect.vue"
import ImageEvidenceCard from "@/components/report/ImageEvidenceCard.vue"
import NodeCard from "@/components/report/NodeCard.vue"
import PdfPreview from "@/components/report/PdfPreview.vue"
import ReportSummary from "@/components/report/ReportSummary.vue"
import VoidedSection from "@/components/report/VoidedSection.vue"
import AmapTrack from "@/components/track/AmapTrack.vue"
import { collectTrackLegs } from "@/components/track/legs"
import LegTimeline from "@/components/track/LegTimeline.vue"
import TrackSketch from "@/components/track/TrackSketch.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { useFeishuConnection } from "@/composables/useFeishuConnection"
import { useVerification } from "@/composables/useVerification"
import { parseNodePayload } from "@/lib/payload"
import { nodesWithExternalSuccessor } from "@/lib/verify"

const ANCHOR_PLACEHOLDER = "{ \"uuid\": \"...\", \"created_at\": \"...\", \"signature\": \"...\", \"signature_prev\": \"...\" }"

const { pkg, report, state, stageText, feishuMessages, successorFeishuMessages, fetchErrors, fetched, fetching, metaKey, fetchAnchor, fetchAllAnchors, checksByStep, run, rerunAnchors, reset } = useVerification()
const { isConnected } = useFeishuConnection()
const fetchingAll = ref(false)
const { ensure } = useDemoChain()

const legs = computed(() => pkg.value ? collectTrackLegs(pkg.value) : [])
const externalSuccessors = computed(() => pkg.value ? nodesWithExternalSuccessor(pkg.value) : [])
const nodeUuids = computed(() => new Set(pkg.value?.nodes.map(node => node.uuid) ?? []))
const anchorTargetCount = computed(() => (pkg.value?.nodes.filter(node => node.feishu_msg_id).length ?? 0) + externalSuccessors.value.filter(node => node.next_node?.feishu_msg_id).length)

function sentText(key: string): string {
  const message = fetched[key]
  if (!message) return ""
  const sent = new Date(message.createTimeMs)
  return `飞书发送时间 ${sent.toLocaleString("zh-CN", { hour12: false })}${message.chatId ? ` · 群 ${message.chatId}` : ""}`
}

async function onFetchAll() {
  fetchingAll.value = true
  try {
    await fetchAllAnchors()
  } finally {
    fetchingAll.value = false
  }
}
const voidedNodes = computed(() => pkg.value?.nodes.filter(node => node.order.voided) ?? [])
const images = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "image") ?? [])
const signatures = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "signature") ?? [])
const receipts = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "receipt") ?? [])
const source = computed<[number, number] | null>(() => {
  const payload = pkg.value?.nodes[0] ? parseNodePayload(pkg.value.nodes[0]) : null
  const inst = payload?.instruction as { source_latitude?: number, source_longitude?: number, target_latitude?: number, target_longitude?: number } | undefined
  return inst?.source_latitude && inst.source_longitude ? [inst.source_latitude, inst.source_longitude] : null
})
const target = computed<[number, number] | null>(() => {
  const payload = pkg.value?.nodes[0] ? parseNodePayload(pkg.value.nodes[0]) : null
  const inst = payload?.instruction as { target_latitude?: number, target_longitude?: number } | undefined
  return inst?.target_latitude && inst.target_longitude ? [inst.target_latitude, inst.target_longitude] : null
})

function nodeChecks(uuid: string): Check[] {
  return checksByStep.value[1].filter(check => check.subject?.nodeUuid === uuid)
}
function fileChecks(file: ManifestFile): Check[] {
  return checksByStep.value[2].filter(check => check.subject?.filePath === file.path)
}
function chainImage(file: ManifestFile) {
  const node = pkg.value?.nodes.find(item => item.uuid === file.node_uuid)
  return node ? parseNodePayload(node)?.images?.find(image => image.uuid === file.uuid) : undefined
}
function signatureSrc(file: ManifestFile): string {
  const bytes = pkg.value?.files.get(file.path)
  if (!bytes) return ""
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/png;base64,${btoa(binary)}`
}

async function onFile(file: File) {
  await run(file, { fileName: `${file.name}（${formatBytes(file.size)}）` })
}
async function loadDemo() {
  state.busy = true
  state.error = ""
  try {
    const demo = await ensure()
    await run(demo, { fileName: "演示证据包（浏览器现场生成）", demo: true })
  } catch (exc) {
    state.error = `演示证据包生成失败：${exc instanceof Error ? exc.message : String(exc)}`
    state.busy = false
  }
}
</script>

<template>
  <div class="container verify">
    <header class="verify__head">
      <h1>核验证据包</h1>
      <p class="verify__lede">
        请提供由后台导出的 <code>证据包_申请单号.zip</code>。四步核验在浏览器本地完成，结果可下载为 JSON 或打印存档。
      </p>
    </header>

    <template v-if="!report">
      <FileDrop :busy="state.busy" @file="onFile" />
      <p class="verify__alt small muted no-print">
        尚无证据包时，可<button type="button" class="btn--quiet small" :disabled="state.busy" @click="loadDemo">
          加载演示证据包
        </button>，或查看<RouterLink to="/steps/1">
          分步演示
        </RouterLink>。
      </p>
      <p v-if="state.busy" class="small muted" role="status">
        正在{{ stageText }}…
      </p>
      <Callout v-if="state.error" tone="fail" title="无法核验这个文件">
        <p>{{ state.error }}</p>
      </Callout>
    </template>

    <template v-else-if="pkg && report">
      <p class="small muted verify__file no-print">
        {{ state.fileName }}
        <button type="button" class="btn--quiet small" @click="reset">
          换一个文件
        </button>
      </p>
      <ReportSummary :report="report" :demo="state.demo" />

      <section class="verify__section">
        <h2>运单</h2>
        <dl class="facts small">
          <div><dt>申请单号</dt><dd>{{ pkg.manifest.instruction.sn }}</dd></div>
          <div><dt>运输单号</dt><dd>{{ pkg.manifest.instruction.shipping_sn ?? "—" }}</dd></div>
          <div><dt>发货日期</dt><dd>{{ pkg.manifest.instruction.date_ship ?? "—" }}</dd></div>
          <div><dt>发货地</dt><dd>{{ pkg.manifest.instruction.source_city }} {{ pkg.manifest.instruction.source_address }}</dd></div>
          <div><dt>收货地</dt><dd>{{ pkg.manifest.instruction.target_city }} {{ pkg.manifest.instruction.target_address }}</dd></div>
          <div><dt>提货 / 妥投</dt><dd>{{ pkg.manifest.instruction.time_picked_up ?? "—" }} / {{ pkg.manifest.instruction.time_delivered ?? "—" }}</dd></div>
          <div><dt>导出环境</dt><dd>{{ pkg.manifest.package.environment ?? "—" }} · {{ pkg.manifest.package.exporter }} {{ pkg.manifest.package.exporter_version }}</dd></div>
        </dl>
        <Callout v-if="pkg.manifest.notes.length" tone="warn" title="导出时的提示">
          <ul>
            <li v-for="note in pkg.manifest.notes" :key="note">
              {{ note }}
            </li>
          </ul>
        </Callout>
      </section>

      <section class="verify__section">
        <h2>第一步 · 节点哈希与链接</h2>
        <NodeCard v-for="(node, index) in pkg.nodes" :key="node.uuid" :node="node" :checks="nodeChecks(node.uuid)" :index="index" :in-package="nodeUuids" />
        <CheckList :checks="checksByStep[1].filter(check => !check.subject?.nodeUuid)" />
      </section>

      <section class="verify__section">
        <h2>第二步 · 证据原件</h2>
        <h3>签单图片（{{ images.length }}）</h3>
        <ImageEvidenceCard v-for="file in images" :key="file.uuid" :file="file" :bytes="pkg.files.get(file.path)" :chain-image="chainImage(file)" :checks="fileChecks(file)" />
        <h3>手写签名（{{ signatures.length }}）</h3>
        <p v-if="!signatures.length" class="small muted">
          本运单没有手写签名（京东通行码签收不涉及签名）。
        </p>
        <PaperCard v-for="file in signatures" :key="file.uuid">
          <div class="sig">
            <img v-if="signatureSrc(file)" :src="signatureSrc(file)" :alt="`手写签名 ${file.uuid}`" class="sig__img">
            <div>
              <p class="mono small">
                {{ file.uuid }}.png
              </p>
              <CheckList :checks="fileChecks(file)" />
            </div>
          </div>
        </PaperCard>
        <h3>电子回执（{{ receipts.length }}）</h3>
        <p v-if="!receipts.length" class="small muted">
          本运单没有已签回执（尚未送货签收，或回执尚未生成）。
        </p>
        <PdfPreview v-for="file in receipts" :key="file.uuid" :file="file" :bytes="pkg.files.get(file.path)" :sn="pkg.manifest.instruction.sn ?? ''" :checks="fileChecks(file)" />
      </section>

      <section class="verify__section">
        <h2>第三步 · 业务一致性</h2>
        <PaperCard title="运输段与轨迹">
          <LegTimeline :legs="legs" />
          <TrackSketch :legs="legs" :source="source" :target="target" />
          <AmapTrack :legs="legs" :source="source" :target="target" />
        </PaperCard>
        <CheckList :checks="checksByStep[3]" show-subject collapse-pass />
      </section>

      <section class="verify__section">
        <h2>第四步 · 链外锚点</h2>
        <p class="small muted">
          将每个节点对应的飞书群消息正文粘贴至下方（节点文件中的 <code>feishu_msg_id</code> 用于定位消息），或以飞书凭证直接拉取，然后重新比对。
        </p>
        <FeishuConnect :target-count="anchorTargetCount" :busy="fetchingAll" @fetch-all="onFetchAll" />
        <div v-for="node in pkg.nodes" :key="node.uuid" class="anchor-row">
          <label class="small">
            <span class="mono">{{ node.uuid }}</span>
            <span class="faint"> · {{ node.created_at }} · 飞书消息 id {{ node.feishu_msg_id ?? "—" }}</span>
            <textarea v-model="feishuMessages[node.uuid]" rows="4" spellcheck="false" :placeholder="ANCHOR_PLACEHOLDER" />
          </label>
          <div class="anchor-row__tools small no-print">
            <button type="button" class="small" :disabled="!isConnected || !node.feishu_msg_id || fetching[metaKey('self', node.uuid)]" :title="node.feishu_msg_id ? '' : '导出时未记录该消息的飞书 id'" @click="fetchAnchor('self', node.uuid)">
              {{ fetching[metaKey("self", node.uuid)] ? "拉取中…" : "从飞书拉取" }}
            </button>
            <span v-if="fetchErrors[metaKey('self', node.uuid)]" class="status-fail">{{ fetchErrors[metaKey("self", node.uuid)] }}</span>
            <span v-else-if="sentText(metaKey('self', node.uuid))" class="muted">{{ sentText(metaKey("self", node.uuid)) }}</span>
          </div>
        </div>
        <template v-if="externalSuccessors.length">
          <h3>后继节点的飞书消息（可选）</h3>
          <p class="small muted">
            以下节点的后继属于其他运单，证据包仅提供线索。将<strong>后继节点</strong>的飞书群消息粘贴于此：其 <code>signature_prev</code> 应等于本节点哈希，以此作为「链自本节点继续」的第三方佐证。
          </p>
          <div v-for="node in externalSuccessors" :key="`next-${node.uuid}`" class="anchor-row">
            <label class="small">
              <span>本节点 <span class="mono">{{ node.uuid }}</span> 的后继：<span class="mono">{{ node.next_node!.uuid }}</span></span>
              <span class="faint"> · {{ node.next_node!.created_at }} · 飞书消息 id {{ node.next_node!.feishu_msg_id ?? "（导出时未记录）" }}</span>
              <textarea v-model="successorFeishuMessages[node.uuid]" rows="4" spellcheck="false" :placeholder="ANCHOR_PLACEHOLDER" />
            </label>
            <div class="anchor-row__tools small no-print">
              <button type="button" class="small" :disabled="!isConnected || !node.next_node!.feishu_msg_id || fetching[metaKey('next', node.uuid)]" :title="node.next_node!.feishu_msg_id ? '' : '导出时未记录后继消息的飞书 id'" @click="fetchAnchor('next', node.uuid)">
                {{ fetching[metaKey("next", node.uuid)] ? "拉取中…" : "从飞书拉取后继消息" }}
              </button>
              <span v-if="fetchErrors[metaKey('next', node.uuid)]" class="status-fail">{{ fetchErrors[metaKey("next", node.uuid)] }}</span>
              <span v-else-if="sentText(metaKey('next', node.uuid))" class="muted">{{ sentText(metaKey("next", node.uuid)) }}</span>
            </div>
          </div>
        </template>
        <button type="button" class="btn no-print" @click="rerunAnchors">
          重新比对链外锚点
        </button>
        <CheckList :checks="checksByStep[4]" show-subject />
      </section>

      <section v-if="voidedNodes.length || pkg.manifest.orders.some(order => order.voided)" class="verify__section">
        <h2>已作废的签收单</h2>
        <VoidedSection :nodes="voidedNodes" :orders="pkg.manifest.orders" />
      </section>

      <section class="verify__section">
        <h2>未上链的签收记录</h2>
        <p v-if="!pkg.manifest.orders.some(order => order.note)" class="small muted">
          本运单的全部签收单都有链节点。
        </p>
        <table v-else class="small">
          <thead>
            <tr><th>签收单</th><th>类型</th><th>签单时间</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr v-for="order in pkg.manifest.orders.filter(item => item.note)" :key="order.id">
              <td>#{{ order.id }}</td>
              <td>{{ ({ 1: "提货单", 2: "送货签收单", 3: "接力单" } as Record<number, string>)[order.signed_type ?? 0] ?? "—" }}</td>
              <td>{{ order.time_signed ?? "—" }}</td>
              <td>{{ order.note === "backfill" ? "后台补录的运营记录，不上链、无原件，不属于存证范围" : "标记为已上链但库内未关联到节点，导出时未包含" }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.verify__head {
  margin-bottom: 24px;
}

.verify__lede {
  font-size: 18px;
  color: var(--ink-soft);
}

.verify__alt {
  margin-top: 12px;
}

.verify__file {
  margin-bottom: 10px;
}

.verify__section {
  margin-top: 40px;
}

.verify__section h2 {
  margin-top: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule);
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 6px 20px;
  max-width: none;
}

.facts div {
  display: flex;
  gap: 10px;
}

.facts dt {
  color: var(--ink-soft);
  white-space: nowrap;
  min-width: 84px;
}

.facts dd {
  margin: 0;
}

.sig {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  align-items: start;
}

.sig__img {
  width: 100%;
  border: 1px solid var(--rule);
  background: #fff;
}

.anchor-row {
  margin-bottom: 12px;
}

.anchor-row label span {
  display: inline-block;
  margin-bottom: 4px;
}

.anchor-row__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-top: 6px;
}

@media (max-width: 640px) {
  .sig {
    grid-template-columns: 1fr;
  }
}
</style>
