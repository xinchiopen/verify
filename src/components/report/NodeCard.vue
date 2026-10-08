<script setup lang="ts">
import type { Check, PackageNode } from "@/lib/types"
import { computed } from "vue"
import { parseNodePayload, shortHash } from "@/lib/payload"
import CheckList from "./CheckList.vue"
import HashBlock from "./HashBlock.vue"

const props = defineProps<{ node: PackageNode, checks: Check[], index: number, inPackage?: Set<string> }>()

const SIGNED_TYPE: Record<number, string> = { 1: "提货单", 2: "送货签收单", 3: "接力单" }
const EVENT: Record<string, string> = { driver_sign: "司机签收", driver_relay: "司机接力", admin_backfill_sign: "后台补录（历史）" }

const payload = computed(() => parseNodePayload(props.node))
const hashCheck = computed(() => props.checks.find(check => check.id === `node.hash.${props.node.uuid}`))
const otherChecks = computed(() => props.checks.filter(check => check.id !== `node.hash.${props.node.uuid}`))
const driverName = computed(() => (payload.value?.order_driver_snapshot as { name?: string } | null | undefined)?.name ?? "")
const signerName = computed(() => (payload.value?.order_signer_snapshot as { name?: string } | null | undefined)?.name ?? "")
const imageCount = computed(() => payload.value?.images?.length ?? 0)
const gpsCount = computed(() => payload.value?.gps_locations?.length ?? 0)
const externalSuccessor = computed(() => props.node.next_node && props.inPackage && !props.inPackage.has(props.node.next_node.uuid) ? props.node.next_node : null)
</script>

<template>
  <article class="node-card" :class="{ 'node-card--voided': node.order.voided, 'node-card--fail': hashCheck?.status === 'fail' }">
    <header class="node-card__head">
      <div>
        <p class="node-card__kicker muted small">
          节点 {{ index + 1 }} · {{ EVENT[node.event_type ?? ""] ?? node.event_type ?? "未知事件" }}
          <span v-if="node.order.voided" class="node-card__voided">签收单已作废</span>
        </p>
        <h3 class="node-card__title">
          {{ SIGNED_TYPE[node.order.signed_type ?? 0] ?? "签收单" }}
          <span class="muted">· {{ node.order.time_signed ?? "未填签单时间" }}</span>
        </h3>
        <p class="small muted node-card__people">
          <span v-if="driverName">司机 {{ driverName }}</span>
          <span v-if="signerName"> 签单方 {{ signerName }}</span>
          <span v-if="node.order.gps_imei"> 签单令牌 {{ node.order.gps_imei }}</span>
        </p>
      </div>
      <span v-if="hashCheck" class="node-card__verdict" :class="`status-${hashCheck.status}`">{{ hashCheck.status === "pass" ? "哈希一致" : "哈希不一致" }}</span>
    </header>
    <dl class="node-card__inputs">
      <div>
        <dt>① 节点编号 uuid</dt>
        <dd><code>{{ node.uuid }}</code></dd>
      </div>
      <div>
        <dt>② 上链时间 created_at</dt>
        <dd><code>{{ node.created_at }}</code></dd>
      </div>
      <div>
        <dt>③ 前驱哈希 prev_signature</dt>
        <dd><code :title="node.prev_signature">{{ node.prev_signature ? shortHash(node.prev_signature) : "（全链首节点，空字符串）" }}</code></dd>
      </div>
      <div>
        <dt>④ 节点原文 data</dt>
        <dd>
          <code>{{ node.data.length.toLocaleString() }} 个字符</code>
          <span class="small muted"> 含 {{ imageCount }} 张图片摘要、{{ gpsCount }} 个轨迹点</span>
          <details class="node-card__raw">
            <summary class="small">
              查看原文
            </summary>
            <pre class="node-card__pre">{{ node.data }}</pre>
          </details>
        </dd>
      </div>
    </dl>
    <div class="node-card__hashes">
      <HashBlock label="记录的哈希" :value="node.signature" />
      <HashBlock v-if="hashCheck" label="重算的哈希" :value="hashCheck.actual" :tone="hashCheck.status === 'pass' ? 'pass' : 'fail'" />
    </div>
    <CheckList :checks="otherChecks" />
    <p v-if="node.feishu_msg_id" class="small faint node-card__feishu">
      飞书消息 id：<code>{{ node.feishu_msg_id }}</code>（第四步可用它找到群消息对照）
    </p>
    <p v-if="externalSuccessor" class="small faint node-card__feishu">
      后继节点 <code>{{ externalSuccessor.uuid }}</code> 属于其他运单，飞书消息 id：<code>{{ externalSuccessor.feishu_msg_id ?? "（导出时未记录）" }}</code>（第四步可粘贴该消息佐证后继关系）
    </p>
  </article>
</template>

<style scoped>
.node-card {
  background: var(--card);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--pass);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 18px 20px;
  margin-bottom: 18px;
}

.node-card--fail {
  border-left-color: var(--fail);
}

.node-card--voided {
  border-left-color: var(--skip);
  background: var(--card-deep);
}

.node-card__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.node-card__kicker {
  margin-bottom: 2px;
}

.node-card__voided {
  margin-left: 8px;
  padding: 1px 8px;
  border: 1px solid var(--skip);
  border-radius: 10px;
  font-size: 12px;
}

.node-card__title {
  margin: 0 0 4px;
  font-size: 19px;
}

.node-card__people {
  margin: 0;
}

.node-card__verdict {
  font-weight: 600;
  white-space: nowrap;
}

.node-card__inputs {
  display: grid;
  gap: 6px 20px;
  margin: 14px 0 10px;
  font-size: 14px;
}

.node-card__inputs > div {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 8px;
  align-items: baseline;
}

.node-card__inputs dt {
  color: var(--ink-soft);
}

.node-card__inputs dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.node-card__raw {
  margin-top: 4px;
}

.node-card__pre {
  max-height: 360px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
}

.node-card__hashes {
  margin: 10px 0 6px;
}

.node-card__feishu {
  margin: 8px 0 0;
}

@media (max-width: 640px) {
  .node-card__inputs > div {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .node-card__head {
    flex-direction: column;
  }
}
</style>
