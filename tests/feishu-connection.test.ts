import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_FEISHU_API_BASE, describeProxyBase, isValidProxyBase, normalizeProxyBase, useFeishuConnection } from "@/composables/useFeishuConnection"

describe("proxy base helpers", () => {
  it("defaults to the same-origin /feishu-api when the build injects nothing", () => {
    expect(DEFAULT_FEISHU_API_BASE).toBe("/feishu-api")
  })

  it("normalizes whitespace and trailing slashes and falls back to the default when empty", () => {
    expect(normalizeProxyBase("https://relay.example.workers.dev/")).toBe("https://relay.example.workers.dev")
    expect(normalizeProxyBase("  /feishu-api/ ")).toBe("/feishu-api")
    expect(normalizeProxyBase("")).toBe(DEFAULT_FEISHU_API_BASE)
    expect(normalizeProxyBase("   ")).toBe(DEFAULT_FEISHU_API_BASE)
  })

  it("describes an absolute proxy as-is and a relative one without a location as a bare path", () => {
    expect(describeProxyBase("https://relay.example.workers.dev")).toBe("https://relay.example.workers.dev/")
    expect(describeProxyBase("/feishu-api")).toBe("/feishu-api/")
    expect(describeProxyBase("")).toBe("/feishu-api/")
  })

  it("accepts empty, root-relative and https bases and rejects everything else", () => {
    expect(isValidProxyBase("")).toBe(true)
    expect(isValidProxyBase("/feishu-api")).toBe(true)
    expect(isValidProxyBase("https://relay.example.workers.dev")).toBe(true)
    expect(isValidProxyBase("relay.example.workers.dev")).toBe(false)
    expect(isValidProxyBase("ftp://relay.example")).toBe(false)
  })
})

describe("useFeishuConnection proxy base", () => {
  beforeEach(() => {
    useFeishuConnection().disconnect(true)
  })

  it("uses the normalized proxy base as the client baseUrl", () => {
    const connection = useFeishuConnection()
    expect(connection.clientOptions().baseUrl).toBe(DEFAULT_FEISHU_API_BASE)
    connection.state.proxyBase = "https://relay.example.workers.dev/"
    expect(connection.clientOptions().baseUrl).toBe("https://relay.example.workers.dev")
    expect(connection.proxyBaseDisplay.value).toBe("https://relay.example.workers.dev/")
    expect(connection.proxyBaseValid.value).toBe(true)
  })

  it("flags an invalid proxy base and restores the default on reset", () => {
    const connection = useFeishuConnection()
    connection.state.proxyBase = "relay.example.workers.dev"
    expect(connection.proxyBaseValid.value).toBe(false)
    connection.resetProxyBase()
    expect(connection.state.proxyBase).toBe(DEFAULT_FEISHU_API_BASE)
    expect(connection.proxyBaseValid.value).toBe(true)
  })

  it("forgets a custom proxy base together with the credentials", () => {
    const connection = useFeishuConnection()
    connection.state.proxyBase = "https://relay.example.workers.dev"
    connection.disconnect(true)
    expect(connection.state.proxyBase).toBe(DEFAULT_FEISHU_API_BASE)
  })
})

describe("proxy base hardening", () => {
  it("rejects protocol-relative and backslash paths that would leave the site while looking same-origin", () => {
    expect(isValidProxyBase("//evil.example")).toBe(false)
    expect(isValidProxyBase("/\\evil.example")).toBe(false)
    expect(normalizeProxyBase("//evil.example")).toBe(DEFAULT_FEISHU_API_BASE)
  })

  it("accepts only https for absolute proxy addresses", () => {
    expect(isValidProxyBase("http://relay.example")).toBe(false)
    expect(isValidProxyBase("https://relay.example")).toBe(true)
  })

  it("drops the held token when the proxy base changes so it is never sent to a different host", async () => {
    const connection = useFeishuConnection()
    connection.state.token = "t"
    connection.state.expiresAt = Date.now() + 60_000
    expect(connection.isConnected.value).toBe(true)
    connection.state.proxyBase = "https://relay.example"
    await Promise.resolve()
    expect(connection.state.token).toBeNull()
    expect(connection.isConnected.value).toBe(false)
  })
})
