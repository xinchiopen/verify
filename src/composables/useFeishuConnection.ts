import type { FeishuClientOptions } from "@/lib/feishu"
import { computed, reactive, watch } from "vue"
import { fetchTenantToken } from "@/lib/feishu"

export const FEISHU_CREDENTIALS_STORAGE_KEY = "verify.feishu-credentials"

/** 构建期注入的飞书转发代理地址；空 = 同源 `/feishu-api`（开发期 Vite proxy、自建站 nginx 反代） */
export function resolveFeishuApiBase(): string {
  return import.meta.env.VITE_FEISHU_API_BASE?.trim() || "/feishu-api"
}

export const DEFAULT_FEISHU_API_BASE = resolveFeishuApiBase()

/** 根相对路径须以单个 `/` 开头：`//host` 与 `/\\host` 会被浏览器当成跨站地址，页面上却像本站 */
const ROOT_RELATIVE = /^\/(?![/\\])/

/** 空（用默认）、根相对路径或 https 绝对地址才可用；http 在 HTTPS 页面上是混合内容，直接拒绝 */
export function isValidProxyBase(raw: string): boolean {
  const trimmed = raw.trim()
  return trimmed === "" || ROOT_RELATIVE.test(trimmed) || /^https:\/\//.test(trimmed)
}

/** trim、去末尾斜杠；空或非法 → 构建期默认值 */
export function normalizeProxyBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "")
  return trimmed && isValidProxyBase(trimmed) ? trimmed : DEFAULT_FEISHU_API_BASE
}

/** 页面展示用：相对路径补上当前站点源，统一以 `/` 结尾 */
export function describeProxyBase(raw: string): string {
  const base = normalizeProxyBase(raw)
  if (base.startsWith("/") && typeof location !== "undefined") return `${location.origin}${base}/`
  return `${base}/`
}

interface ConnectionState {
  appId: string
  appSecret: string
  /** 勾选后把 appId / appSecret / proxyBase 写入 sessionStorage（关闭标签页即清除）；token 永远只在内存 */
  remember: boolean
  /** 飞书转发代理地址，核验方可改为自己部署的代理 */
  proxyBase: string
  token: string | null
  expiresAt: number
  connecting: boolean
  error: string
}

interface StoredCredentials {
  appId: string
  appSecret: string
  proxyBase?: string
}

function readStored(): StoredCredentials | null {
  try {
    const raw = sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { appId?: unknown, appSecret?: unknown, proxyBase?: unknown }
    return {
      appId: typeof parsed.appId === "string" ? parsed.appId : "",
      appSecret: typeof parsed.appSecret === "string" ? parsed.appSecret : "",
      // 旧版只存 appId / appSecret，没有 proxyBase 时回落到构建期默认值
      proxyBase: typeof parsed.proxyBase === "string" && parsed.proxyBase.trim() ? parsed.proxyBase : undefined
    }
  } catch {
    return null
  }
}

const stored = typeof sessionStorage !== "undefined" ? readStored() : null
const state = reactive<ConnectionState>({
  appId: stored?.appId ?? "",
  appSecret: stored?.appSecret ?? "",
  remember: Boolean(stored),
  proxyBase: stored?.proxyBase ?? DEFAULT_FEISHU_API_BASE,
  token: null,
  expiresAt: 0,
  connecting: false,
  error: ""
})

watch(() => [state.remember, state.appId, state.appSecret, state.proxyBase] as const, ([remember, appId, appSecret, proxyBase]) => {
  try {
    if (remember) sessionStorage.setItem(FEISHU_CREDENTIALS_STORAGE_KEY, JSON.stringify({ appId, appSecret, proxyBase }))
    else sessionStorage.removeItem(FEISHU_CREDENTIALS_STORAGE_KEY)
  } catch {
    // 隐私模式等场景下 sessionStorage 不可用：静默忽略，凭证只留在内存
  }
}, { flush: "sync" })

// 代理地址一变就作废令牌：令牌是向旧代理取的，不能带到新地址
watch(() => state.proxyBase, () => {
  state.token = null
  state.expiresAt = 0
})

const isConnected = computed(() => Boolean(state.token) && state.expiresAt > Date.now())
const proxyBaseDisplay = computed(() => describeProxyBase(state.proxyBase))
const proxyBaseValid = computed(() => isValidProxyBase(state.proxyBase))

/** 全站共享的飞书连接状态：凭证、代理地址与 token 不随证据包切换而清空，但 token 永远只在内存。 */
export function useFeishuConnection() {
  function clientOptions(): FeishuClientOptions {
    return { baseUrl: normalizeProxyBase(state.proxyBase) }
  }

  async function connect(): Promise<boolean> {
    state.connecting = true
    state.error = ""
    try {
      const result = await fetchTenantToken({ appId: state.appId.trim(), appSecret: state.appSecret.trim() }, clientOptions())
      state.token = result.token
      state.expiresAt = result.expiresAt
      return true
    } catch (exc) {
      state.token = null
      state.expiresAt = 0
      state.error = exc instanceof Error ? exc.message : String(exc)
      return false
    } finally {
      state.connecting = false
    }
  }

  function resetProxyBase() {
    state.proxyBase = DEFAULT_FEISHU_API_BASE
  }

  function disconnect(forgetCredentials = false) {
    state.token = null
    state.expiresAt = 0
    state.error = ""
    if (forgetCredentials) {
      state.remember = false
      state.appId = ""
      state.appSecret = ""
      resetProxyBase()
    }
  }

  return { state, isConnected, proxyBaseDisplay, proxyBaseValid, connect, disconnect, resetProxyBase, clientOptions }
}
