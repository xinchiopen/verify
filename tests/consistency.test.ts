import type { EvidencePackage, NodePayload } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { verifyConsistency } from "@/lib/consistency"
import { parseEvidencePackage } from "@/lib/package"
import { goldenZipBytes } from "./helpers"

async function golden(): Promise<EvidencePackage> {
  return parseEvidencePackage(goldenZipBytes())
}

function editPayload(pkg: EvidencePackage, index: number, edit: (payload: NodePayload) => void): void {
  const payload = JSON.parse(pkg.nodes[index].data) as NodePayload
  edit(payload)
  pkg.nodes[index].data = JSON.stringify(payload)
}

function byId(pkg: EvidencePackage): Record<string, ReturnType<typeof verifyConsistency>[number]> {
  return Object.fromEntries(verifyConsistency(pkg).map(check => [check.id, check]))
}

describe("verifyConsistency on golden", () => {
  it("passes every rule and only lists the voided node as excluded", async () => {
    const pkg = await golden()
    const checks = verifyConsistency(pkg)
    const notPass = checks.filter(check => check.status !== "pass")
    expect(notPass.map(check => check.id)).toEqual(["consistency.voided_excluded"])
    expect(notPass[0].status).toBe("skip")
    expect(notPass[0].detail).toContain(pkg.nodes[2].uuid)
    const ids = checks.map(check => check.id)
    expect(ids).toContain("consistency.sign_time_monotonic")
    expect(ids).toContain("consistency.receipt_only_delivery")
    expect(ids).toContain("consistency.gps_window.1")
    expect(ids).toContain("consistency.gps_window.2")
    expect(ids).toContain("consistency.leg_imei.1")
    expect(ids).toContain("consistency.leg_imei.2")
    expect(ids.filter(id => id.startsWith("consistency.event_phase."))).toHaveLength(4)
    expect(ids.filter(id => id.startsWith("consistency.images_declared."))).toHaveLength(4)
  })
})

describe("verifyConsistency tamper cases", () => {
  it("fails event_phase when a relay node claims the delivery photo phase", async () => {
    const pkg = await golden()
    editPayload(pkg, 1, payload => void (payload.image_phase = 5))
    expect(byId(pkg)[`consistency.event_phase.${pkg.nodes[1].uuid}`].status).toBe("fail")
  })

  it("warns on historical admin_backfill_sign nodes instead of failing", async () => {
    const pkg = await golden()
    editPayload(pkg, 0, payload => void (payload.event_type = "admin_backfill_sign"))
    expect(byId(pkg)[`consistency.event_phase.${pkg.nodes[0].uuid}`].status).toBe("warn")
  })

  it("fails order_ref when the payload belongs to another instruction", async () => {
    const pkg = await golden()
    editPayload(pkg, 0, payload => void (payload.instruction!.sn = "OTHER"))
    expect(byId(pkg)[`consistency.order_ref.${pkg.nodes[0].uuid}`].status).toBe("fail")
  })

  it("fails sign_time_monotonic when the delivery is signed before the relay", async () => {
    const pkg = await golden()
    pkg.nodes[3].order.time_signed = "2026-04-14 10:00:00"
    expect(byId(pkg)["consistency.sign_time_monotonic"].status).toBe("fail")
  })

  it("warns sign_time_monotonic when a node went on chain before its sign time", async () => {
    const pkg = await golden()
    pkg.nodes[3].created_at = "2026-04-15 11:59:59.000000"
    expect(byId(pkg)["consistency.sign_time_monotonic"].status).toBe("warn")
  })

  it("fails receipt_only_delivery when a pickup node carries a receipt", async () => {
    const pkg = await golden()
    editPayload(pkg, 0, payload => void (payload.receipt = { uuid: "x", sha512: "y", page_count: 1 }))
    expect(byId(pkg)["consistency.receipt_only_delivery"].status).toBe("fail")
  })

  it("warns signature_rule when a mini-program-code delivery has no signature", async () => {
    const pkg = await golden()
    editPayload(pkg, 3, payload => void (payload.signature = null))
    expect(byId(pkg)[`consistency.signature_rule.${pkg.nodes[3].uuid}`].status).toBe("warn")
  })

  it("fails gps_window when a point of the leg driver falls outside the leg window", async () => {
    const pkg = await golden()
    editPayload(pkg, 3, (payload) => {
      const point = payload.gps_locations!.find(item => item.driver_id === pkg.manifest.legs[0].driver_user_id)!
      point.gps_time = "2026-04-13 08:00:00"
    })
    expect(byId(pkg)["consistency.gps_window.1"].status).toBe("fail")
  })

  it("warns gps_window when the leg has no points at all", async () => {
    const pkg = await golden()
    editPayload(pkg, 3, payload => void (payload.gps_locations = []))
    expect(byId(pkg)["consistency.gps_window.1"].status).toBe("warn")
    expect(byId(pkg)["consistency.gps_window.2"].status).toBe("warn")
  })

  it("fails leg_imei when the leg token differs from the leg-start order token", async () => {
    const pkg = await golden()
    pkg.manifest.legs[1].imei = "IMEI-OTHER"
    expect(byId(pkg)["consistency.leg_imei.2"].status).toBe("fail")
  })

  it("fails images_declared when the node lists an image the package does not carry", async () => {
    const pkg = await golden()
    editPayload(pkg, 1, payload => void payload.images!.push({ uuid: "ghost", sha512: "0".repeat(128) }))
    expect(byId(pkg)[`consistency.images_declared.${pkg.nodes[1].uuid}`].status).toBe("fail")
  })

  it("skips leg_imei for a leg whose start order is not a package node (backfilled pickup) and still matches later legs by order id", async () => {
    const pkg = await golden()
    // 模拟提货单是后台补录：没有链节点，但运输段清单仍从它切起
    const pickup = pkg.nodes.shift()!
    pkg.manifest.nodes = pkg.manifest.nodes.filter(item => item.uuid !== pickup.uuid)
    const checks = byId(pkg)
    expect(checks["consistency.leg_imei.1"].status).toBe("skip")
    expect(checks["consistency.leg_imei.2"].status).toBe("pass")
  })

  it("falls back to positional leg matching when legs carry no order ids (older packages)", async () => {
    const pkg = await golden()
    for (const leg of pkg.manifest.legs) {
      delete (leg as Partial<typeof leg>).start_order_id
      delete (leg as Partial<typeof leg>).end_order_id
    }
    const checks = byId(pkg)
    expect(checks["consistency.leg_imei.1"].status).toBe("pass")
    expect(checks["consistency.leg_imei.2"].status).toBe("pass")
  })

  it("skips rules whose keys are missing on legacy nodes", async () => {
    const pkg = await golden()
    editPayload(pkg, 0, (payload) => {
      delete payload.image_phase
      delete payload.images
    })
    const checks = byId(pkg)
    expect(checks[`consistency.event_phase.${pkg.nodes[0].uuid}`].status).toBe("skip")
    expect(checks[`consistency.images_declared.${pkg.nodes[0].uuid}`].status).toBe("skip")
  })
})
