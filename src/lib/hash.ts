/**
 * SHA-512（Web Crypto）。浏览器要求安全上下文（https / localhost），Node 18+ 通过 globalThis.crypto 提供。
 */

const encoder = new TextEncoder()

export function utf8(text: string): Uint8Array {
  return encoder.encode(text)
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle
  if (!api) {
    throw new Error("当前环境没有 Web Crypto（crypto.subtle）：请通过 HTTPS 或 localhost 打开本页面")
  }
  return api
}

export function hasWebCrypto(): boolean {
  return Boolean(globalThis.crypto?.subtle)
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let out = ""
  for (const byte of view) out += byte.toString(16).padStart(2, "0")
  return out
}

export async function sha512Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return toHex(await subtle().digest("SHA-512", copy))
}

export async function sha512HexOfText(text: string): Promise<string> {
  return sha512Hex(utf8(text))
}
