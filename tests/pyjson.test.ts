import { describe, expect, it } from "vitest"
import { pyFloat, pyJsonDumps } from "@/lib/pyjson"

// 期望值由 Python 生成：json.dumps(value, sort_keys=True, ensure_ascii=False)
describe("pyJsonDumps", () => {
  it("matches Python for nested objects, floats, escapes and None/True", () => {
    const value = {
      b: 1,
      a: [1, pyFloat(2.5), "中文", null, true],
      c: { z: "q\"uo\\te\n", y: pyFloat(1e-5), x: pyFloat(58), w: pyFloat(1e16), v: pyFloat(123456789012345), u: pyFloat(0.1), t: pyFloat(-0) }
    }
    expect(pyJsonDumps(value)).toBe("{\"a\": [1, 2.5, \"中文\", null, true], \"b\": 1, \"c\": {\"t\": -0.0, \"u\": 0.1, \"v\": 123456789012345.0, \"w\": 1e+16, \"x\": 58.0, \"y\": 1e-05, \"z\": \"q\\\"uo\\\\te\\n\"}}")
  })

  it("renders empty containers like Python", () => {
    expect(pyJsonDumps({})).toBe("{}")
    expect(pyJsonDumps([])).toBe("[]")
  })

  it("escapes control characters but leaves DEL and non-ASCII raw", () => {
    expect(pyJsonDumps("控\u0001制\u007F符")).toBe("\"控\\u0001制符\"")
  })

  it("sorts keys by Unicode code point, not locale", () => {
    expect(pyJsonDumps({ é: 1, e: 2, Z: 3, z: 4, 中: 5, 一: 6 })).toBe("{\"Z\": 3, \"e\": 2, \"z\": 4, \"é\": 1, \"一\": 6, \"中\": 5}")
  })

  it("rejects undefined and non-finite numbers like a strict serializer", () => {
    expect(() => pyJsonDumps({ a: undefined })).toThrow()
    expect(() => pyJsonDumps(Number.NaN)).toThrow()
  })

  it("renders plain integers without a decimal point", () => {
    expect(pyJsonDumps(58)).toBe("58")
    expect(pyJsonDumps(pyFloat(58))).toBe("58.0")
  })
})
