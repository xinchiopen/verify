import { describe, expect, it, vi } from "vitest"
import worker from "../../worker/src/index"
import { createRelayHandler, DEFAULT_ALLOWED_ORIGINS, DEFAULT_MAX_BODY_BYTES, DEFAULT_UPSTREAM_BASE, parseAllowedOrigins } from "../../worker/src/relay"

const ORIGIN = "https://xinchiopen.github.io"
const TOKEN_PATH = "/auth/v3/tenant_access_token/internal"
const MESSAGE_PATH = "/im/v1/messages/om_abc-1"

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })
}

function upstreamMock(response: Response | (() => Promise<Response>) = jsonResponse({ code: 0 })) {
  return vi.fn(typeof response === "function" ? response : async () => response.clone()) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

function mk(upstreamFetch = upstreamMock(), allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS, extra: Record<string, unknown> = {}) {
  return createRelayHandler({ allowedOrigins, upstreamFetch, ...extra })
}

function req(path: string, init: RequestInit & { origin?: string | null } = {}): Request {
  const { origin = ORIGIN, ...rest } = init
  const headers = new Headers(rest.headers)
  if (origin !== null) headers.set("Origin", origin)
  return new Request(`https://relay.example${path}`, { ...rest, headers })
}

function upstreamCall(upstreamFetch: ReturnType<typeof upstreamMock>): { url: string, init: RequestInit } {
  const [url, init] = upstreamFetch.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init }
}

describe("parseAllowedOrigins", () => {
  it("splits on commas, trims and strips trailing slashes", () => {
    expect(parseAllowedOrigins("https://a.io/, http://localhost:3334 ,")).toEqual(["https://a.io", "http://localhost:3334"])
  })

  it("falls back to the default origins when empty or undefined", () => {
    expect(parseAllowedOrigins("")).toEqual(DEFAULT_ALLOWED_ORIGINS)
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS)
  })
})

describe("cors preflight", () => {
  it("answers an allowed origin with 204 and the CORS headers without touching the upstream", async () => {
    const upstream = upstreamMock()
    const response = await mk(upstream)(req(TOKEN_PATH, { method: "OPTIONS" }))
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect(response.headers.get("Vary")).toBe("Origin")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS")
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization")
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400")
    expect(upstream).not.toHaveBeenCalled()
  })

  it("rejects a preflight from an unknown origin with 403 and no CORS headers", async () => {
    const response = await mk()(req(TOKEN_PATH, { method: "OPTIONS", origin: "https://evil.example" }))
    expect(response.status).toBe(403)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })
})

