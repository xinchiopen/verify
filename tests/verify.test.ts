import { describe, expect, it } from "vitest"
import { reportToJson } from "@/lib/report"
import { verifyEvidencePackage } from "@/lib/verify"
import { goldenZipBytes } from "./helpers"

describe("verifyEvidencePackage (golden end-to-end)", () => {
  it("verifies the golden package with zero failures and reports counts", async () => {
    const stages: string[] = []
    const report = await verifyEvidencePackage(goldenZipBytes(), { onProgress: stage => stages.push(stage) })
    expect(report.summary.fail).toBe(0)
    expect(report.overall).toBe("pass")
    expect(report.package).toMatchObject({ sn: "DEMO-2026-0001", node_count: 4, voided_node_count: 1, file_count: 9 })
    expect(report.checks.filter(check => check.step === 1).length).toBeGreaterThanOrEqual(4 + 4 + 4 + 1)
    expect(report.checks.filter(check => check.step === 4).map(check => check.status)).toEqual(["skip", "skip", "skip", "skip"])
    expect(report.verifier.name).toBe("verify")
    expect(stages).toEqual(["parse", "nodes", "files", "consistency", "anchors"])
  })

  it("uses pasted Feishu messages for step 4 and flags unparsable text", async () => {
    const first = await verifyEvidencePackage(goldenZipBytes())
    const node = first.checks.find(check => check.id.startsWith("node.hash."))!.subject!.nodeUuid!
    const report = await verifyEvidencePackage(goldenZipBytes(), {
      feishuMessages: {
        [node]: JSON.stringify({ uuid: node, created_at: "wrong", signature: "x", signature_prev: "" }),
        garbage: "???"
      }
    })
    const anchor = report.checks.find(check => check.id === `anchor.${node}`)!
    expect(anchor.status).toBe("fail")
    expect(report.overall).toBe("fail")
  })

  it("adds anchor.next checks only for nodes whose successor is outside the package", async () => {
    const { parseEvidencePackage } = await import("@/lib/package")
    const pkg = await parseEvidencePackage(goldenZipBytes())
    // 去掉最后一个节点：第三个节点的后继就「不在包内」了
    const last = pkg.nodes.pop()!
    pkg.manifest.nodes = pkg.manifest.nodes.filter(item => item.uuid !== last.uuid)
    for (const file of pkg.manifest.files.filter(item => item.node_uuid === last.uuid)) pkg.files.delete(file.path)
    pkg.manifest.files = pkg.manifest.files.filter(item => item.node_uuid !== last.uuid)
    const third = pkg.nodes[2]
    const message = JSON.stringify({ uuid: last.uuid, created_at: last.created_at, signature: last.signature, signature_prev: last.prev_signature })
    const without = await verifyEvidencePackage(pkg)
    expect(without.checks.find(check => check.id === `anchor.next.${third.uuid}`)!.status).toBe("skip")
    expect(without.checks.some(check => check.id === `anchor.next.${pkg.nodes[0].uuid}`)).toBe(false)
    expect(without.checks.find(check => check.id === `node.link.next.${third.uuid}`)!.status).toBe("skip")
    expect(without.overall).toBe("pass")
    const withMessage = await verifyEvidencePackage(pkg, { successorFeishuMessages: { [third.uuid]: message } })
    expect(withMessage.checks.find(check => check.id === `anchor.next.${third.uuid}`)!.status).toBe("pass")
    const tampered = await verifyEvidencePackage(pkg, { successorFeishuMessages: { [third.uuid]: message.replace(third.signature, "0".repeat(128)) } })
    expect(tampered.checks.find(check => check.id === `anchor.next.${third.uuid}`)!.status).toBe("fail")
  })

  it("adds anchor.time checks only when Feishu send times are supplied", async () => {
    const { parseEvidencePackage } = await import("@/lib/package")
    const { chainTimeToEpochMs } = await import("@/lib/feishu")
    const pkg = await parseEvidencePackage(goldenZipBytes())
    const node = pkg.nodes[1]
    const message = JSON.stringify({ uuid: node.uuid, created_at: node.created_at, signature: node.signature, signature_prev: node.prev_signature })
    const plain = await verifyEvidencePackage(pkg, { feishuMessages: { [node.uuid]: message } })
    expect(plain.checks.some(check => check.id.startsWith("anchor.time."))).toBe(false)
    const timed = await verifyEvidencePackage(pkg, { feishuMessages: { [node.uuid]: message }, feishuMessageMeta: { [node.uuid]: { sentAtMs: chainTimeToEpochMs(node.created_at)! + 2000, chatId: "oc_x" } } })
    expect(timed.checks.find(check => check.id === `anchor.time.${node.uuid}`)!.status).toBe("pass")
  })

  it("serialises to pretty JSON that round-trips", async () => {
    const report = await verifyEvidencePackage(goldenZipBytes())
    const text = reportToJson(report)
    expect(text.startsWith("{\n")).toBe(true)
    expect(JSON.parse(text).summary).toEqual(report.summary)
  })

  it("marks the report as failed when a node was tampered with", async () => {
    const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate")
    const entries = unzipSync(goldenZipBytes())
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]))
    const path = manifest.nodes[0].path
    const node = JSON.parse(strFromU8(entries[path]))
    node.data = node.data.replace("DEMO-2026-0001", "DEMO-2026-0002")
    entries[path] = strToU8(JSON.stringify(node))
    const report = await verifyEvidencePackage(zipSync(entries))
    expect(report.overall).toBe("fail")
    expect(report.checks.find(check => check.id === `node.hash.${node.uuid}`)!.status).toBe("fail")
  })
})
