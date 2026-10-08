import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { EvidencePackageFormatError, parseEvidencePackage } from "@/lib/package"
import { goldenZipBytes } from "./helpers"

describe("parseEvidencePackage", () => {
  it("parses the golden zip into manifest, ordered nodes and a file map", async () => {
    const pkg = await parseEvidencePackage(goldenZipBytes())
    expect(pkg.manifest.format_version).toBe(1)
    expect(pkg.manifest.instruction.sn).toBe("DEMO-2026-0001")
    expect(pkg.nodes.map(node => node.uuid)).toEqual(pkg.manifest.nodes.map(node => node.uuid))
    expect(pkg.nodes).toHaveLength(4)
    expect(pkg.files.size).toBe(9)
    expect([...pkg.files.keys()].every(path => path.startsWith("files/"))).toBe(true)
    expect(pkg.nodes[0].data.startsWith("{")).toBe(true)
  })

  it("accepts a Blob and an ArrayBuffer as input", async () => {
    const bytes = goldenZipBytes()
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const fromBlob = await parseEvidencePackage(new Blob([buffer]))
    const fromBuffer = await parseEvidencePackage(buffer)
    expect(fromBlob.nodes).toHaveLength(4)
    expect(fromBuffer.nodes).toHaveLength(4)
  })

  it("rejects bytes that are not a zip", async () => {
    await expect(parseEvidencePackage(strToU8("not a zip"))).rejects.toBeInstanceOf(EvidencePackageFormatError)
  })

  it("rejects a zip without manifest.json", async () => {
    const zip = zipSync({ "readme.txt": strToU8("hi") })
    await expect(parseEvidencePackage(zip)).rejects.toThrow(/manifest\.json/)
  })

  it("rejects an unsupported format_version and names it", async () => {
    const entries = unzipSync(goldenZipBytes())
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]))
    manifest.format_version = 2
    entries["manifest.json"] = strToU8(JSON.stringify(manifest))
    await expect(parseEvidencePackage(zipSync(entries))).rejects.toThrow(/format_version 2/)
  })

  it("rejects a package with no nodes or without an instruction block", async () => {
    const entries = unzipSync(goldenZipBytes())
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]))
    const empty = { ...manifest, nodes: [] }
    await expect(parseEvidencePackage(zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(empty)) }))).rejects.toThrow(/节点/)
    const noInstruction = { ...manifest }
    delete noInstruction.instruction
    await expect(parseEvidencePackage(zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(noInstruction)) }))).rejects.toThrow(/instruction/)
  })

  it("rejects a manifest that points at a missing node file", async () => {
    const entries = unzipSync(goldenZipBytes())
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]))
    delete entries[manifest.nodes[0].path]
    await expect(parseEvidencePackage(zipSync(entries))).rejects.toThrow(/节点文件/)
  })
})