describe("origin gate", () => {
  it("rejects requests without an Origin header", async () => {
    const upstream = upstreamMock()
    const response = await mk(upstream)(req(MESSAGE_PATH, { origin: null }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ relay_error: "origin not allowed" })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("rejects an origin outside the allow-list", async () => {
    const response = await mk()(req(MESSAGE_PATH, { origin: "https://evil.example" }))
    expect(response.status).toBe(403)
  })

  it("accepts every configured origin", async () => {
    const upstream = upstreamMock()
    const handler = mk(upstream, ["https://a.io", "https://b.io"])
    const response = await handler(req(MESSAGE_PATH, { origin: "https://b.io" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://b.io")
  })
})

describe("route allow-list", () => {
  it("relays the token request with method, content-type and body intact", async () => {
    const upstream = upstreamMock()
    const body = JSON.stringify({ app_id: "cli_x", app_secret: "s" })
    const response = await mk(upstream)(req(TOKEN_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body }))
    expect(response.status).toBe(200)
    const { url, init } = upstreamCall(upstream)
    expect(url).toBe(`${DEFAULT_UPSTREAM_BASE}${TOKEN_PATH}`)
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("content-type")).toBe("application/json")
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body)
  })

  it("relays the message request with the bearer token", async () => {
    const upstream = upstreamMock()
    await mk(upstream)(req(MESSAGE_PATH, { headers: { Authorization: "Bearer t-abc" } }))
    const { url, init } = upstreamCall(upstream)
    expect(url).toBe(`${DEFAULT_UPSTREAM_BASE}${MESSAGE_PATH}`)
    expect(init.method).toBe("GET")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer t-abc")
  })

  it.each(["/im/v1/messages", "/im/v1/messages/om_x/reactions", "/contact/v3/users", "/", "/auth/v3/tenant_access_token"])("returns 404 for %s without calling the upstream", async (path) => {
    const upstream = upstreamMock()
    const response = await mk(upstream)(req(path))
    expect(response.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("returns 405 with an Allow header when the method does not match the route", async () => {
    const upstream = upstreamMock()
    const wrongToken = await mk(upstream)(req(TOKEN_PATH, { method: "GET" }))
    expect(wrongToken.status).toBe(405)
    expect(wrongToken.headers.get("Allow")).toBe("POST")
    const wrongMessage = await mk(upstream)(req(MESSAGE_PATH, { method: "POST", body: "{}" }))
    expect(wrongMessage.status).toBe(405)
    expect(wrongMessage.headers.get("Allow")).toBe("GET")
    const deleted = await mk(upstream)(req(MESSAGE_PATH, { method: "DELETE" }))
    expect(deleted.status).toBe(405)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("drops every request header except content-type and authorization", async () => {
    const upstream = upstreamMock()
    await mk(upstream)(req(MESSAGE_PATH, { headers: { "Authorization": "Bearer t", "Cookie": "sid=1", "X-Forwarded-For": "1.2.3.4", "User-Agent": "x" } }))
    const sent = new Headers(upstreamCall(upstream).init.headers)
    expect([...sent.keys()].sort()).toEqual(["authorization"])
  })

  it("does not forward the query string", async () => {
    const upstream = upstreamMock()
    await mk(upstream)(req(`${MESSAGE_PATH}?user_id_type=open_id`))
    expect(upstreamCall(upstream).url).toBe(`${DEFAULT_UPSTREAM_BASE}${MESSAGE_PATH}`)
  })
})

describe("response handling", () => {
  it("strips Set-Cookie, keeps other upstream headers and marks the response uncacheable", async () => {
    const upstream = upstreamMock(jsonResponse({ code: 0 }, 200, { "Set-Cookie": "a=1", "X-Request-Id": "rid-1" }))
    const response = await mk(upstream)(req(MESSAGE_PATH))
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("X-Request-Id")).toBe("rid-1")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })

  it("passes a Feishu business error through untouched", async () => {
    const upstream = upstreamMock(jsonResponse({ code: 10003, msg: "invalid app_secret" }))
    const response = await mk(upstream)(req(TOKEN_PATH, { method: "POST", body: "{}" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ code: 10003, msg: "invalid app_secret" })
  })

  it("passes an upstream transport error status and body through", async () => {
    const upstream = upstreamMock(new Response("bad gateway", { status: 502 }))
    const response = await mk(upstream)(req(MESSAGE_PATH))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe("bad gateway")
  })

  it("answers 502 when the upstream fetch throws and 504 when it times out", async () => {
    const failing = upstreamMock(async () => {
      throw new TypeError("fetch failed")
    })
    const failed = await mk(failing)(req(MESSAGE_PATH))
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({ relay_error: "upstream unreachable" })
    const timingOut = upstreamMock(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
    })
    const timedOut = await mk(timingOut)(req(MESSAGE_PATH))
    expect(timedOut.status).toBe(504)
    expect(await timedOut.json()).toEqual({ relay_error: "upstream timeout" })
  })
})

describe("body limit", () => {
  it("accepts a body at the limit and rejects one byte over it before calling the upstream", async () => {
    const upstream = upstreamMock()
    const ok = await mk(upstream)(req(TOKEN_PATH, { method: "POST", body: "x".repeat(DEFAULT_MAX_BODY_BYTES) }))
    expect(ok.status).toBe(200)
    const tooBig = await mk(upstream)(req(TOKEN_PATH, { method: "POST", body: "x".repeat(DEFAULT_MAX_BODY_BYTES + 1) }))
    expect(tooBig.status).toBe(413)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it("rejects an over-limit Content-Length without reading the body", async () => {
    const upstream = upstreamMock()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"))
        controller.close()
      }
    })
    const request = new Request(`https://relay.example${TOKEN_PATH}`, { method: "POST", body: stream, duplex: "half", headers: { "Origin": ORIGIN, "Content-Length": String(DEFAULT_MAX_BODY_BYTES + 1) } } as RequestInit)
    const response = await mk(upstream)(request)
    expect(response.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe("worker entry", () => {
  it("builds the handler from env.ALLOWED_ORIGINS", async () => {
    const env = { ALLOWED_ORIGINS: "https://x.io" }
    const allowed = await worker.fetch(req(TOKEN_PATH, { method: "OPTIONS", origin: "https://x.io" }), env)
    expect(allowed.status).toBe(204)
    const rejected = await worker.fetch(req(TOKEN_PATH, { method: "OPTIONS" }), env)
    expect(rejected.status).toBe(403)
  })
})
