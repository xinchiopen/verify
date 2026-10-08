/** 可见水印文字，与服务端 image_watermark.build_watermark_lines 完全一致：三行固定，EXIF 记录带经纬度时第四行原样拼接。 */
export interface WatermarkInput {
  sn: string
  /** YYYY-MM-DD HH:MM:SS */
  uploadedAt: string
  uuid: string
  /** EXIF 记录里的 6 位小数字符串（WGS-84），两者都有才印第四行；旧图 / 无令牌位置时缺省 */
  latitude?: string | null
  longitude?: string | null
}

export function buildWatermarkLines(input: WatermarkInput): string[] {
  const lines = [`申请单号 ${input.sn}`, `上传时间 ${input.uploadedAt}`, `图片编号 ${input.uuid}`]
  if (input.latitude && input.longitude) lines.push(`经纬度 ${input.latitude}, ${input.longitude}`)
  return lines
}

export function buildWatermarkText(input: WatermarkInput): string {
  return buildWatermarkLines(input).join("\n")
}
