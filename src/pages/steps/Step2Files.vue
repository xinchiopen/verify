<script setup lang="ts">
import type { Check, EvidencePackage, ManifestFile } from "@/lib/types"
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue"
import { pythonStepSource, TS_USAGE } from "@/app/codeSamples"
import Callout from "@/components/common/Callout.vue"
import CodeTabs from "@/components/common/CodeTabs.vue"
import PaperCard from "@/components/layout/PaperCard.vue"
import StepLayout from "@/components/layout/StepLayout.vue"
import CheckList from "@/components/report/CheckList.vue"
import ImageEvidenceCard from "@/components/report/ImageEvidenceCard.vue"
import PdfPreview from "@/components/report/PdfPreview.vue"
import { useDemoChain } from "@/composables/useDemoChain"
import { parseNodePayload } from "@/lib/payload"
import { verifyFiles } from "@/lib/verify"

const { ensure, clonePackage, error } = useDemoChain()
const pkg = shallowRef<EvidencePackage | null>(null)
const checks = ref<Check[]>([])
const busy = ref(false)
const replaced = ref<string | null>(null)

const images = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "image") ?? [])
const signatures = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "signature") ?? [])
const receipts = computed(() => pkg.value?.manifest.files.filter(file => file.kind === "receipt") ?? [])

function checksFor(file: ManifestFile): Check[] {
  return checks.value.filter(check => check.subject?.filePath === file.path)
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

async function rerun() {
  if (!pkg.value) return
  busy.value = true
  checks.value = await verifyFiles(pkg.value)
  busy.value = false
}

onMounted(async () => {
  pkg.value = clonePackage(await ensure())
  await rerun()
})

async function replace(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !pkg.value) return
  const target = images.value[0]
  pkg.value.files.set(target.path, new Uint8Array(await file.arrayBuffer()))
  triggerRef(pkg)
  replaced.value = target.path
  input.value = ""
  await rerun()
}

async function restore() {
  pkg.value = clonePackage(await ensure())
  replaced.value = null
  await rerun()
}
</script>

<template>
  <StepLayout :step="2" title="比对证据原件摘要" lede="节点中记录的是证据文件的 SHA-512 摘要而非文件本身。取得原件后重新计算摘要，与链上记录一致，即证明该文件自签收时刻起未被改动。">
    <template #explain>
      <h2>三方比对</h2>
      <p>
        对每一份原件，核验工具计算 <code>SHA-512(文件字节)</code>，并要求其同时等于以下两处记录：
      </p>
      <ul>
        <li><strong>清单</strong> <code>manifest.files[].sha512</code>：后台数据库里对该文件的记录；</li>
        <li><strong>链上</strong>：节点原文 <code>data</code> 里的 <code>images[].sha512</code> / <code>signature.sha512</code> / <code>receipt.sha512</code>。</li>
      </ul>
      <p>链上记录受第一步的哈希保护，「文件摘要 = 链上记录」是关键判定；清单用于定位不一致发生的层次。</p>
      <h2>签单图片的水印与 EXIF 记录</h2>
      <p>
        司机上传的照片在落盘前印有可见水印（左下角：申请单号、上传时间、图片编号，司机绑定的 GPS 令牌在线时第四行为令牌经纬度），并在 EXIF 的 UserComment 中写入同一组记录以及<strong>原始上传字节的摘要</strong> <code>raw_sha512</code>。存证对象为带水印的 JPEG，原图不保留。
      </p>
      <p>核验时读取 EXIF 记录，与节点 <code>images[]</code> 的 <code>uuid</code> / <code>raw_sha512</code> 及运单申请单号交叉比对；再由记录重建水印文字（记录含经纬度时为四行），应与链上 <code>watermark_text</code> 完全一致。图上的可见文字需人工目视核对。</p>
      <Callout>
        <p>EXIF 记录中另含一个由服务端私有密钥派生的校验字段；第三方无密钥无法复算，证据包与核验工具均不处理该字段。</p>
      </Callout>
      <h2>电子回执</h2>
      <p>送货签收完成时生成的回执 PDF 同样以摘要上链。核验工具另行统计 PDF 页数并与记录页数比对；每页右上角二维码的内容为「申请单号|页码|总页数」，供人工核对，该内容为页码索引，不属于证据要素。</p>
      <h2>示例代码</h2>
      <CodeTabs :typescript="TS_USAGE[2]" :python="pythonStepSource(2)" />
    </template>
    <template #demo>
      <p v-if="error" class="status-fail">
        演示链生成失败：{{ error }}
      </p>
      <template v-else-if="pkg">
        <PaperCard title="篡改实验" subtitle="以本机任意图片替换第一张签单照片，观察摘要与 EXIF 两项检查的结果。" class="no-print">
          <div class="actions">
            <label class="btn">
              选择图片替换
              <input type="file" accept="image/*" class="visually-hidden" @change="replace">
            </label>
            <button v-if="replaced" type="button" class="btn" @click="restore">
              恢复原件
            </button>
            <span v-if="busy" class="small muted">正在重新计算…</span>
          </div>
        </PaperCard>
        <h2 class="demo-h">
          签单图片（{{ images.length }}）
        </h2>
        <ImageEvidenceCard v-for="file in images" :key="file.uuid" :file="file" :bytes="pkg.files.get(file.path)" :chain-image="chainImage(file)" :checks="checksFor(file)" />
        <h2 class="demo-h">
          手写签名（{{ signatures.length }}）
        </h2>
        <PaperCard v-for="file in signatures" :key="file.uuid">
          <div class="sig">
            <img v-if="signatureSrc(file)" :src="signatureSrc(file)" :alt="`手写签名 ${file.uuid}`" class="sig__img">
            <div>
              <p class="mono small">
                {{ file.uuid }}.png
              </p>
              <CheckList :checks="checksFor(file)" />
            </div>
          </div>
        </PaperCard>
        <h2 class="demo-h">
          电子回执（{{ receipts.length }}）
        </h2>
        <PdfPreview v-for="file in receipts" :key="file.uuid" :file="file" :bytes="pkg.files.get(file.path)" :sn="pkg.manifest.instruction.sn ?? ''" :checks="checksFor(file)" />
      </template>
    </template>
  </StepLayout>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.demo-h {
  font-size: 20px;
  margin: 1.2em 0 0.6em;
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

@media (max-width: 640px) {
  .sig {
    grid-template-columns: 1fr;
  }
}
</style>
