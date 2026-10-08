<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { downloadBytes } from "@/app/download"
import Callout from "@/components/common/Callout.vue"
import ChainDiagram from "@/components/diagram/ChainDiagram.vue"
import PackageDiagram from "@/components/diagram/PackageDiagram.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { useFeishuConnection } from "@/composables/useFeishuConnection"
import { buildDemoZip, DEMO_SN } from "@/lib/demo"
import { sha512HexOfText } from "@/lib/hash"
import { STEP_TITLES } from "@/router"

const SAMPLE = {
  uuid: "3f6a1c2e-9d0b-4a7f-8e21-5c4b7d9a0f13",
  created_at: "2026-04-14 09:00:03.412587",
  prev: "9c1e…（前一个节点的 128 位十六进制哈希）",
  prevReal: "9c1e7f0a4b3d2c1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1"
}
const originalData = "{\"event_type\": \"driver_sign\", \"image_phase\": 4, \"images\": [{\"sha512\": \"51ea…\", \"uuid\": \"aa18…\"}], \"instruction\": {\"amount\": 2, \"sn\": \"SR-DEMO-0001\"}, \"order\": {\"signed_type\": 1, \"time_signed\": \"2026-04-14 09:00:00\"}}"
const tampered = ref(false)
const data = computed(() => tampered.value ? originalData.replace("\"amount\": 2", "\"amount\": 3") : originalData)
const originalHash = ref("")
const liveHash = ref("")

async function recompute() {
  liveHash.value = await sha512HexOfText(`${SAMPLE.uuid}${SAMPLE.created_at}${SAMPLE.prevReal}${data.value}`)
}
onMounted(async () => {
  await recompute()
  originalHash.value = liveHash.value
})
async function toggle() {
  tampered.value = !tampered.value
  await recompute()
}

const { ensure } = useDemoChain()
const { proxyBaseDisplay } = useFeishuConnection()
const downloading = ref(false)
async function downloadDemo() {
  downloading.value = true
  try {
    downloadBytes(buildDemoZip(await ensure()), `证据包_${DEMO_SN}.zip`, "application/zip")
  } finally {
    downloading.value = false
  }
}

const STEP_SUMMARY = [
  "按原文拼接节点的四段输入重算 SHA-512，并核对前驱与后继节点的链接关系。",
  "逐份计算签单图片、手写签名、电子回执的摘要，与库内记录、链上记录三方比对；解析图片 EXIF 记录交叉验证。",
  "跨节点核对业务一致性：事件类型、签收顺序、回执归属、轨迹时间窗、运输段令牌。",
  "将写链时同步发送至飞书群的节点摘要与证据包比对，确认节点在当时已对外留痕；后继属于其他运单时，以后继节点的消息佐证链接关系。"
]
</script>

