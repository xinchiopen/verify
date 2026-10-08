import { describe, expect, it } from "vitest"
import { buildExifSegment, encodeUserComment, insertExifSegment, parseUserComment } from "@/lib/exif"
import { goldenRaw } from "./helpers"

const { nodes, files } = goldenRaw()

/** 最小合法 JPEG：SOI + APP0(JFIF) + EOI，足够做段扫描测试 */
function bareJpeg(): Uint8Array {
  const app0 = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  return new Uint8Array([0xFF, 0xD8, ...app0, 0xFF, 0xD9])
}

describe("parseUserComment on real Pillow output", () => {
  it("reads uuid / sn / uploaded_at / raw_sha512 from every golden image and never exposes hmac", () => {
    let seen = 0
    for (const node of nodes) {
      const payload = JSON.parse(node.data) as { images: { uuid: string, raw_sha512: string, watermark_text: string }[] }
      for (const image of payload.images) {
        const bytes = files[`files/images/${image.uuid}.jpg`]
        const record = parseUserComment(bytes)
        expect(record).not.toBeNull()
        expect(record!.uuid).toBe(image.uuid)
        expect(record!.sn).toBe("DEMO-2026-0001")
        expect(record!.raw_sha512).toBe(image.raw_sha512)
        expect(typeof record!.uploaded_at).toBe("string")
        expect("hmac" in record!).toBe(false)
        seen += 1
      }
    }
    expect(seen).toBe(4)
  })

  it("returns null for a JPEG without EXIF and for non-JPEG bytes", () => {
    expect(parseUserComment(bareJpeg())).toBeNull()
    expect(parseUserComment(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBeNull()
    expect(parseUserComment(new Uint8Array())).toBeNull()
  })
})

describe("eXIF writer (demo only)", () => {
  it("round-trips a record through buildExifSegment + insertExifSegment", () => {
    const record = { uuid: "11111111-2222-3333-4444-555555555555", sn: "DEMO-演示", uploaded_at: "2026-04-14 09:00:00", raw_sha512: "a".repeat(128) }
    const jpeg = insertExifSegment(bareJpeg(), buildExifSegment(encodeUserComment(record)))
    expect(jpeg[0]).toBe(0xFF)
    expect(jpeg[1]).toBe(0xD8)
    expect(parseUserComment(jpeg)).toEqual(record)
  })

  it("encodes the comment as UNICODE\\0 + UTF-16BE compact JSON like the server", () => {
    const bytes = encodeUserComment({ a: "中" })
    const prefix = Array.from(bytes.slice(0, 8)).map(b => String.fromCharCode(b)).join("")
    expect(prefix).toBe("UNICODE\0")
    // {"a":"中"} → UTF-16BE
    expect(Array.from(bytes.slice(8))).toEqual([0, 0x7B, 0, 0x22, 0, 0x61, 0, 0x22, 0, 0x3A, 0, 0x22, 0x4E, 0x2D, 0, 0x22, 0, 0x7D])
  })

  it("parses a big-endian (MM) TIFF header too", () => {
    const record = { uuid: "u", sn: "s", uploaded_at: "t", raw_sha512: "r" }
    const segment = buildExifSegment(encodeUserComment(record), { bigEndian: true })
    expect(parseUserComment(insertExifSegment(bareJpeg(), segment))).toEqual(record)
  })
})
