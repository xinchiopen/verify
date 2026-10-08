import { describe, expect, it } from "vitest"
import { wgs84ToGcj02 } from "@/lib/geo"

describe("wgs84ToGcj02", () => {
  it("shifts a mainland point like the server implementation", () => {
    const [lat, lng] = wgs84ToGcj02(39.9042, 116.4074)
    expect(Math.abs(lat - 39.9057)).toBeLessThan(5e-4)
    expect(Math.abs(lng - 116.4136)).toBeLessThan(5e-4)
  })

  it("keeps overseas points untouched", () => {
    expect(wgs84ToGcj02(40.7128, -74.0060)).toEqual([40.7128, -74.0060])
  })
})
