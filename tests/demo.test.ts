import type { JpegEncoder } from "@/lib/demo"
import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildDemoEvidencePackage, buildDemoZip, DEMO_SN } from "@/lib/demo"
import { parseUserComment } from "@/lib/exif"
import { parseEvidencePackage } from "@/lib/package"
import { verifyEvidencePackage } from "@/lib/verify"
import { tinyJpegBytes } from "./fixtures/tiny.jpg"

const jpegEncoder: JpegEncoder = async () => tinyJpegBytes()

describe("buildDemoEvidencePackage", () => {
  it("builds a pickup → relay → delivery package that verifies with zero failures", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    expect(pkg.manifest.instruction.sn).toBe(DEMO_SN)
    expect(pkg.nodes.map(node => node.event_type)).toEqual(["driver_sign", "driver_relay", "driver_sign"])
    expect(pkg.manifest.files.map(file => file.kind).sort()).toEqual(["image", "image", "image", "receipt", "signature", "signature"])
    expect(pkg.manifest.legs).toHaveLength(2)
    const report = await verifyEvidencePackage(pkg)
    expect(report.summary.fail).toBe(0)
    // 首节点的前驱、尾节点的后继都「属于其他运单」：包内不可核验，两者都记 skip，整体结论为「通过」
    expect(report.checks.find(check => check.id === `node.link.adjacent.${pkg.nodes[0].uuid}`)!.status).toBe("skip")
    expect(report.checks.find(check => check.id === `node.link.next.${pkg.nodes[2].uuid}`)!.status).toBe("skip")
    expect(report.checks.find(check => check.id === `anchor.next.${pkg.nodes[2].uuid}`)!.status).toBe("skip")
    expect(pkg.nodes[2].next_node?.feishu_msg_id).toBe("om_demo_4")
    expect(report.overall).toBe("pass")
  })

  it("closes the successor loop when the successor's Feishu message is pasted", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    const last = pkg.nodes[2]
    const message = JSON.stringify({ uuid: last.next_node!.uuid, created_at: last.next_node!.created_at, signature: last.next_node!.signature, signature_prev: last.signature })
    const report = await verifyEvidencePackage(pkg, { successorFeishuMessages: { [last.uuid]: message } })
    expect(report.checks.find(check => check.id === `anchor.next.${last.uuid}`)!.status).toBe("pass")
  })

  it("writes node data with Python json.dumps formatting and real SHA-512 signatures", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    for (const node of pkg.nodes) {
      expect(node.data).toMatch(/^\{"devices": /)
      expect(node.data).not.toContain("\":\"")
      expect(node.signature).toMatch(/^[0-9a-f]{128}$/)
      expect(node.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/)
    }
    expect(pkg.nodes[1].prev_signature).toBe(pkg.nodes[0].signature)
    expect(pkg.nodes[0].next_node?.uuid).toBe(pkg.nodes[1].uuid)
  })

  it("round-trips through buildDemoZip → parseEvidencePackage", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    const zip = buildDemoZip(pkg)
    // SIROUTE_DEMO_ZIP_OUT=<path> 时把演示包写出去，供 Python 参考脚本交叉核验
    if (process.env.SIROUTE_DEMO_ZIP_OUT) writeFileSync(process.env.SIROUTE_DEMO_ZIP_OUT, zip)
    const parsed = await parseEvidencePackage(zip)
    expect(parsed.nodes.map(node => node.signature)).toEqual(pkg.nodes.map(node => node.signature))
    expect(parsed.files.size).toBe(6)
    expect((await verifyEvidencePackage(parsed)).summary.fail).toBe(0)
  })

  it("is deterministic for the same clock and seed so the page can rebuild it", async () => {
    const now = new Date(2026, 3, 14, 9, 0, 0)
    const a = await buildDemoEvidencePackage({ jpegEncoder, now, seed: 7 })
    const b = await buildDemoEvidencePackage({ jpegEncoder, now, seed: 7 })
    expect(a.nodes.map(node => node.signature)).toEqual(b.nodes.map(node => node.signature))
  })
})

describe("demo images", () => {
  it("carry the coordinate line in EXIF, watermark text and chain images[]", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    for (const file of pkg.manifest.files.filter(item => item.kind === "image")) {
      const record = parseUserComment(pkg.files.get(file.path)!)!
      expect(typeof record.latitude).toBe("string")
      expect(typeof record.longitude).toBe("string")
      expect(String(file.watermark_text).split("\n")[3]).toBe(`经纬度 ${record.latitude}, ${record.longitude}`)
      expect(file.latitude).toBe(Number(record.latitude))
      const payload = JSON.parse(pkg.nodes.find(node => node.uuid === file.node_uuid)!.data) as { images: { uuid: string, latitude: number | null }[] }
      expect(payload.images.find(image => image.uuid === file.uuid)!.latitude).toBe(file.latitude)
    }
  })
})

describe("demo tamper experiments", () => {
  it("fails node.hash when one character of data is edited", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    expect(pkg.nodes[1].data).toContain("演示司机乙")
    pkg.nodes[1].data = pkg.nodes[1].data.replace("演示司机乙", "演示司机丙")
    const report = await verifyEvidencePackage(pkg)
    expect(report.checks.find(check => check.id === `node.hash.${pkg.nodes[1].uuid}`)!.status).toBe("fail")
    expect(report.checks.find(check => check.id === `node.link.adjacent.${pkg.nodes[2].uuid}`)!.status).toBe("pass")
  })

  it("fails file.sha512 and file.exif when an image is replaced", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    const image = pkg.manifest.files.find(file => file.kind === "image")!
    pkg.files.set(image.path, tinyJpegBytes())
    const report = await verifyEvidencePackage(pkg)
    expect(report.checks.find(check => check.id === `file.sha512.${image.path}`)!.status).toBe("fail")
    expect(report.checks.find(check => check.id === `file.exif.${image.uuid}`)!.status).toBe("fail")
  })

  it("fails gps_window when a point is dragged out of its leg", async () => {
    const pkg = await buildDemoEvidencePackage({ jpegEncoder })
    const delivery = pkg.nodes[2]
    const payload = JSON.parse(delivery.data)
    payload.gps_locations[0].gps_time = "2020-01-01 00:00:00"
    delivery.data = JSON.stringify(payload)
    const report = await verifyEvidencePackage(pkg)
    expect(report.checks.find(check => check.id === "consistency.gps_window.1")!.status).toBe("fail")
  })
})
