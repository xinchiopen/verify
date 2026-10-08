import type { PackageManifest, PackageNode } from "@/lib/types"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { strFromU8, unzipSync } from "fflate"

const GOLDEN_PATH = resolve(__dirname, "fixtures/golden-evidence-package.zip")

export function goldenZipBytes(): Uint8Array {
  return new Uint8Array(readFileSync(GOLDEN_PATH))
}

/** 不经 lib 的 parseEvidencePackage，直接解 zip 取节点，供底层模块测试使用 */
export function goldenRaw(): { manifest: PackageManifest, nodes: PackageNode[], files: Record<string, Uint8Array> } {
  const entries = unzipSync(goldenZipBytes())
  const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as PackageManifest
  const nodes = manifest.nodes.map(item => JSON.parse(strFromU8(entries[item.path])) as PackageNode)
  const files: Record<string, Uint8Array> = {}
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.startsWith("files/")) files[name] = bytes
  }
  return { manifest, nodes, files }
}
