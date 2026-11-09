import { describe, expect, it } from "vitest"
import { verifyFileDigests, verifyImageExif, WITHHELD_DETAIL } from "@/lib/files"
import { parseEvidencePackage } from "@/lib/package"
import { verifyEvidencePackage } from "@/lib/verify"
import { goldenWithheldZipBytes, goldenZipBytes } from "./helpers"

describe("withheld files (出具方按保密策略未提供原件)", () => {
  it("keeps the overall verdict at pass and marks every image check as skip", async () => {
    const report = await verifyEvidencePackage(goldenWithheldZipBytes())
    const plain = await verifyEvidencePackage(goldenZipBytes())
    expect(report.overall).toBe("pass")
    expect(report.summary.fail).toBe(0)
    expect(report.summary.warn).toBe(plain.summary.warn)
    expect(report.package.file_count).toBe(plain.package.file_count)
    const imagePaths = report.checks.filter(check => check.id.startsWith("file.sha512.files/images/"))
    expect(imagePaths.length).toBeGreaterThan(0)
    expect(imagePaths.every(check => check.status === "skip" && check.detail?.startsWith(WITHHELD_DETAIL))).toBe(true)
    expect(report.checks.filter(check => check.id.startsWith("file.exif.")).every(check => check.status === "skip")).toBe(true)
    expect(report.checks.filter(check => check.id.startsWith("file.watermark_text.")).every(check => check.status === "skip")).toBe(true)
    // 节点 JSON 仍列出图片路径，链上声明与包内清单对应检查不受影响
    expect(report.checks.filter(check => check.id.startsWith("consistency.images_declared.")).every(check => check.status === "pass")).toBe(true)
    // 手写签名 / 回执原件仍在，照常通过
    expect(report.checks.filter(check => check.id.startsWith("file.sha512.files/signatures/") || check.id.startsWith("file.sha512.files/receipts/")).every(check => check.status === "pass")).toBe(true)
    expect(report.checks.filter(check => check.id.startsWith("file.receipt.page_count.")).every(check => check.status === "pass")).toBe(true)
  })

  it("still fails a withheld entry whose manifest digest disagrees with the chain", async () => {
    const pkg = await parseEvidencePackage(goldenWithheldZipBytes())
    const image = pkg.manifest.files.find(file => file.kind === "image")!
    image.sha512 = "0".repeat(128)
    const checks = await verifyFileDigests(pkg)
    const check = checks.find(item => item.id === `file.sha512.${image.path}`)!
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("不一致")
    expect(verifyImageExif(pkg).filter(item => item.subject?.filePath === image.path).every(item => item.status === "skip")).toBe(true)
  })

  it("exposes withheld_kinds and the note from the manifest", async () => {
    const pkg = await parseEvidencePackage(goldenWithheldZipBytes())
    expect(pkg.manifest.package.withheld_kinds).toEqual(["image"])
    expect(pkg.manifest.notes.some(note => note.includes("未提供签单图片原件"))).toBe(true)
    expect(pkg.manifest.files.filter(file => file.kind === "image").every(file => file.withheld === true && file.missing === false)).toBe(true)
  })
})
