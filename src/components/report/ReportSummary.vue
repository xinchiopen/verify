<script setup lang="ts">
import type { VerificationReport } from "@/lib/types"
import { downloadBytes } from "@/app/download"
import { reportToJson } from "@/lib/report"
import SealMark from "./SealMark.vue"

const props = defineProps<{ report: VerificationReport, demo?: boolean }>()

const VERDICT: Record<VerificationReport["overall"], string> = {
  pass: "全部可核验项一致，没有发现改动痕迹。",
  warn: "可核验项一致，但有需要人工判断的提示项。",
  fail: "存在不一致：至少一项证据与链上记录不符，详见下方失败项。"
}

function print() {
  window.print()
}

function download() {
  downloadBytes(reportToJson(props.report), `核验报告_${props.report.package.sn ?? "evidence"}.json`, "application/json")
}
</script>

<template>
  <section class="summary">
    <SealMark :status="report.overall" />
    <div class="summary__body">
      <p class="summary__kicker muted small">
        核验结论 · {{ report.generated_at }}
      </p>
      <h2 class="summary__title">
        {{ VERDICT[report.overall] }}
      </h2>
      <dl class="summary__facts small">
        <div><dt>申请单号</dt><dd>{{ report.package.sn ?? "—" }}</dd></div>
        <div><dt>证据包导出时间</dt><dd>{{ report.package.exported_at }}</dd></div>
        <div><dt>链节点</dt><dd>{{ report.package.node_count }} 个<span v-if="report.package.voided_node_count">（含作废 {{ report.package.voided_node_count }} 个）</span></dd></div>
        <div><dt>证据原件</dt><dd>{{ report.package.file_count }} 份</dd></div>
        <div><dt>检查项</dt><dd><span class="status-pass">通过 {{ report.summary.pass }}</span> · <span class="status-fail">失败 {{ report.summary.fail }}</span> · <span class="status-warn">提示 {{ report.summary.warn }}</span> · <span class="status-skip">跳过 {{ report.summary.skip }}</span></dd></div>
        <div><dt>核验工具</dt><dd>{{ report.verifier.name }} {{ report.verifier.version }}<span v-if="demo">（演示数据）</span></dd></div>
      </dl>
      <div class="summary__actions no-print">
        <button type="button" class="btn btn--primary" @click="download">
          下载 JSON 报告
        </button>
        <button type="button" class="btn" @click="print">
          打印或另存为 PDF
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 24px;
  align-items: start;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 26px 28px;
  margin-bottom: 28px;
}

.summary__kicker {
  margin-bottom: 2px;
}

.summary__title {
  margin: 0 0 12px;
  font-size: 24px;
  max-width: 40ch;
}

.summary__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px 18px;
  margin: 0 0 14px;
}

.summary__facts div {
  display: flex;
  gap: 8px;
}

.summary__facts dt {
  color: var(--ink-soft);
  white-space: nowrap;
}

.summary__facts dd {
  margin: 0;
}

.summary__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .summary {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .summary__facts div {
    justify-content: center;
  }
}
</style>
