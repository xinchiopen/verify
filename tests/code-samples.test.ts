import { describe, expect, it } from "vitest"
import { pythonStepSource, sliceMarkedSection, TS_USAGE } from "@/app/codeSamples"

const SAMPLE = `import x\n\n# --- step1 ---\ndef one():\n    return 1\n\n\n# --- step2 ---\ndef two():\n    return 2\n\n\ndef main():\n    pass\n`

describe("sliceMarkedSection", () => {
  it("returns the block between a marker and the next marker or main()", () => {
    expect(sliceMarkedSection(SAMPLE, 1)).toBe("def one():\n    return 1")
    expect(sliceMarkedSection(SAMPLE, 2)).toBe("def two():\n    return 2")
  })

  it("returns an empty string for a missing marker", () => {
    expect(sliceMarkedSection(SAMPLE, 3)).toBe("")
  })
})

describe("bundled samples", () => {
  it("has a TypeScript usage sample and a non-empty Python slice for each of the four steps", () => {
    for (const step of [1, 2, 3, 4] as const) {
      expect(TS_USAGE[step].length).toBeGreaterThan(40)
      const python = pythonStepSource(step)
      expect(python).toContain("def ")
      expect(python).not.toContain("# --- step")
    }
  })
})
