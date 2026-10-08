/**
 * Cloudflare Workers 入口：按 env.ALLOWED_ORIGINS 构造一次转发处理器并复用。
 * 不依赖 @cloudflare/workers-types（与站点 tsconfig 的 dom lib 冲突），Env 自行声明。
 */
import { createRelayHandler, parseAllowedOrigins } from "./relay"

export interface Env {
  /** 逗号分隔的允许 Origin 列表，见 wrangler.jsonc vars */
  ALLOWED_ORIGINS?: string
}

let cachedKey: string | undefined
let cachedHandler: ((request: Request) => Promise<Response>) | null = null

function handlerFor(env: Env): (request: Request) => Promise<Response> {
  const key = env.ALLOWED_ORIGINS ?? ""
  if (!cachedHandler || cachedKey !== key) {
    cachedKey = key
    cachedHandler = createRelayHandler({ allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS) })
  }
  return cachedHandler
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handlerFor(env)(request)
  }
}
