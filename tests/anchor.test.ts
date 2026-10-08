import { describe, expect, it } from "vitest"
import { compareAnchor, compareAnchorTime, compareSuccessorAnchor, parseFeishuMessage } from "@/lib/anchor"
import { chainTimeToEpochMs } from "@/lib/feishu"
import { goldenRaw } from "./helpers"

const { nodes } = goldenRaw()

function message(node = nodes[1], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ uuid: node.uuid, created_at: node.created_at, signature: node.signature, signature_prev: node.prev_signature, ...overrides }, null, 4)
}

describe("parseFeishuMessage", () => {
  it("accepts indent=4 JSON with surrounding whitespace and code fences", () => {
    const parsed = parseFeishuMessage(`\n\`\`\`json\n${message()}\n\`\`\`\n`)
    expect(parsed).toEqual({ uuid: nodes[1].uuid, created_at: nodes[1].created_at, signature: nodes[1].signature, signature_prev: nodes[1].prev_signature })
  })

  it("normalises a null signature_prev to empty string and accepts the dt alias", () => {
    const parsed = parseFeishuMessage(JSON.stringify({ uuid: "u", dt: "t", signature: "s", signature_prev: null }))
    expect(parsed).toEqual({ uuid: "u", created_at: "t", signature: "s", signature_prev: "" })
  })

  it("returns null for garbage or missing fields", () => {
    expect(parseFeishuMessage("not json")).toBeNull()
    expect(parseFeishuMessage(JSON.stringify({ uuid: "u" }))).toBeNull()
    expect(parseFeishuMessage("")).toBeNull()
  })
})

describe("compareSuccessorAnchor", () => {
  const node = nodes[0]
  const successor = nodes[1]
  const successorMessage = () => parseFeishuMessage(JSON.stringify({ uuid: successor.uuid, created_at: successor.created_at, signature: successor.signature, signature_prev: successor.prev_signature }))!

  it("passes when the successor's Feishu message points back at this node", () => {
    const check = compareSuccessorAnchor(node, successorMessage())
    expect(check).toMatchObject({ id: `anchor.next.${node.uuid}`, step: 4, status: "pass" })
  })

  it("fails when signature_prev is not this node's hash", () => {
    const anchor = { ...successorMessage(), signature_prev: `${node.signature.slice(0, -1)}${node.signature.endsWith("0") ? "1" : "0"}` }
    const check = compareSuccessorAnchor(node, anchor)
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("signature_prev")
  })

  it("fails when the message is not the hinted successor", () => {
    const anchor = { ...successorMessage(), uuid: nodes[2].uuid }
    const check = compareSuccessorAnchor(node, anchor)
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("uuid")
  })
})

describe("compareAnchorTime", () => {
  it("passes when Feishu sent the message within 5 minutes of the chain time", () => {
    const node = nodes[1]
    const sent = chainTimeToEpochMs(node.created_at)! + 30_000
    const check = compareAnchorTime(node, sent)
    expect(check).toMatchObject({ id: `anchor.time.${node.uuid}`, step: 4, status: "pass" })
    expect(check.detail).toContain("30 秒")
  })

  it("warns when the gap exceeds 5 minutes and can target the successor hint", () => {
    const node = nodes[1]
    const late = chainTimeToEpochMs(node.created_at)! + 10 * 60_000
    expect(compareAnchorTime(node, late).status).toBe("warn")
    const successor = compareAnchorTime(node, chainTimeToEpochMs(node.next_node!.created_at)! + 1000, { successor: true })
    expect(successor).toMatchObject({ id: `anchor.next.time.${node.uuid}`, status: "pass" })
  })
})

describe("compareAnchor", () => {
  it("passes when the Feishu message matches the node", () => {
    const check = compareAnchor(nodes[1], parseFeishuMessage(message())!)
    expect(check).toMatchObject({ id: `anchor.${nodes[1].uuid}`, step: 4, status: "pass" })
  })

  it("fails and names the field when one hex digit of the signature differs", () => {
    const tampered = nodes[1].signature.slice(0, -1) + (nodes[1].signature.endsWith("0") ? "1" : "0")
    const check = compareAnchor(nodes[1], parseFeishuMessage(message(nodes[1], { signature: tampered }))!)
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("signature")
  })

  it("fails when the message belongs to a different node", () => {
    const check = compareAnchor(nodes[1], parseFeishuMessage(message(nodes[2]))!)
    expect(check.status).toBe("fail")
    expect(check.detail).toContain("uuid")
  })
})
