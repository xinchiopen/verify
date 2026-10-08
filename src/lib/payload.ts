/** 节点 data 的解析辅助：只在核验业务一致性 / 文件摘要时读取，哈希重算从不经过这里。 */
import type { NodePayload, PackageNode } from "./types"

const payloadCache = new WeakMap<PackageNode, { data: string, payload: NodePayload | null }>()

export function parseNodePayload(node: PackageNode): NodePayload | null {
  const cached = payloadCache.get(node)
  if (cached && cached.data === node.data) return cached.payload
  let payload: NodePayload | null
  try {
    const parsed: unknown = JSON.parse(node.data)
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as NodePayload : null
  } catch {
    payload = null
  }
  payloadCache.set(node, { data: node.data, payload })
  return payload
}

/** "YYYY-MM-DD HH:MM:SS[.ffffff]" → 毫秒时间戳（按 UTC 解释，只用于同格式字符串之间比较，不涉及时区）。 */
export function parseChainTime(text: string | null | undefined): number | null {
  if (!text) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(text.trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s, frac] = match
  const millis = frac ? Math.floor(Number(frac.padEnd(6, "0")) / 1000) : 0
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), millis)
}

export function imageUuidFromPath(path: string): string | null {
  const match = /^files\/images\/([^/]+)\.jpe?g$/.exec(path)
  return match ? match[1] : null
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "（无）"
  return hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash
}
