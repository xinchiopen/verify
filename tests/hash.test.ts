import { describe, expect, it } from "vitest"
import { sha512Hex, sha512HexOfText, utf8 } from "@/lib/hash"

describe("sha512Hex", () => {
  it("matches the FIPS 180 test vector for \"abc\"", async () => {
    expect(await sha512Hex(utf8("abc"))).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    )
  })

  it("hashes text as UTF-8 so Chinese matches Python's encode('utf-8')", async () => {
    // hashlib.sha512('申请单号'.encode('utf-8')).hexdigest()
    expect(await sha512HexOfText("申请单号")).toBe("88b69fb9fd223048b33e521151511ae1359df6efe7a70453cf1cab45a887261d81f0fc6683eae54104a360446d9e0ed9082d1cd06844f66b38298a8a27d7a651")
    expect(utf8("申请单号").length).toBe(12)
  })

  it("returns lowercase hex of 128 chars for empty input", async () => {
    const digest = await sha512Hex(new Uint8Array())
    expect(digest).toMatch(/^[0-9a-f]{128}$/)
    expect(digest.startsWith("cf83e1357eefb8bd")).toBe(true)
  })
})
