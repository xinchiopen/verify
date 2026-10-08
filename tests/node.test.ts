import { describe, expect, it } from "vitest"
import { computeNodeSignature, verifyLinks, verifyNodeHash } from "@/lib/node"
import { goldenRaw } from "./helpers"

const { nodes } = goldenRaw()

describe("computeNodeSignature", () => {
  it("recomputes every golden node signature from uuid + created_at + prev_signature + data", async () => {
    for (const node of nodes) {
      expect(await computeNodeSignature(node)).toBe(node.signature)
    }
  })

  it("changes when a single character of data changes", async () => {
    const node = nodes[0]
    const tampered = { ...node, data: node.data.replace("\"sn\": \"DEMO", "\"sn\": \"DEM0") }
    expect(tampered.data).not.toBe(node.data)
    expect(await computeNodeSignature(tampered)).not.toBe(node.signature)
  })

  it("treats a null prev_signature as empty string", async () => {
    const node = nodes[0]
    expect(node.prev_signature).toBe("")
    expect(await computeNodeSignature({ ...node, prev_signature: null as unknown as string })).toBe(node.signature)
  })
})

describe("verifyNodeHash", () => {
  it("passes for an untouched node and carries expected/actual", async () => {
    const check = await verifyNodeHash(nodes[1])
    expect(check).toMatchObject({ id: `node.hash.${nodes[1].uuid}`, step: 1, status: "pass", expected: nodes[1].signature, actual: nodes[1].signature })
    expect(check.subject).toEqual({ nodeUuid: nodes[1].uuid })
  })

  it("fails when created_at is shifted by one microsecond", async () => {
    const node = nodes[1]
    const shifted = { ...node, created_at: node.created_at.slice(0, -1) + ((Number(node.created_at.slice(-1)) + 1) % 10) }
    const check = await verifyNodeHash(shifted)
    expect(check.status).toBe("fail")
    expect(check.actual).not.toBe(node.signature)
  })
})

describe("verifyLinks", () => {
  it("reports the global first node, in-package adjacency, next hints and time order", () => {
    const checks = verifyLinks(nodes)
    const byId = Object.fromEntries(checks.map(check => [check.id, check]))
    expect(byId[`node.link.adjacent.${nodes[0].uuid}`].status).toBe("pass")
    expect(byId[`node.link.adjacent.${nodes[0].uuid}`].detail).toContain("全链首节点")
    for (const node of nodes.slice(1)) {
      expect(byId[`node.link.adjacent.${node.uuid}`].status).toBe("pass")
    }
    // 后继在包内 → 可重算；链尾无后继 → skip
    expect(byId[`node.link.next.${nodes[0].uuid}`].status).toBe("pass")
    expect(byId[`node.link.next.${nodes[3].uuid}`].status).toBe("skip")
    expect(byId["node.order.created_at"].status).toBe("pass")
  })

  it("skips adjacency when the predecessor belongs to another instruction and skips an unverifiable next hint", () => {
    const [first, second] = nodes
    const foreignPrev = { ...second, prev_signature: "f".repeat(128), previous_node_id: 99999 }
    const checks = verifyLinks([foreignPrev])
    const byId = Object.fromEntries(checks.map(check => [check.id, check]))
    expect(byId[`node.link.adjacent.${second.uuid}`].status).toBe("skip")
    expect(byId[`node.link.adjacent.${second.uuid}`].detail).toContain("其他运单")
    // 只带首节点时，它的后继（第二个节点）不在包内 → 包内不可核验，记跳过，并给出后继的飞书消息 id 供第四步索取
    const withHint = { ...first, next_node: { ...first.next_node!, feishu_msg_id: "om_next_1" } }
    const alone = Object.fromEntries(verifyLinks([withHint]).map(check => [check.id, check]))
    expect(alone[`node.link.next.${first.uuid}`].status).toBe("skip")
    expect(alone[`node.link.next.${first.uuid}`].detail).toContain("om_next_1")
  })

  it("fails adjacency when a predecessor is in the package but its signature does not match", () => {
    const [first, second] = nodes
    const flipped = first.signature.endsWith("0") ? "1" : "0"
    const broken = { ...second, prev_signature: `${first.signature.slice(0, -1)}${flipped}`, previous_node_id: first.id }
    const checks = verifyLinks([first, broken])
    const check = checks.find(item => item.id === `node.link.adjacent.${second.uuid}`)!
    expect(check.status).toBe("fail")
  })

  it("warns when created_at goes backwards along the chain order", () => {
    const [first, second, ...rest] = nodes
    const checks = verifyLinks([first, { ...second, created_at: "2000-01-01 00:00:00.000000" }, ...rest])
    expect(checks.find(item => item.id === "node.order.created_at")!.status).toBe("warn")
  })
})
