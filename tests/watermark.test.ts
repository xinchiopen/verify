import { describe, expect, it } from "vitest"
import { parseUserComment } from "@/lib/exif"
import { buildWatermarkLines, buildWatermarkText } from "@/lib/watermark"
import { goldenRaw } from "./helpers"

describe("buildWatermarkLines", () => {
  it("produces the server's three lines in order when the record has no coordinates", () => {
    expect(buildWatermarkLines({ sn: "SR-1", uploadedAt: "2026-04-14 09:00:00", uuid: "abc" })).toEqual([
      "申请单号 SR-1",
      "上传时间 2026-04-14 09:00:00",
      "图片编号 abc"
    ])
  })

  it("appends the coordinate line verbatim when both coordinates are present", () => {
    expect(buildWatermarkLines({ sn: "SR-1", uploadedAt: "2026-04-14 09:00:00", uuid: "abc", latitude: "31.200000", longitude: "121.400000" })).toEqual([
      "申请单号 SR-1",
      "上传时间 2026-04-14 09:00:00",
      "图片编号 abc",
      "经纬度 31.200000, 121.400000"
    ])
    expect(buildWatermarkLines({ sn: "SR-1", uploadedAt: "2026-04-14 09:00:00", uuid: "abc", latitude: "31.200000", longitude: null })).toHaveLength(3)
  })

  it("rebuilds the exact watermark_text recorded on chain from each golden image's EXIF record", () => {
    const { nodes, files } = goldenRaw()
    for (const node of nodes) {
      const payload = JSON.parse(node.data) as { images: { uuid: string, watermark_text: string }[] }
      for (const image of payload.images) {
        const record = parseUserComment(files[`files/images/${image.uuid}.jpg`])!
        const latitude = typeof record.latitude === "string" ? record.latitude : null
        const longitude = typeof record.longitude === "string" ? record.longitude : null
        expect(buildWatermarkText({ sn: String(record.sn), uploadedAt: String(record.uploaded_at), uuid: String(record.uuid), latitude, longitude })).toBe(image.watermark_text)
      }
    }
  })

  it("golden package carries images both with and without the coordinate line", () => {
    const { nodes } = goldenRaw()
    const lineCounts = nodes.flatMap((node) => {
      const payload = JSON.parse(node.data) as { images: { watermark_text: string, latitude: number | null }[] }
      return payload.images.map(image => [image.watermark_text.split("\n").length, image.latitude !== null])
    })
    expect(lineCounts).toContainEqual([4, true])
    expect(lineCounts).toContainEqual([3, false])
  })
})
