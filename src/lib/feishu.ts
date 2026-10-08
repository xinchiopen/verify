/**
 * 飞书开放平台最小客户端：取 tenant_access_token、按 message_id 读群消息。零 DOM 依赖，`fetch` 可注入。
 * 浏览器里 open.feishu.cn 不返回 CORS 头，须经「飞书转发代理」：自建站是 nginx 同源反代 `/feishu-api/`，
 * GitHub Pages 镜像是本仓库 `worker/` 的 Cloudflare Worker；`baseUrl` 即代理地址。
 * Node / Python 环境可把 baseUrl 直接设为 https://open.feishu.cn/open-apis。凭证只用于本次请求，本模块不缓存。
 */
import { parseChainTime } from "./payload"

export interface FeishuCredentials {
  appId: string
  appSecret: string
}

export interface FeishuClientOptions {
  /** 飞书转发代理地址，形如 "/feishu-api"、"https://<name>.<subdomain>.workers.dev" 或直连 "https://open.feishu.cn/open-apis"，不带末尾斜杠 */
  baseUrl: string
  fetch?: typeof fetch
}

export interface FeishuToken {
  token: string
  /** 毫秒时间戳 */
  expiresAt: number
}

export interface FeishuMessage {
  messageId: string
  msgType: string
  /** text 类型消息的正文 */
  text: string
  createTimeMs: number
  chatId: string | null
  senderType: string | null
  deleted: boolean
}

export class FeishuApiError extends Error {
  constructor(message: string, public readonly code: number | null, public readonly msg: string, public readonly status: number) {
    super(message)
    this.name = "FeishuApiError"
  }
}

/** 服务端上链时间是 Asia/Shanghai 的 naive 时间，换算成毫秒时间戳与飞书的 create_time 比较 */
export const CHAIN_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

export function chainTimeToEpochMs(text: string | null | undefined): number | null {
  const value = parseChainTime(text)
  return value === null ? null : value - CHAIN_TIME_OFFSET_MS
}

async function callFeishu<T>(url: string, init: RequestInit, options: FeishuClientOptions): Promise<T & { code?: number, msg?: string }> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) throw new FeishuApiError("当前环境没有 fetch，无法请求飞书", null, "", 0)
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (exc) {
    // 转发代理拒绝 Origin 时预检就失败，浏览器只给网络错误、拿不到 relay_error，这里顺带提示最常见的原因
    throw new FeishuApiError(`无法连接飞书接口（${exc instanceof Error ? exc.message : String(exc)}）；若经转发代理，请确认其 ALLOWED_ORIGINS 包含本站地址`, null, "", 0)
  }
  let body: (T & { code?: number, msg?: string, relay_error?: string }) | null = null
  try {
    body = await response.json() as T & { code?: number, msg?: string, relay_error?: string }
  } catch {
    body = null
  }
  if (!response.ok && typeof body?.relay_error === "string") {
    throw new FeishuApiError(`转发代理拒绝请求（${body.relay_error}）`, null, body.relay_error, response.status)
  }
  if (!response.ok && (!body || body.code === undefined)) {
    throw new FeishuApiError(`飞书接口返回 HTTP ${response.status}`, null, "", response.status)
  }
  if (!body) throw new FeishuApiError("飞书接口返回了无法解析的内容", null, "", response.status)
  if (body.code !== undefined && body.code !== 0) {
    throw new FeishuApiError(`飞书返回错误 ${body.code}：${body.msg ?? ""}`, body.code, body.msg ?? "", response.status)
  }
  return body
}

export async function fetchTenantToken(credentials: FeishuCredentials, options: FeishuClientOptions): Promise<FeishuToken> {
  const body = await callFeishu<{ tenant_access_token?: string, expire?: number }>(`${options.baseUrl}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: credentials.appId, app_secret: credentials.appSecret })
  }, options)
  if (!body.tenant_access_token) throw new FeishuApiError("飞书未返回 tenant_access_token", body.code ?? null, body.msg ?? "", 200)
  return { token: body.tenant_access_token, expiresAt: Date.now() + (body.expire ?? 7200) * 1000 }
}

interface FeishuMessageItem {
  message_id?: string
  msg_type?: string
  create_time?: string | number
  chat_id?: string
  sender?: { sender_type?: string }
  body?: { content?: string }
  deleted?: boolean
}

export async function fetchMessage(messageId: string, token: string, options: FeishuClientOptions): Promise<FeishuMessage> {
  const body = await callFeishu<{ data?: { items?: FeishuMessageItem[] } }>(`${options.baseUrl}/im/v1/messages/${encodeURIComponent(messageId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  }, options)
  const item = body.data?.items?.[0]
  if (!item) throw new FeishuApiError(`飞书没有返回消息 ${messageId}`, body.code ?? null, body.msg ?? "", 200)
  if (item.deleted) throw new FeishuApiError(`消息 ${messageId} 已被撤回或删除`, null, "", 200)
  if (item.msg_type !== "text") throw new FeishuApiError(`消息 ${messageId} 不是 text 类型（${String(item.msg_type)}），不是节点摘要消息`, null, "", 200)
  let text = ""
  try {
    const content = JSON.parse(item.body?.content ?? "{}") as { text?: unknown }
    text = typeof content.text === "string" ? content.text : ""
  } catch {
    text = item.body?.content ?? ""
  }
  return {
    messageId: item.message_id ?? messageId,
    msgType: item.msg_type,
    text,
    createTimeMs: Number(item.create_time ?? 0),
    chatId: item.chat_id ?? null,
    senderType: item.sender?.sender_type ?? null,
    deleted: Boolean(item.deleted)
  }
}

export function messageToAnchorText(message: FeishuMessage): string {
  return message.text
}
