// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const amapState = vi.hoisted(() => ({ configured: true, fail: false, loads: 0 }))

vi.mock("@/app/amap", () => {
  class FakeMap {
    add = vi.fn()
    setFitView = vi.fn()
    destroy = vi.fn()
  }
  class FakeOverlay {}
  return {
    amapConfigured: () => amapState.configured,
    loadAmap: () => {
      amapState.loads += 1
      if (amapState.fail) return Promise.reject(new Error("高德地图 SDK 加载失败"))
      return Promise.resolve({ Map: FakeMap, Polyline: FakeOverlay, Marker: FakeOverlay })
    }
  }
})

const legs = [{ index: 1, driverName: "甲", color: "#1f77b4", points: [{ lat: 31.2, lng: 121.4, time: "" }, { lat: 31.21, lng: 121.41, time: "" }] }]

async function mountTrack() {
  const { default: AmapTrack } = await import("@/components/track/AmapTrack.vue")
  const wrapper = mount(AmapTrack, { props: { legs: legs as never } })
  await flushPromises()
  return wrapper
}

describe("amapTrack", () => {
  beforeEach(() => {
    amapState.configured = true
    amapState.fail = false
    amapState.loads = 0
  })

  it("opens the map automatically when a key is configured and reports it as shown", async () => {
    const wrapper = await mountTrack()
    expect(amapState.loads).toBe(1)
    expect(wrapper.emitted("shown")).toEqual([[true]])
    expect(wrapper.findAll("button").some(button => button.text().includes("在高德地图上查看"))).toBe(false)
    expect(wrapper.text()).toContain("地图服务商")
  })

  it("falls back to the sketch and offers a retry when the SDK fails to load", async () => {
    amapState.fail = true
    const wrapper = await mountTrack()
    expect(wrapper.emitted("shown")).toEqual([[false]])
    expect(wrapper.text()).toContain("高德地图 SDK 加载失败")
    amapState.fail = false
    await wrapper.findAll("button").find(button => button.text().includes("重试"))!.trigger("click")
    await flushPromises()
    expect(amapState.loads).toBe(2)
    expect(wrapper.emitted("shown")).toEqual([[false], [true]])
  })

  it("renders nothing and never loads the SDK without a key", async () => {
    amapState.configured = false
    const wrapper = await mountTrack()
    expect(amapState.loads).toBe(0)
    expect(wrapper.emitted("shown")).toBeUndefined()
    expect(wrapper.html()).not.toContain("amap")
  })
})
