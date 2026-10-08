import type { EvidencePackage, PackageManifest, PackageNode } from "./types"
/** 证据包 zip → 内存模型。只做结构校验，不做任何核验；文件缺失留给步骤 2 判定。 */
import { strFromU8, unzipSync } from "fflate"

export const SUPPORTED_FORMAT_VERSION = 1
export const PACKAGE_KIND = "siroute-evidence-package"

export class EvidencePackageFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvidencePackageFormatError"
  }
}

export type PackageInput = Uint8Array | ArrayBuffer | Blob | EvidencePackage

export function isEvidencePackage(value: unknown): value is EvidencePackage {
  return Boolean(value) && typeof value === "object" && "manifest" in (value as object) && "nodes" in (value as object) && (value as EvidencePackage).files instanceof Map
}

async function toBytes(input: Exclude<PackageInput, EvidencePackage>): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(await input.arrayBuffer())
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string") throw new EvidencePackageFormatError(`${where} 缺少字符串字段`)
  return value
}

function parseJson<T>(bytes: Uint8Array, where: string): T {
  try {
    return JSON.parse(strFromU8(bytes)) as T
  } catch {
    throw new EvidencePackageFormatError(`${where} 不是合法 JSON`)
  }
}

function validateNode(node: PackageNode, path: string): void {
  requireString(node.uuid, `${path} uuid`)
  requireString(node.created_at, `${path} created_at`)
  requireString(node.signature, `${path} signature`)
  requireString(node.data, `${path} data`)
  if (node.prev_signature === null || node.prev_signature === undefined) node.prev_signature = ""
  requireString(node.prev_signature, `${path} prev_signature`)
  if (!node.order || typeof node.order !== "object") throw new EvidencePackageFormatError(`${path} 缺少 order`)
  if (!Array.isArray(node.files)) node.files = []
}

export async function parseEvidencePackage(input: PackageInput): Promise<EvidencePackage> {
  if (isEvidencePackage(input)) return input
  const bytes = await toBytes(input)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new EvidencePackageFormatError("无法解压：这不是一个 zip 文件，或文件已损坏")
  }
  const manifestBytes = entries["manifest.json"]
  if (!manifestBytes) throw new EvidencePackageFormatError("不是证据包：zip 根目录没有 manifest.json")
  const manifest = parseJson<PackageManifest>(manifestBytes, "manifest.json")
  if (manifest.format_version !== SUPPORTED_FORMAT_VERSION) {
    throw new EvidencePackageFormatError(`不支持的证据包版本 format_version ${String(manifest.format_version)}（本工具支持 ${SUPPORTED_FORMAT_VERSION}）`)
  }
  if (manifest.package?.kind !== PACKAGE_KIND) throw new EvidencePackageFormatError("manifest.package.kind 不是 siroute-evidence-package")
  if (!Array.isArray(manifest.nodes) || !Array.isArray(manifest.files) || !Array.isArray(manifest.orders)) {
    throw new EvidencePackageFormatError("manifest.json 缺少 nodes / orders / files 清单")
  }
  if (!manifest.instruction || typeof manifest.instruction !== "object") throw new EvidencePackageFormatError("manifest.json 缺少 instruction 运单摘要")
  if (!manifest.nodes.length) throw new EvidencePackageFormatError("证据包里没有任何链节点，无法核验")
  manifest.legs = Array.isArray(manifest.legs) ? manifest.legs : []
  manifest.notes = Array.isArray(manifest.notes) ? manifest.notes : []
  const nodes: PackageNode[] = manifest.nodes.map((item) => {
    const nodeBytes = entries[item.path]
    if (!nodeBytes) throw new EvidencePackageFormatError(`清单引用的节点文件不存在：${item.path}`)
    const node = parseJson<PackageNode>(nodeBytes, item.path)
    validateNode(node, item.path)
    return node
  })
  const files = new Map<string, Uint8Array>()
  for (const [name, content] of Object.entries(entries)) {
    if (name.startsWith("files/") && !name.endsWith("/")) files.set(name, content)
  }
  return { manifest, nodes, files }
}
