import type { JpegEncoder, JpegSpec } from "@/lib/demo"

/** 浏览器端「拍照」：canvas 画一张带左下角水印文字的 JPEG，模拟服务端落盘前加水印的效果。 */
export const canvasJpegEncoder: JpegEncoder = async (spec: JpegSpec) => {
  const canvas = document.createElement("canvas")
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("当前浏览器不支持 canvas")
  ctx.fillStyle = spec.background
  ctx.fillRect(0, 0, spec.width, spec.height)
  ctx.fillStyle = "rgba(255,255,255,0.18)"
  for (let index = 0; index < 6; index += 1) {
    ctx.fillRect(40 + index * 95, 90 + (index % 2) * 40, 60, 200 - index * 12)
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)"
  ctx.font = "bold 28px sans-serif"
  ctx.fillText(spec.caption, 32, 60)
  const bandHeight = 92
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.fillRect(0, spec.height - bandHeight, spec.width, bandHeight)
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.font = "18px sans-serif"
  spec.lines.forEach((line, index) => ctx.fillText(line, 16, spec.height - bandHeight + 28 + index * 26))
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92))
  if (!blob) throw new Error("JPEG 编码失败")
  return new Uint8Array(await blob.arrayBuffer())
}
