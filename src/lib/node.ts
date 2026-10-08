import type { Check, PackageNode } from "./types"
/**
 * 步骤 1：节点哈希重算与链接关系。
 *
 * 公式（与后端写链实现一致）：
 *   signature = SHA-512( uuid + created_at + prev_signature + data )
 * 四段直接拼接；created_at / data 都用证据包里的字符串原样参与，绝不解析后重新序列化。
 */
import { sha512HexOfText } from "./hash"

export type NodeHashInput = Pick<PackageNode, "uuid" | "created_at" | "prev_signature" | "data">

export function buildNodeRaw(node: NodeHashInput): string {
  return `${node.uuid}${node.created_at}${node.prev_signature ?? ""}${node.data}`
}

export async function computeNodeSignature(node: NodeHashInput): Promise<string> {
  return sha512HexOfText(buildNodeRaw(node))
}

export async function verifyNodeHash(node: PackageNode): Promise<Check> {
  const actual = await computeNodeSignature(node)
  const ok = actual === node.signature
  return {
    id: `node.hash.${node.uuid}`,
    step: 1,
    title: "节点哈希重算",
    status: ok ? "pass" : "fail",
    detail: ok ? "按 uuid + 上链时间 + 前驱哈希 + 节点原文重算的 SHA-512 与记录一致" : "重算结果与节点记录的哈希不一致：节点原文、时间或前驱哈希已被改动",
    expected: node.signature,
    actual,
    subject: { nodeUuid: node.uuid }
  }
}

function compareChainTime(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 包内链接关系：前驱是否在包内且哈希吻合、后继线索是否可重算、上链时间是否单调。 */
export function verifyLinks(nodes: PackageNode[]): Check[] {
  const checks: Check[] = []
  const bySignature = new Map(nodes.map(node => [node.signature, node]))
  const byUuid = new Map(nodes.map(node => [node.uuid, node]))
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) {
    const subject = { nodeUuid: node.uuid }
    const prevById = node.previous_node_id === null ? undefined : byId.get(node.previous_node_id)
    const prevBySignature = bySignature.get(node.prev_signature)
    if (!node.prev_signature) {
      checks.push({ id: `node.link.adjacent.${node.uuid}`, step: 1, title: "前驱链接", status: "pass", detail: "全链首节点：没有前驱，前驱哈希按空字符串参与重算", subject })
    } else if (prevBySignature) {
      checks.push({ id: `node.link.adjacent.${node.uuid}`, step: 1, title: "前驱链接", status: "pass", detail: `前驱节点 ${prevBySignature.uuid} 在本证据包内，其哈希与本节点记录的前驱哈希一致`, expected: prevBySignature.signature, actual: node.prev_signature, subject })
    } else if (prevById) {
      checks.push({ id: `node.link.adjacent.${node.uuid}`, step: 1, title: "前驱链接", status: "fail", detail: `前驱节点 ${prevById.uuid} 在本证据包内，但其哈希与本节点记录的前驱哈希不一致`, expected: prevById.signature, actual: node.prev_signature, subject })
    } else {
      checks.push({ id: `node.link.adjacent.${node.uuid}`, step: 1, title: "前驱链接", status: "skip", detail: "前驱节点属于其他运单，证据包只提供其哈希；该哈希已作为输入参与本节点重算", actual: node.prev_signature, subject })
    }
    if (!node.next_node) {
      checks.push({ id: `node.link.next.${node.uuid}`, step: 1, title: "后继线索", status: "skip", detail: "导出时链上没有后继节点（本节点是链尾）", subject })
    } else if (byUuid.has(node.next_node.uuid)) {
      const next = byUuid.get(node.next_node.uuid)!
      const ok = next.prev_signature === node.signature && next.signature === node.next_node.signature
      checks.push({ id: `node.link.next.${node.uuid}`, step: 1, title: "后继线索", status: ok ? "pass" : "fail", detail: ok ? `后继节点 ${next.uuid} 在本证据包内，已按其原文重算并引用了本节点哈希` : `后继节点 ${next.uuid} 在本证据包内，但其记录与线索不一致`, expected: node.signature, actual: next.prev_signature, subject })
    } else {
      const feishu = node.next_node.feishu_msg_id ? `飞书消息 id ${node.next_node.feishu_msg_id}` : "其飞书消息 id（导出时未记录）"
      checks.push({ id: `node.link.next.${node.uuid}`, step: 1, title: "后继线索", status: "skip", detail: `后继节点 ${node.next_node.uuid}（${node.next_node.created_at}）属于其他运单，证据包只给出线索，包内不可重算；可凭${feishu} 向出具方索取该节点的飞书群消息，在第四步粘贴比对（其 signature_prev 应等于本节点哈希）`, actual: node.next_node.signature, subject })
    }
  }
  const ordered = [...nodes].sort((a, b) => a.id - b.id)
  let monotonic = true
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareChainTime(ordered[index - 1].created_at, ordered[index].created_at) > 0) monotonic = false
  }
  checks.push({
    id: "node.order.created_at",
    step: 1,
    title: "上链时间顺序",
    status: monotonic ? "pass" : "warn",
    detail: monotonic ? "按链上顺序，各节点的上链时间单调不减" : "存在上链时间早于前一节点的节点：服务器时钟或节点顺序值得追问"
  })
  return checks
}
