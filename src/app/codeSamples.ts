/** 分步页展示的示例代码：TypeScript 为库的调用方式，Python 直接切自参考脚本（按 # --- stepN --- 标记）。 */
import pythonSource from "../../scripts/verify_evidence_package.py?raw"

export const PYTHON_SOURCE = pythonSource

export function sliceMarkedSection(source: string, step: number): string {
  const marker = `# --- step${step} ---`
  const start = source.indexOf(marker)
  if (start < 0) return ""
  const bodyStart = start + marker.length
  const rest = source.slice(bodyStart)
  const nextMarker = rest.search(/\n# --- step\d+ ---/)
  const mainIndex = rest.search(/\ndef main\(/)
  const candidates = [nextMarker, mainIndex].filter(index => index >= 0)
  const end = candidates.length ? Math.min(...candidates) : rest.length
  return rest.slice(0, end).trim()
}

export function pythonStepSource(step: 1 | 2 | 3 | 4): string {
  return sliceMarkedSection(pythonSource, step)
}

export const TS_USAGE: Record<1 | 2 | 3 | 4, string> = {
  1: `// "verify" 指本项目 src/lib 的构建产物（pnpm build:lib → dist-lib/），尚未发布到 npm
import { computeNodeSignature, verifyLinks, verifyNodeHash } from "verify"

// 节点哈希 = SHA-512(uuid + created_at + prev_signature + data)
// 四段原样拼接：data 是库内 JSON 原文，绝不解析后重新序列化
const signature = await computeNodeSignature({
  uuid: node.uuid,
  created_at: node.created_at,        // "2026-04-14 09:00:00.123456"
  prev_signature: node.prev_signature, // 前驱哈希；全链首节点为 ""
  data: node.data                      // 原文字符串
})
console.log(signature === node.signature) // true 表示节点未被改动

// 包内所有节点：逐个重算 + 前驱 / 后继链接关系
const checks = [...(await Promise.all(pkg.nodes.map(verifyNodeHash))), ...verifyLinks(pkg.nodes)]`,
  2: `import { parseUserComment, verifyFileDigests, verifyImageExif, verifyReceipt } from "verify"

// 每个文件：SHA-512(文件字节) 必须同时等于
//   manifest.files[].sha512（后台库内记录）和节点 data 内的摘要（链上记录）
const digestChecks = await verifyFileDigests(pkg)

// 签单图片：读 EXIF UserComment 里的 {uuid, sn, uploaded_at, raw_sha512}
// 与节点 images[] 交叉比对；由记录重建的水印文字（三行，记录带 latitude / longitude 时四行）应等于链上 watermark_text
const record = parseUserComment(jpegBytes) // 不含 hmac：第三方无法复算，本库不读不算
const exifChecks = verifyImageExif(pkg)

// 电子回执：PDF 页数 = page_count；每页二维码应为 sn|页码|总页数（目视核对）
const receiptChecks = verifyReceipt(pkg)`,
  3: `import { verifyConsistency } from "verify"

// 只用有效签收单（未作废）推导：
//   event_type / signed_type / image_phase 三者对应
//   提货 → 接力… → 送货 的签单时间递增，上链时间不早于签单时间
//   回执只随送货签收上链；小程序码签收应有手写签名
//   每段司机的 GPS 点都落在该段时间窗内（容差 60 秒）
//   运输段令牌 = 段起点签收单记录的签单令牌
//   节点 images[] 与证据包内文件一一对应
const checks = verifyConsistency(pkg)
for (const check of checks) console.log(check.status, check.id, check.detail)`,
  4: `import { compareAnchor, compareAnchorTime, compareSuccessorAnchor, fetchMessage, fetchTenantToken, messageToAnchorText, parseFeishuMessage } from "verify"

// 写链的同一事务里，节点摘要被发到了飞书群：
// { "uuid": "...", "created_at": "...", "signature": "...", "signature_prev": "..." }
const anchor = parseFeishuMessage(pastedText)
if (anchor) {
  const check = compareAnchor(node, anchor)
  console.log(check.status) // pass：节点在写链当时就已对外留痕
}

// 后继属于其他运单时，包内无法重算后继；改用「后继节点」的飞书消息闭环：
// 它的 signature_prev 必须等于本节点哈希（node.next_node.feishu_msg_id 指向那条消息）
const successor = parseFeishuMessage(pastedSuccessorText)
if (successor) console.log(compareSuccessorAnchor(node, successor).status)

// 也可以拿飞书自建应用凭证直接拉取。浏览器需经飞书转发代理（nginx 同源反代，或 worker/ 的 Cloudflare Worker），
// Node 可直连 https://open.feishu.cn/open-apis：
const relayBase = "/feishu-api" // 或 "https://<name>.<subdomain>.workers.dev"
const { token } = await fetchTenantToken({ appId, appSecret }, { baseUrl: relayBase })
const message = await fetchMessage(node.feishu_msg_id!, token, { baseUrl: relayBase })
const fetchedAnchor = parseFeishuMessage(messageToAnchorText(message))
// 飞书记录的发送时间与上链时间相差应在 5 分钟内
console.log(compareAnchorTime(node, message.createTimeMs).status)`
}
