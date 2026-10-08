/**
 * 飞书转发代理（Feishu Relay Proxy）的 Cloudflare Worker 实现。
 *
 * 只做一件事：把核验站（GitHub Pages 镜像）浏览器发出的两种飞书请求原样转到 open.feishu.cn，
 * 再把响应原样带回。无状态、不持有凭证、不写日志（wrangler.jsonc 关闭 observability，本文件不调用 console）。
 * 边界：Origin 白名单；只放行取 tenant_access_token 与按 id 读消息两条路径；请求头只透传
 * Content-Type / Authorization；请求体上限 16 KB；响应剥掉 Set-Cookie 并标记 no-store。
 * 本模块只用 Web 标准 API（Request / Response / Headers / URL / AbortSignal），可在 Node 的 Vitest 里直接测。
 */

export const DEFAULT_UPSTREAM_BASE = "https://open.feishu.cn/open-apis"
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ["https://xinchiopen.github.io"]
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024
/** 与自建站 nginx-verify.conf 的 proxy_read_timeout 对齐 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000

export interface RelayOptions {
  allowedOrigins: readonly string[]
  /** 默认 globalThis.fetch；测试注入 */
  upstreamFetch?: typeof fetch
  upstreamBase?: string
  maxBodyBytes?: number
  upstreamTimeoutMs?: number
}

interface Route {
  method: "GET" | "POST"
  pattern: RegExp
}

/** 放行路径表：单段 message id，禁止 /reactions 等子资源 */
const ROUTES: readonly Route[] = [
  { method: "POST", pattern: /^\/auth\/v3\/tenant_access_token\/internal$/ },
  { method: "GET", pattern: /^\/im\/v1\/messages\/[\w-]+$/ }
]

const FORWARDED_REQUEST_HEADERS = ["content-type", "authorization"] as const

/** 逗号分隔的 Origin 列表 → 去空白、去尾斜杠；空 / 未配置 → 默认列表 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "").split(",").map(item => item.trim().replace(/\/+$/, "")).filter(item => item.length > 0)
  return origins.length > 0 ? origins : [...DEFAULT_ALLOWED_ORIGINS]
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  }
}

function relayError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ relay_error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  })
}

export function createRelayHandler(options: RelayOptions): (request: Request) => Promise<Response> {
  const allowedOrigins = new Set(options.allowedOrigins.map(origin => origin.replace(/\/+$/, "")))
  const upstreamFetch = options.upstreamFetch ?? globalThis.fetch
  const upstreamBase = (options.upstreamBase ?? DEFAULT_UPSTREAM_BASE).replace(/\/+$/, "")
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin")
    const allowed = origin !== null && allowedOrigins.has(origin)
    if (request.method === "OPTIONS") {
      if (!allowed) return relayError(403, "origin not allowed")
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (!allowed) return relayError(403, "origin not allowed")
    const cors = corsHeaders(origin)
    const path = new URL(request.url).pathname
    const route = ROUTES.find(item => item.pattern.test(path))
    if (!route) return relayError(404, "path not relayed", cors)
    if (request.method !== route.method) return relayError(405, "method not allowed", { ...cors, Allow: route.method })
    let body: ArrayBuffer | null = null
    if (route.method === "POST") {
      const declared = Number(request.headers.get("Content-Length") ?? "0")
      if (Number.isFinite(declared) && declared > maxBodyBytes) return relayError(413, "request body too large", cors)
      body = await request.arrayBuffer()
      if (body.byteLength > maxBodyBytes) return relayError(413, "request body too large", cors)
    }
    const headers = new Headers()
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    let upstream: Response
    try {
      upstream = await upstreamFetch(`${upstreamBase}${path}`, { method: route.method, headers, body, signal: AbortSignal.timeout(upstreamTimeoutMs) })
    } catch (exc) {
      const timedOut = exc instanceof Error && exc.name === "TimeoutError"
      return relayError(timedOut ? 504 : 502, timedOut ? "upstream timeout" : "upstream unreachable", cors)
    }
    const out = new Headers(upstream.headers)
    out.delete("set-cookie")
    out.delete("set-cookie2")
    out.set("Cache-Control", "no-store")
    for (const [name, value] of Object.entries(cors)) out.set(name, value)
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
  }
}
