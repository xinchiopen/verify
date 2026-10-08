<script setup lang="ts">
import type { Check, EvidencePackage, NodePayload } from "@/lib/types"
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue"
import { pythonStepSource, TS_USAGE } from "@/app/codeSamples"
import Callout from "@/components/common/Callout.vue"
import CodeTabs from "@/components/common/CodeTabs.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import StepLayout from "@/components/layout/StepLayout.vue"
import CheckList from "@/components/report/CheckList.vue"
import AmapTrack from "@/components/track/AmapTrack.vue"
import { collectTrackLegs } from "@/components/track/legs"
import LegTimeline from "@/components/track/LegTimeline.vue"
import TrackSketch from "@/components/track/TrackSketch.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { verifyConsistency } from "@/lib/consistency"

const { ensure, clonePackage, error } = useDemoChain()
const pkg = shallowRef<EvidencePackage | null>(null)
const checks = ref<Check[]>([])
const applied = ref<string[]>([])
const legs = computed(() => pkg.value ? collectTrackLegs(pkg.value) : [])

function rerun() {
  if (!pkg.value) return
  triggerRef(pkg)
  checks.value = verifyConsistency(pkg.value)
}

onMounted(async () => {
  pkg.value = clonePackage(await ensure())
  rerun()
})

function editPayload(index: number, edit: (payload: NodePayload) => void) {
  if (!pkg.value) return
  const node = pkg.value.nodes[index]
  const payload = JSON.parse(node.data) as NodePayload
  edit(payload)
  node.data = JSON.stringify(payload)
}

const EXPERIMENTS = [
  { key: "gps", label: "把第一段的一个轨迹点挪到提货前一天", run: () => editPayload(2, (payload) => {
    const point = payload.gps_locations?.[0]
    if (point) point.gps_time = "2020-01-01 00:00:00"
  }) },
  { key: "phase", label: "把接力节点的 image_phase 改成 5（送货照）", run: () => editPayload(1, payload => void (payload.image_phase = 5)) },
  { key: "time", label: "把送货签单时间改到接力之前", run: () => {
    if (pkg.value) pkg.value.nodes[2].order.time_signed = "2000-01-01 08:00:00"
  } },
  { key: "imei", label: "把第二段的令牌换成别的设备", run: () => {
    if (pkg.value) pkg.value.manifest.legs[1].imei = "IMEI-OTHER-9999"
  } }
]

function apply(experiment: typeof EXPERIMENTS[number]) {
  experiment.run()
  applied.value = [...applied.value, experiment.key]
  rerun()
}

async function restore() {
  pkg.value = clonePackage(await ensure())
  applied.value = []
  rerun()
}
</script>

<template>
  <StepLayout :step="3" title="核对业务一致性" lede="哈希与摘要证明记录未被改动，不证明记录在业务上自洽。第三步跨节点核对一张运单的签收顺序、节点归属、轨迹时间窗与运输段令牌。">
    <template #explain>
      <h2>核验规则</h2>
      <table class="small">
        <thead>
          <tr><th>规则</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr><td>事件类型 / 单据类型 / 照片场景</td><td>三者必须是合法组合：提货 <code>driver_sign</code>/1/4，送货 <code>driver_sign</code>/2/5，接力 <code>driver_relay</code>/3/6。</td></tr>
          <tr><td>节点归属</td><td>节点原文里的签收单 id、运单 id、申请单号都指向本证据包的运单。</td></tr>
          <tr><td>签收事件序列</td><td>有效签收单按「提货 → 接力… → 送货」发生，签单时间递增，上链时间不早于签单时间。</td></tr>
          <tr><td>回执归属</td><td>电子回执摘要只出现在送货签收节点。</td></tr>
          <tr><td>手写签名规则</td><td>小程序码签收的提货 / 送货应带收发货人手写签名；京东通行码签收与接力不带。</td></tr>
          <tr><td>轨迹时间窗</td><td>每个运输段司机的 GPS 点都落在该段起止时间内（容差 60 秒）。</td></tr>
          <tr><td>运输段令牌</td><td>段的令牌 IMEI 等于段起点签收单记录的签单令牌。</td></tr>
          <tr><td>图片清单对应</td><td>节点原文声明的图片与证据包内该节点的图片一一对应。</td></tr>
        </tbody>
      </table>
      <Callout tone="warn" title="作废单的处理">
        <p>管理员可将已完成的签收单标记为作废。作废是链外的业务标记，链节点本身不变。核验工具仍对作废节点执行哈希与文件核验，但不将其计入事件序列与运输段，并单独列示。</p>
      </Callout>
      <p class="small muted">
        历史节点可能缺少后续新增的字段，相应规则记为「跳过」，不判定为失败。
      </p>
      <h2>示例代码</h2>
      <CodeTabs :typescript="TS_USAGE[3]" :python="pythonStepSource(3)" />
    </template>
    <template #demo>
      <p v-if="error" class="status-fail">
        演示链生成失败：{{ error }}
      </p>
      <template v-else-if="pkg">
        <PaperCard title="运输段与轨迹" subtitle="第一段：司机甲（提货 → 接力）；第二段：司机乙（接力 → 送货）。">
          <LegTimeline :legs="legs" />
          <TrackSketch :legs="legs" />
          <AmapTrack :legs="legs" />
        </PaperCard>
        <PaperCard title="篡改实验" subtitle="以下改动仅修改业务字段，用于观察第三步的检测能力；真实场景中这些改动同时会使第一步的哈希不一致。" class="no-print">
          <div class="experiments">
            <button v-for="experiment in EXPERIMENTS" :key="experiment.key" type="button" class="small" :disabled="applied.includes(experiment.key)" @click="apply(experiment)">
              {{ experiment.label }}
            </button>
            <button v-if="applied.length" type="button" class="btn small" @click="restore">
              全部恢复
            </button>
          </div>
        </PaperCard>
        <PaperCard title="一致性检查结果">
          <CheckList :checks="checks" show-subject />
        </PaperCard>
      </template>
    </template>
  </StepLayout>
</template>

<style scoped>
.experiments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
