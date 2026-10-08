// @vitest-environment happy-dom
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import FeishuConnect from "@/components/report/FeishuConnect.vue"
import { FEISHU_CREDENTIALS_STORAGE_KEY, useFeishuConnection } from "@/composables/useFeishuConnection"

describe("feishuConnect", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useFeishuConnection().disconnect(true)
  })

  it("keeps fetch-all disabled until connected and only persists credentials when remember is checked", async () => {
    const wrapper = mount(FeishuConnect, { props: { targetCount: 3 } })
    const fetchAll = wrapper.findAll("button").find(button => button.text().includes("全部拉取"))!
    expect(fetchAll.attributes("disabled")).toBeDefined()
    await wrapper.find("input[name=app_id]").setValue("cli_demo")
    await wrapper.find("input[name=app_secret]").setValue("secret")
    expect(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)).toBeNull()
    await wrapper.find("input[type=checkbox]").setValue(true)
    expect(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)).toContain("cli_demo")
    await wrapper.find("input[type=checkbox]").setValue(false)
    expect(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)).toBeNull()
  })

  it("enables fetch-all once a token is held and emits fetch-all on click", async () => {
    const connection = useFeishuConnection()
    connection.state.token = "t"
    connection.state.expiresAt = Date.now() + 60_000
    const wrapper = mount(FeishuConnect, { props: { targetCount: 2 } })
    const fetchAll = wrapper.findAll("button").find(button => button.text().includes("全部拉取"))!
    expect(fetchAll.attributes("disabled")).toBeUndefined()
    await fetchAll.trigger("click")
    expect(wrapper.emitted("fetchAll")).toHaveLength(1)
  })
})

describe("feishuConnect proxy base", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useFeishuConnection().disconnect(true)
  })

  it("shows the effective relay proxy address and defaults the advanced input to the build-time base", () => {
    const wrapper = mount(FeishuConnect, { props: { targetCount: 1 } })
    expect((wrapper.find("input[name=proxy_base]").element as HTMLInputElement).value).toBe("/feishu-api")
    expect(wrapper.text()).toContain(`${location.origin}/feishu-api/`)
    expect(wrapper.text()).toContain("飞书转发代理")
    expect(wrapper.text()).not.toContain("本站同源地址")
  })

  it("persists a custom proxy base together with the credentials when remember is checked", async () => {
    const wrapper = mount(FeishuConnect, { props: { targetCount: 1 } })
    await wrapper.find("input[name=proxy_base]").setValue("https://relay.example.workers.dev")
    expect(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)).toBeNull()
    await wrapper.find("input[type=checkbox]").setValue(true)
    expect(JSON.parse(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)!)).toMatchObject({ proxyBase: "https://relay.example.workers.dev" })
    expect(wrapper.text()).toContain("https://relay.example.workers.dev/")
    await wrapper.find("input[type=checkbox]").setValue(false)
    expect(sessionStorage.getItem(FEISHU_CREDENTIALS_STORAGE_KEY)).toBeNull()
  })

  it("disables connecting on an invalid proxy base and recovers on reset", async () => {
    const wrapper = mount(FeishuConnect, { props: { targetCount: 1 } })
    await wrapper.find("input[name=app_id]").setValue("cli_demo")
    await wrapper.find("input[name=app_secret]").setValue("secret")
    const connect = wrapper.findAll("button").find(button => button.text().includes("连接飞书"))!
    expect(connect.attributes("disabled")).toBeUndefined()
    await wrapper.find("input[name=proxy_base]").setValue("relay.example.workers.dev")
    expect(wrapper.text()).toContain("地址须以 / 或 https:// 开头")
    expect(connect.attributes("disabled")).toBeDefined()
    await wrapper.findAll("button").find(button => button.text().includes("恢复默认"))!.trigger("click")
    expect((wrapper.find("input[name=proxy_base]").element as HTMLInputElement).value).toBe("/feishu-api")
    expect(connect.attributes("disabled")).toBeUndefined()
  })

  it("falls back to the default proxy base when an older session only stored the credentials", async () => {
    sessionStorage.setItem(FEISHU_CREDENTIALS_STORAGE_KEY, JSON.stringify({ appId: "cli_old", appSecret: "old" }))
    vi.resetModules()
    const fresh = await import("@/composables/useFeishuConnection")
    const { state } = fresh.useFeishuConnection()
    expect(state.remember).toBe(true)
    expect(state.appId).toBe("cli_old")
    expect(state.proxyBase).toBe("/feishu-api")
  })
})
