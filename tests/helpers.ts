import type { PackageManifest, PackageNode } from "@/lib/types"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"

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

/** golden 的「照片扣留」变体：图片原件从 zip 里拿掉，清单条目保留并标 withheld（出具方按保密策略未提供原件） */
export function goldenWithheldZipBytes(): Uint8Array {
  const entries = unzipSync(goldenZipBytes())
  const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as PackageManifest
  let count = 0
  for (const file of manifest.files) {
    if (file.kind !== "image") continue
    file.withheld = true
    delete entries[file.path]
    count += 1
  }
  manifest.package.withheld_kinds = ["image"]
  manifest.notes = [...manifest.notes, `按保密策略未提供签单图片原件（${count} 张）`]
  entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2))
  return zipSync(entries)
}
