/**
 * 复刻 Python `json.dumps(value, sort_keys=True, ensure_ascii=False)` 的默认输出，**仅用于现场生成演示链**。
 * 真实证据包的核验只拼接节点原文，永远不会经过这里。
 *
 * 与 JS 的差异点：键按 Unicode 码点排序；分隔符为 ", " 与 ": "；浮点数按 Python repr 输出（58.0 / 1e-05 / 1e+16），
 * 所以调用方必须用 pyFloat() 显式标记「这是 float」，否则按整数输出。
 */

export class PyFloat {
  constructor(public readonly value: number) {}
}

export function pyFloat(value: number): PyFloat {
  return new PyFloat(value)
}

function pyFloatRepr(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("pyJsonDumps: 不支持 NaN / Infinity")
  if (Object.is(value, -0)) return "-0.0"
  if (value === 0) return "0.0"
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(value.toExponential())
  if (!match) throw new TypeError(`pyJsonDumps: 无法格式化浮点数 ${value}`)
  const sign = match[1]
  const digits = match[2] + (match[3] ?? "")
  const exponent = Number.parseInt(match[4], 10)
  if (exponent >= -4 && exponent < 16) {
    let intPart: string
    let fracPart: string
    if (exponent >= 0) {
      if (digits.length <= exponent + 1) {
        intPart = digits + "0".repeat(exponent + 1 - digits.length)
        fracPart = "0"
      } else {
        intPart = digits.slice(0, exponent + 1)
        fracPart = digits.slice(exponent + 1)
      }
    } else {
      intPart = "0"
      fracPart = "0".repeat(-exponent - 1) + digits
    }
    return `${sign}${intPart}.${fracPart}`
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0]
  return `${sign}${mantissa}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`
}

const SHORT_ESCAPES: Record<string, string> = { "\\": "\\\\", "\"": "\\\"", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" }

function pyString(text: string): string {
  let out = "\""
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (SHORT_ESCAPES[char]) out += SHORT_ESCAPES[char]
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`
    else out += char
  }
  return `${out}"`
}

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, char => char.codePointAt(0)!)
  const right = Array.from(b, char => char.codePointAt(0)!)
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

export function pyJsonDumps(value: unknown): string {
  if (value === null) return "null"
  if (value === true) return "true"
  if (value === false) return "false"
  if (value instanceof PyFloat) return pyFloatRepr(value.value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("pyJsonDumps: 不支持 NaN / Infinity")
    if (!Number.isInteger(value)) return pyFloatRepr(value)
    return String(value)
  }
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "string") return pyString(value)
  if (Array.isArray(value)) return value.length ? `[${value.map(pyJsonDumps).join(", ")}]` : "[]"
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort(compareCodePoints)
    if (!keys.length) return "{}"
    return `{${keys.map(key => `${pyString(key)}: ${pyJsonDumps(record[key])}`).join(", ")}}`
  }
  throw new TypeError(`pyJsonDumps: 不支持的值类型 ${typeof value}`)
}