<template>
  <div class="container home">
    <section class="hero">
      <div class="hero__text">
        <p class="hero__kicker muted">
          签收存证链 · 独立核验
        </p>
        <h1>签收存证的独立核验</h1>
        <p class="hero__lede">
          司机每次提货、接力与送货签收时，业务系统将现场照片、手写签名、电子回执的摘要与该时刻的业务快照写入一个链节点，并以 SHA-512 与前一节点链接。
          本站说明存证链的构成与核验方法，并提供在浏览器本地对证据包进行完整核验的工具。
        </p>
        <div class="hero__actions">
          <RouterLink to="/steps/1" class="btn btn--primary">
            查看分步核验方法
          </RouterLink>
          <RouterLink to="/verify" class="btn">
            核验证据包
          </RouterLink>
        </div>
      </div>
      <PaperCard class="hero__lab" title="节点哈希的计算方式" subtitle="四段输入按顺序直接拼接，不加分隔符，取 SHA-512。可修改原文中的一个数字观察哈希变化。">
        <div class="concat" aria-label="哈希输入的四段">
          <span class="concat__seg concat__seg--uuid" title="① uuid">{{ SAMPLE.uuid }}</span><span class="concat__seg concat__seg--time" title="② created_at">{{ SAMPLE.created_at }}</span><span class="concat__seg concat__seg--prev" title="③ prev_signature">{{ SAMPLE.prev }}</span><span class="concat__seg concat__seg--data" :class="{ 'is-tampered': tampered }" title="④ data">{{ data }}</span>
        </div>
        <p class="concat__legend small">
          <span class="concat__dot concat__dot--uuid" /> ① 节点编号
          <span class="concat__dot concat__dot--time" /> ② 上链时间
          <span class="concat__dot concat__dot--prev" /> ③ 前驱哈希
          <span class="concat__dot concat__dot--data" /> ④ 节点原文
        </p>
        <p class="concat__arrow muted small">
          ↓ SHA-512
        </p>
        <code class="concat__hash" :class="{ 'is-tampered': tampered }">{{ liveHash || "计算中…" }}</code>
        <p v-if="tampered" class="small status-fail">
          将「amount: 2」改为「3」后，128 位哈希整体改变；原哈希为 <code class="mono">{{ originalHash.slice(0, 24) }}…</code>
        </p>
        <button type="button" class="btn small" @click="toggle">
          {{ tampered ? "恢复原文" : "将原文中的 amount 改为 3" }}
        </button>
      </PaperCard>
    </section>

    <section class="prose">
      <h2>存证链的定义与边界</h2>
      <p>
        存证链是业务系统内唯一的全局哈希链。每一次司机现场签收或接力生成一个链节点，节点记录该时刻的运单快照、签收单快照、图片与签名摘要以及 GPS 轨迹点，并将前一节点的哈希作为自身哈希的输入之一。
        其设计目标是<strong>事后篡改可被检测</strong>：改动任一节点的任一字符，该节点的哈希即与记录不符；若连同哈希一并改写，其后所有节点的哈希均与记录不符。
      </p>
      <Callout tone="warn" title="适用边界">
        <p>存证链由业务系统的服务器记录，不属于公有链或联盟链，不包含国家授时中心的可信时间戳，也不包含基于证书私钥的数字签名。因此其提供的是篡改可检测性，可作为核验与举证的技术基础；「不可篡改」的结论不能仅由系统自身得出。链外锚点（第四步）将节点摘要同步交由第三方留存，是对此的补强。</p>
      </Callout>
      <ChainDiagram />

      <h2>证据包的构成</h2>
      <p>
        独立核验以后台按运单导出的<strong>证据包</strong>为输入。证据包为一个 zip 文件，包含该运单全部链节点的原文、各节点引用的证据原件，以及一份清单。
        节点原文按数据库存储的字节原样导出；证据原件即签收时落盘的文件；清单记录后台库内对每份文件的摘要，用于与链上记录进行三方比对。
      </p>
      <PackageDiagram />
      <p class="small muted">
        证据包格式的完整定义见《证据包格式说明》（format_version 1，本仓库 <code>docs/evidence_package_format.md</code>）。
      </p>

      <h2>核验流程</h2>
    </section>
    <ol class="steps">
      <li v-for="(name, index) in STEP_TITLES" :key="name" class="steps__item">
        <RouterLink :to="`/steps/${index + 1}`" class="steps__link">
          <span class="steps__num">{{ index + 1 }}</span>
          <span class="steps__name">{{ name }}</span>
          <span class="steps__summary small muted">{{ STEP_SUMMARY[index] }}</span>
        </RouterLink>
      </li>
    </ol>

    <section class="prose">
      <h2>数据处理说明</h2>
      <p>
        解压、摘要计算与比对均在浏览器本地完成，证据包不会发送至任何服务器，断网状态下亦可核验。
        仅以下两项操作由用户主动触发并产生外部请求：第三步的「在高德地图上查看」向高德请求底图，轨迹坐标随之发送至地图服务商；第四步的「以飞书凭证拉取」将凭证与消息请求经飞书转发代理（当前：<code>{{ proxyBaseDisplay }}</code>）原样转发至飞书（飞书接口不支持浏览器跨域直连），代理不持有凭证、不记录内容，核验页可改为自建代理。
      </p>
      <p>
        页面所用算法与可独立获取的核验库、Python 参考脚本一致；核验结论以算法为准。
      </p>

      <h2>演示数据</h2>
      <p>
        分步演示使用浏览器现场生成的演示链（提货 → 接力 → 送货），不对应任何真实运单。演示链可打包下载，并在「核验证据包」页按与真实证据包相同的流程核验。
      </p>
      <button type="button" class="btn" :disabled="downloading" @click="downloadDemo">
        {{ downloading ? "正在生成…" : "下载演示证据包" }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 48px;
  align-items: start;
  margin-bottom: 20px;
}

.hero__kicker {
  margin-bottom: 6px;
}

.hero__lede {
  font-size: 18px;
  color: var(--ink-soft);
}

.hero__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.hero__lab {
  margin-top: 8px;
}

.concat {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  word-break: break-all;
  border: 1px solid var(--rule);
  padding: 10px 12px;
  background: #fff;
  border-radius: var(--radius);
}

.concat__seg {
  padding: 1px 0;
}

.concat__seg--uuid,
.concat__dot--uuid {
  background: #e4ebf3;
}

.concat__seg--time,
.concat__dot--time {
  background: #f5ecdc;
}

.concat__seg--prev,
.concat__dot--prev {
  background: #ebe9e4;
}

.concat__seg--data,
.concat__dot--data {
  background: #e3efe8;
}

.concat__seg--data.is-tampered {
  background: #f6e3e1;
}

.concat__legend {
  margin: 8px 0 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
}

.concat__dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1px solid var(--rule-strong);
  margin-right: 4px;
  vertical-align: -1px;
}

.concat__arrow {
  margin: 4px 0;
}

.concat__hash {
  display: block;
  font-size: 12.5px;
  overflow-wrap: anywhere;
  word-break: break-all;
  background: var(--pass-soft);
  color: var(--pass);
  padding: 8px 10px;
  border-radius: var(--radius);
  margin-bottom: 10px;
  line-height: 1.5;
}

.concat__hash.is-tampered {
  background: var(--fail-soft);
  color: var(--fail);
}

.steps {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  max-width: none;
}

.steps__link {
  display: grid;
  gap: 6px;
  padding: 18px 18px 16px;
  height: 100%;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  color: var(--ink);
  text-decoration: none;
  box-shadow: var(--shadow-card);
}

.steps__link:hover {
  border-color: var(--accent);
}

.steps__num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--ink);
  display: inline-grid;
  place-items: center;
  font-size: 14px;
}

.steps__name {
  font-size: 18px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
