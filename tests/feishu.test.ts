import { describe, expect, it, vi } from "vitest"
import { chainTimeToEpochMs, FeishuApiError, fetchMessage, fetchTenantToken, messageToAnchorText } from "@/lib/feishu"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("fetchTenantToken", () => {
  it("posts app_id / app_secret to the token endpoint under baseUrl and returns the token with expiry", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 0, msg: "ok", tenant_access_token: "t-abc", expire: 7200 }))
    const before = Date.now()
    const result = await fetchTenantToken({ appId: "cli_x", appSecret: "s" }, { baseUrl: "/feishu-api", fetch: fetchImpl })
    expect(result.token).toBe("t-abc")
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000 - 60_000)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/feishu-api/auth/v3/tenant_access_token/internal")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ app_id: "cli_x", app_secret: "s" })
  })

  it("throws FeishuApiError carrying Feishu's code and msg when code is non-zero", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 10003, msg: "invalid app_secret" }))
    await expect(fetchTenantToken({ appId: "a", appSecret: "b" }, { baseUrl: "/x", fetch: fetchImpl })).rejects.toMatchObject({ name: "FeishuApiError", code: 10003, msg: "invalid app_secret" })
  })

  it("throws FeishuApiError on a non-2xx transport response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502 }))
    await expect(fetchTenantToken({ appId: "a", appSecret: "b" }, { baseUrl: "/x", fetch: fetchImpl })).rejects.toBeInstanceOf(FeishuApiError)
  })
})

describe("fetchMessage", () => {
  const item = {
    message_id: "om_1",
    msg_type: "text",
    create_time: "1776128403412",
    chat_id: "oc_group",
    sender: { id: "cli_x", id_type: "app_id", sender_type: "app" },
    body: { content: JSON.stringify({ text: "{\n    \"uuid\": \"u\"\n}" }) },
    deleted: false,
    updated: false
  }

  it("reads the text body, create_time (ms) and chat_id with a bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 0, msg: "success", data: { items: [item] } }))
    const message = await fetchMessage("om_1", "t-abc", { baseUrl: "/feishu-api", fetch: fetchImpl })
    expect(message).toMatchObject({ messageId: "om_1", msgType: "text", createTimeMs: 1776128403412, chatId: "oc_group", senderType: "app", deleted: false })
    expect(messageToAnchorText(message)).toBe("{\n    \"uuid\": \"u\"\n}")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/feishu-api/im/v1/messages/om_1")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t-abc")
  })

  it("rejects non-text or deleted messages and surfaces Feishu errors", async () => {
    const image = vi.fn(async () => jsonResponse({ code: 0, data: { items: [{ ...item, msg_type: "image" }] } }))
    await expect(fetchMessage("om_1", "t", { baseUrl: "/x", fetch: image })).rejects.toThrow(/text/)
    const deleted = vi.fn(async () => jsonResponse({ code: 0, data: { items: [{ ...item, deleted: true }] } }))
    await expect(fetchMessage("om_1", "t", { baseUrl: "/x", fetch: deleted })).rejects.toThrow(/撤回|删除/)
    const forbidden = vi.fn(async () => jsonResponse({ code: 230002, msg: "Bot is not in the chat" }))
    await expect(fetchMessage("om_1", "t", { baseUrl: "/x", fetch: forbidden })).rejects.toMatchObject({ code: 230002, msg: "Bot is not in the chat" })
  })
})

describe("chainTimeToEpochMs", () => {
  it("treats chain times as Asia/Shanghai (UTC+8)", () => {
    expect(chainTimeToEpochMs("2026-04-14 09:00:03.412587")).toBe(Date.UTC(2026, 3, 14, 1, 0, 3, 412))
    expect(chainTimeToEpochMs("not a time")).toBeNull()
  })
})

describe("relay proxy errors", () => {
  it("names the relay proxy when it rejects the request instead of Feishu", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ relay_error: "origin not allowed" }, 403))
    await expect(fetchTenantToken({ appId: "a", appSecret: "b" }, { baseUrl: "https://relay.example", fetch: fetchImpl })).rejects.toThrow(/转发代理拒绝请求（origin not allowed）/)
  })
})

describe("relay proxy network errors", () => {
  it("hints at the relay ALLOWED_ORIGINS when the browser cannot reach the proxy at all", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    await expect(fetchTenantToken({ appId: "a", appSecret: "b" }, { baseUrl: "https://relay.example", fetch: fetchImpl })).rejects.toThrow(/ALLOWED_ORIGINS/)
  })
})
