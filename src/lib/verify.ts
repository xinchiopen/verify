import type { PackageInput } from "./package"
import type { Check, EvidencePackage, FeishuMessageMeta, PackageNode, VerificationReport } from "./types"
/** 四步核验的编排：解析 → 节点哈希与链接 → 证据文件 → 业务一致性 → 链外锚点。页面演示与 /verify 都调用这里的分步函数。 */
import { compareAnchor, compareAnchorTime, compareSuccessorAnchor, parseFeishuMessage } from "./anchor"
import { verifyConsistency } from "./consistency"
import { verifyFileDigests, verifyImageExif, verifyReceipt } from "./files"
import { verifyLinks, verifyNodeHash } from "./node"
import { parseEvidencePackage } from "./package"
import { buildReport } from "./report"

export type VerifyStage = "parse" | "nodes" | "files" | "consistency" | "anchors"

export const VERIFY_STAGES: VerifyStage[] = ["parse", "nodes", "files", "consistency", "anchors"]

export interface VerifyOptions {
  /** 节点 uuid → 粘贴的飞书消息文本；未提供的节点第 4 步记为 skip */
  feishuMessages?: Record<string, string>
  /** 本节点 uuid → 其「后继节点」的飞书消息文本；只对后继不在包内的节点生效 */
  successorFeishuMessages?: Record<string, string>
  /** 经飞书接口拉取时的元数据：键为节点 uuid（本节点消息）或 `next:<uuid>`（后继消息）；有则追加发送时间检查 */
  feishuMessageMeta?: Record<string, FeishuMessageMeta>
  onProgress?: (stage: VerifyStage, index: number, total: number) => void
}

export async function verifyNodes(pkg: EvidencePackage): Promise<Check[]> {
  const checks: Check[] = []
  for (const node of pkg.nodes) checks.push(await verifyNodeHash(node))
  checks.push(...verifyLinks(pkg.nodes))
  return checks
}

export async function verifyFiles(pkg: EvidencePackage): Promise<Check[]> {
  return [...(await verifyFileDigests(pkg)), ...verifyImageExif(pkg), ...verifyReceipt(pkg)]
}

/** 后继不在包内（属于其他运单）的节点：它们的后继关系只能靠后继节点的飞书消息佐证 */
export function nodesWithExternalSuccessor(pkg: EvidencePackage): PackageNode[] {
  const inPackage = new Set(pkg.nodes.map(node => node.uuid))
  return pkg.nodes.filter(node => node.next_node && !inPackage.has(node.next_node.uuid))
}

export function successorMetaKey(nodeUuid: string): string {
  return `next:${nodeUuid}`
}

export function verifyAnchors(pkg: EvidencePackage, messages: Record<string, string> = {}, successorMessages: Record<string, string> = {}, meta: Record<string, FeishuMessageMeta> = {}): Check[] {
  const checks: Check[] = pkg.nodes.map((node) => {
    const text = messages[node.uuid]
    if (text === undefined || !text.trim()) {
      return { id: `anchor.${node.uuid}`, step: 4, title: "飞书消息对照", status: "skip", detail: "未提供该节点的飞书群消息，未比对链外锚点", subject: { nodeUuid: node.uuid } }
    }
    const anchor = parseFeishuMessage(text)
    if (!anchor) {
      return { id: `anchor.${node.uuid}`, step: 4, title: "飞书消息对照", status: "fail", detail: "粘贴的内容不是飞书节点消息的 JSON（需要 uuid / created_at / signature / signature_prev 四个字段）", subject: { nodeUuid: node.uuid } }
    }
    return compareAnchor(node, anchor)
  })
  for (const node of pkg.nodes) {
    const own = meta[node.uuid]
    if (own && messages[node.uuid]?.trim()) checks.push(compareAnchorTime(node, own.sentAtMs))
  }
  for (const node of nodesWithExternalSuccessor(pkg)) {
    const text = successorMessages[node.uuid]
    if (text === undefined || !text.trim()) {
      checks.push({ id: `anchor.next.${node.uuid}`, step: 4, title: "后继节点飞书消息对照", status: "skip", detail: `未提供后继节点 ${node.next_node!.uuid} 的飞书群消息${node.next_node!.feishu_msg_id ? `（飞书消息 id ${node.next_node!.feishu_msg_id}）` : ""}，后继关系未经第三方记录佐证`, subject: { nodeUuid: node.uuid } })
      continue
    }
    const anchor = parseFeishuMessage(text)
    if (!anchor) {
      checks.push({ id: `anchor.next.${node.uuid}`, step: 4, title: "后继节点飞书消息对照", status: "fail", detail: "粘贴的内容不是飞书节点消息的 JSON（需要 uuid / created_at / signature / signature_prev 四个字段）", subject: { nodeUuid: node.uuid } })
      continue
    }
    checks.push(compareSuccessorAnchor(node, anchor))
    const successorMeta = meta[successorMetaKey(node.uuid)]
    if (successorMeta) checks.push(compareAnchorTime(node, successorMeta.sentAtMs, { successor: true }))
  }
  return checks
}

export async function verifyEvidencePackage(input: PackageInput, options: VerifyOptions = {}): Promise<VerificationReport> {
  const total = VERIFY_STAGES.length
  const progress = (stage: VerifyStage) => options.onProgress?.(stage, VERIFY_STAGES.indexOf(stage), total)
  progress("parse")
  const pkg = await parseEvidencePackage(input)
  progress("nodes")
  const checks: Check[] = await verifyNodes(pkg)
  progress("files")
  checks.push(...(await verifyFiles(pkg)))
  progress("consistency")
  checks.push(...verifyConsistency(pkg))
  progress("anchors")
  checks.push(...verifyAnchors(pkg, options.feishuMessages, options.successorFeishuMessages, options.feishuMessageMeta))
  return buildReport(pkg, checks)
}
