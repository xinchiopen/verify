/** 手写最小 PNG（RGBA，无滤波）：演示链里的手写签名图。 */
import { zlibSync } from "fflate"

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export interface PngCanvas {
  width: number
  height: number
  setPixel: (x: number, y: number, rgba: [number, number, number, number]) => void
}

export function tinyPng(width: number, height: number, draw: (canvas: PngCanvas) => void): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4))
  const canvas: PngCanvas = {
    width,
    height,
    setPixel(x, y, rgba) {
      if (x < 0 || y < 0 || x >= width || y >= height) return
      raw.set(rgba, y * (1 + width * 4) + 1 + x * 4)
    }
  }
  draw(canvas)
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  const parts = [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array())]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** 一笔黑色曲线，像一个潦草的签名 */
export function signaturePng(seed: number): Uint8Array {
  return tinyPng(240, 90, (canvas) => {
    for (let x = 16; x < 224; x += 1) {
      const t = (x - 16) / 208
      const y = 45 + Math.sin(t * Math.PI * (3 + (seed % 3))) * 22 * (1 - t * 0.4) + Math.sin(t * 17 + seed) * 4
      for (let dy = -1; dy <= 1; dy += 1) canvas.setPixel(x, Math.round(y) + dy, [20, 20, 20, 255])
    }
  })
}
