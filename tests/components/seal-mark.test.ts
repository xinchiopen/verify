// @vitest-environment happy-dom
import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import SealMark from "@/components/report/SealMark.vue"

describe("sealMark", () => {
  it("renders the verdict text and a status class for each outcome", () => {
    const expectations = { pass: "核验通过", fail: "核验未通过", warn: "通过但有提示", skip: "未核验" } as const
    for (const [status, text] of Object.entries(expectations)) {
      const wrapper = mount(SealMark, { props: { status: status as keyof typeof expectations } })
      expect(wrapper.text()).toContain(text)
      expect(wrapper.classes()).toContain(`seal--${status}`)
      expect(wrapper.attributes("role")).toBe("img")
    }
  })

  it("accepts a custom label", () => {
    const wrapper = mount(SealMark, { props: { status: "pass", label: "一致" } })
    expect(wrapper.text()).toContain("一致")
  })
})
