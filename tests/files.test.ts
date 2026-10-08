import type { EvidencePackage } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { countPdfPages, expectedQrTexts, verifyFileDigests, verifyImageExif, verifyReceipt } from "@/lib/files"
import { parseEvidencePackage } from "@/lib/package"
import { goldenZipBytes } from "./helpers"

async function golden(): Promise<EvidencePackage> {
  return parseEvidencePackage(goldenZipBytes())
}

describe("verifyFileDigests", () => {
  it("passes every golden file against manifest and chain digests", async () => {
    const pkg = await golden()
    const checks = await verifyFileDigests(pkg)
    expect(checks).toHaveLength(9)
    expect(checks.every(check => check.status === "pass")).toBe(true)
    expect(checks[0].id.startsWith("file.sha512.files/")).toBe(true)
    expect(checks[0].subject?.filePath).toBe(checks[0].id.replace("file.sha512.", ""))
  })

  it("fails when a single byte of an image changes", async () => {
    const pkg = await golden()
    const path = pkg.manifest.files.find(file => file.kind === "image")!.path
    const bytes = new Uint8Array(pkg.files.get(path)!)
    bytes[bytes.length - 10] ^= 0xFF
    pkg.files.set(path, bytes)
    const check = (await verifyFileDigests(pkg)).find(item => item.id === `file.sha512.${path}`)!
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("文件实算")
  })

  it("fails when the file is absent from the zip or marked missing at export", async () => {
    const pkg = await golden()
    const [image, signature] = [pkg.manifest.files.find(file => file.kind === "image")!, pkg.manifest.files.find(file => file.kind === "signature")!]
    pkg.files.delete(image.path)
    signature.missing = true
    const checks = await verifyFileDigests(pkg)
    expect(checks.find(item => item.id === `file.sha512.${image.path}`)!.status).toBe("fail")
    const missing = checks.find(item => item.id === `file.sha512.${signature.path}`)!
    expect(missing.status).toBe("fail")
    expect(missing.detail).toContain("导出时")
  })

  it("fails when the chain digest disagrees with the file even if the manifest agrees", async () => {
    const pkg = await golden()
    const receipt = pkg.manifest.files.find(file => file.kind === "receipt")!
    const node = pkg.nodes.find(item => item.uuid === receipt.node_uuid)!
    node.data = node.data.replace(receipt.sha512, "0".repeat(128))
    const check = (await verifyFileDigests(pkg)).find(item => item.id === `file.sha512.${receipt.path}`)!
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("链上")
  })
})

describe("verifyImageExif", () => {
  it("cross-checks every golden image's EXIF record and watermark text", async () => {
    const pkg = await golden()
    const checks = verifyImageExif(pkg)
    expect(checks.filter(check => check.id.startsWith("file.exif.")).map(check => check.status)).toEqual(["pass", "pass", "pass", "pass"])
    expect(checks.filter(check => check.id.startsWith("file.watermark_text.")).map(check => check.status)).toEqual(["pass", "pass", "pass", "pass"])
    expect(checks.some(check => JSON.stringify(check).includes("hmac"))).toBe(false)
  })

  it("fails when the image was swapped for one whose EXIF names another file", async () => {
    const pkg = await golden()
    const [first, second] = pkg.manifest.files.filter(file => file.kind === "image")
    pkg.files.set(first.path, pkg.files.get(second.path)!)
    const check = verifyImageExif(pkg).find(item => item.id === `file.exif.${first.uuid}`)!
    expect(check.status).toBe("fail")
  })

  it("rebuilds the fourth coordinate line from the EXIF record and fails when the chain text differs", async () => {
    const pkg = await golden()
    const withCoords = pkg.manifest.files.find(file => file.kind === "image" && file.latitude !== null)!
    expect(withCoords).toBeDefined()
    const passing = verifyImageExif(pkg).find(item => item.id === `file.watermark_text.${withCoords.uuid}`)!
    expect(passing.status).toBe("pass")
    expect(passing.actual).toContain("经纬度 ")
    const node = pkg.nodes.find(item => item.uuid === withCoords.node_uuid)!
    const payload = JSON.parse(node.data)
    payload.images = payload.images.map((item: Record<string, unknown>) => item.uuid === withCoords.uuid
      ? { ...item, watermark_text: String(item.watermark_text).replace("经纬度 31.200000", "经纬度 31.300000") }
      : item)
    node.data = JSON.stringify(payload)
    const failing = verifyImageExif(pkg).find(item => item.id === `file.watermark_text.${withCoords.uuid}`)!
    expect(failing.status).toBe("fail")
  })

  it("skips legacy images that have no EXIF record and no raw_sha512 on chain", async () => {
    const pkg = await golden()
    const image = pkg.manifest.files.find(file => file.kind === "image")!
    const node = pkg.nodes.find(item => item.uuid === image.node_uuid)!
    const payload = JSON.parse(node.data)
    payload.images = payload.images.map((item: Record<string, unknown>) => ({ uuid: item.uuid, sha512: item.sha512 }))
    node.data = JSON.stringify(payload)
    pkg.files.set(image.path, new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]))
    const checks = verifyImageExif(pkg)
    expect(checks.find(item => item.id === `file.exif.${image.uuid}`)!.status).toBe("skip")
    expect(checks.find(item => item.id === `file.watermark_text.${image.uuid}`)!.status).toBe("skip")
  })
})

describe("verifyReceipt", () => {
  it("counts the golden receipt pages and lists the QR texts to eyeball", async () => {
    const pkg = await golden()
    const checks = verifyReceipt(pkg)
    expect(checks).toHaveLength(2)
    for (const check of checks) {
      expect(check.status).toBe("pass")
      expect(check.detail).toContain("DEMO-2026-0001|1|2")
      expect(check.detail).toContain("DEMO-2026-0001|2|2")
    }
    const receipt = pkg.manifest.files.find(file => file.kind === "receipt")!
    expect(countPdfPages(pkg.files.get(receipt.path)!)).toEqual({ pageObjects: 2, declaredCount: 2 })
  })

  it("fails when the declared page_count does not match the PDF", async () => {
    const pkg = await golden()
    const receipt = pkg.manifest.files.find(file => file.kind === "receipt")!
    receipt.page_count = 3
    const check = verifyReceipt(pkg).find(item => item.id === `file.receipt.page_count.${receipt.uuid}`)!
    expect(check.status).toBe("fail")
  })

  it("builds sn|page|total texts", () => {
    expect(expectedQrTexts("S", 2)).toEqual(["S|1|2", "S|2|2"])
    expect(expectedQrTexts("S", 0)).toEqual([])
  })
})
