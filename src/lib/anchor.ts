import type { Check, FeishuAnchor, PackageNode } from "./types"
/** 步骤 4：链外锚点。把写链时同步发到飞书群的节点摘要 {uuid, created_at, signature, signature_prev} 与证据包节点比对。 */
import { chainTimeToEpochMs } from "./feishu"

export const ANCHOR_TIME_TOLERANCE_MS = 5 * 60 * 1000

export function parseFeishuMessage(text: string): FeishuAnchor | null {
  const stripped = text.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim()
  if (!stripped) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const uuid = record.uuid
  const createdAt = record.created_at ?? record.dt
  const signature = record.signature
  if (typeof uuid !== "string" || typeof createdAt !== "string" || typeof signature !== "string") return null
  const prev = record.signature_prev
  return { uuid, created_at: createdAt, signature, signature_prev: typeof prev === "string" ? prev : "" }
}

function formatGap(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}

/** 飞书服务器记录的消息发送时间 vs 节点上链时间：写链与发消息在同一事务里，相差应在几秒内。 */
export function compareAnchorTime(node: PackageNode, sentAtMs: number, options: { successor?: boolean } = {}): Check {
  const successor = Boolean(options.successor)
  const id = successor ? `anchor.next.time.${node.uuid}` : `anchor.time.${node.uuid}`
  const title = successor ? "后继节点消息发送时间" : "飞书消息发送时间"
  const chainTime = successor ? node.next_node?.created_at : node.created_at
  const subject = { nodeUuid: node.uuid }
  const chainMs = chainTimeToEpochMs(chainTime)
  if (chainMs === null) return { id, step: 4, title, status: "skip", detail: "节点上链时间无法解析，未比较发送时间", subject }
  const gap = sentAtMs - chainMs
  const sent = new Date(sentAtMs).toISOString().replace("T", " ").slice(0, 19)
  const detail = `飞书记录的发送时间 ${sent}（UTC）与上链时间 ${chainTime}（北京时间）相差 ${formatGap(gap)}`
  return Math.abs(gap) <= ANCHOR_TIME_TOLERANCE_MS
    ? { id, step: 4, title, status: "pass", detail: `${detail}，在 5 分钟容差内：消息确在写链当时发出`, expected: chainTime ?? "", actual: sent, subject }
    : { id, step: 4, title, status: "warn", detail: `${detail}，超过 5 分钟容差：请核对该消息是否就是写链时发出的那条`, expected: chainTime ?? "", actual: sent, subject }
}

/** 后继节点的飞书消息：它的 signature_prev 必须等于本节点哈希，这是「链确实从本节点继续」的链外佐证。 */
export function compareSuccessorAnchor(node: PackageNode, anchor: FeishuAnchor): Check {
  const id = `anchor.next.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  const mismatches: string[] = []
  if (node.next_node && anchor.uuid !== node.next_node.uuid) mismatches.push(`uuid：消息 ${anchor.uuid} ≠ 后继线索 ${node.next_node.uuid}`)
  if (node.next_node && anchor.signature !== node.next_node.signature) mismatches.push("signature：消息与后继线索的哈希不一致")
  if (node.next_node && anchor.created_at !== node.next_node.created_at) mismatches.push(`created_at：消息 ${anchor.created_at} ≠ 后继线索 ${node.next_node.created_at}`)
  if ((anchor.signature_prev ?? "") !== node.signature) mismatches.push("signature_prev：后继消息引用的前驱哈希不是本节点哈希")
  return mismatches.length
    ? { id, step: 4, title: "后继节点飞书消息对照", status: "fail", detail: mismatches.join("；"), expected: node.signature, actual: anchor.signature_prev, subject }
    : { id, step: 4, title: "后继节点飞书消息对照", status: "pass", detail: "后继节点写链时发出的飞书消息把本节点哈希记为前驱：链在当时就已从本节点继续，后继线索得到第三方记录佐证", expected: node.signature, actual: anchor.signature_prev, subject }
}

export function compareAnchor(node: PackageNode, anchor: FeishuAnchor): Check {
  const id = `anchor.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  const mismatches: string[] = []
  if (anchor.uuid !== node.uuid) mismatches.push(`uuid：消息 ${anchor.uuid} ≠ 节点 ${node.uuid}`)
  if (anchor.created_at !== node.created_at) mismatches.push(`created_at：消息 ${anchor.created_at} ≠ 节点 ${node.created_at}`)
  if (anchor.signature !== node.signature) mismatches.push("signature：消息与节点哈希不一致")
  if ((anchor.signature_prev ?? "") !== (node.prev_signature ?? "")) mismatches.push("signature_prev：消息与节点的前驱哈希不一致")
  return mismatches.length
    ? { id, step: 4, title: "飞书消息对照", status: "fail", detail: mismatches.join("；"), expected: node.signature, actual: anchor.signature, subject }
    : { id, step: 4, title: "飞书消息对照", status: "pass", detail: "飞书群消息中的节点编号、上链时间、哈希与前驱哈希均与证据包一致：该节点在写链当时就已对外留痕", expected: node.signature, actual: anchor.signature, subject }
}
