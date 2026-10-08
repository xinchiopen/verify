/**
 * 最小 EXIF 读写：只处理 JPEG APP1 里的 UserComment（0x9286）。
 * 读取面向服务端 Pillow 写出的真实图片（II / MM 字节序都支持）；写入只给演示链用。
 * 记录里的 hmac 字段由服务端私有密钥派生，第三方无法复算，解析结果会把它剔除——本库不读、不算、不展示。
 */

const TAG_EXIF_IFD = 0x8769
const TAG_USER_COMMENT = 0x9286
const TAG_ORIENTATION = 0x0112
const TYPE_SHORT = 3
const TYPE_LONG = 4
const TYPE_UNDEFINED = 7
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }
const UNICODE_PREFIX = "UNICODE\0"
const ASCII_PREFIX = "ASCII\0\0\0"
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

export type ExifRecord = Record<string, unknown>

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = ""
  for (let index = start; index < start + length && index < bytes.length; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

/** 返回 APP1 Exif 段里的 TIFF 数据（去掉 "Exif\0\0" 头）；没有则 null */
function findExifTiff(jpeg: Uint8Array): Uint8Array | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) return null
  let offset = 2
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xFF) return null
    const marker = jpeg[offset + 1]
    if (marker === 0xFF) {
      offset += 1
      continue
    }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2
      continue
    }
    if (marker === 0xDA || marker === 0xD9) return null
    const length = (jpeg[offset + 2] << 8) | jpeg[offset + 3]
    if (length < 2) return null
    if (marker === 0xE1 && ascii(jpeg, offset + 4, 6) === "Exif\0\0") {
      return jpeg.subarray(offset + 10, offset + 2 + length)
    }
    offset += 2 + length
  }
  return null
}

function readUserComment(tiff: Uint8Array): Uint8Array | null {
  if (tiff.length < 8) return null
  const order = ascii(tiff, 0, 2)
  if (order !== "II" && order !== "MM") return null
  const little = order === "II"
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  if (view.getUint16(2, little) !== 42) return null
  const readIfd = (start: number, wanted: number): { type: number, count: number, valueOffset: number } | null => {
    if (start + 2 > tiff.length) return null
    const entries = view.getUint16(start, little)
    for (let index = 0; index < entries; index += 1) {
      const entry = start + 2 + index * 12
      if (entry + 12 > tiff.length) return null
      if (view.getUint16(entry, little) === wanted) {
        return { type: view.getUint16(entry + 2, little), count: view.getUint32(entry + 4, little), valueOffset: entry + 8 }
      }
    }
    return null
  }
  const valueBytes = (field: { type: number, count: number, valueOffset: number }): Uint8Array | null => {
    const size = (TYPE_SIZES[field.type] ?? 1) * field.count
    if (size <= 4) return tiff.subarray(field.valueOffset, field.valueOffset + size)
    const offset = view.getUint32(field.valueOffset, little)
    if (offset + size > tiff.length) return null
    return tiff.subarray(offset, offset + size)
  }
  const ifd0 = view.getUint32(4, little)
  const direct = readIfd(ifd0, TAG_USER_COMMENT)
  if (direct) return valueBytes(direct)
  const pointer = readIfd(ifd0, TAG_EXIF_IFD)
  if (!pointer) return null
  const exifIfd = view.getUint32(pointer.valueOffset, little)
  const field = readIfd(exifIfd, TAG_USER_COMMENT)
  return field ? valueBytes(field) : null
}

function decodeUserComment(raw: Uint8Array): string {
  const head = ascii(raw, 0, 8)
  if (head === UNICODE_PREFIX) return new TextDecoder("utf-16be").decode(raw.subarray(8))
  if (head === ASCII_PREFIX) return ascii(raw, 8, raw.length - 8)
  return new TextDecoder("utf-8").decode(raw)
}

/** 读 JPEG EXIF UserComment 里服务端写入的记录（uuid / sn / uploaded_at / raw_sha512）；缺失或不是本系统格式返回 null。 */
export function parseUserComment(jpeg: Uint8Array): ExifRecord | null {
  const tiff = findExifTiff(jpeg)
  if (!tiff) return null
  let raw: Uint8Array | null
  try {
    raw = readUserComment(tiff)
  } catch {
    return null
  }
  if (!raw) return null
  let record: unknown
  try {
    record = JSON.parse(decodeUserComment(raw).replace(/\0+$/, ""))
  } catch {
    return null
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null
  const result = { ...(record as ExifRecord) }
  delete result.hmac
  return result
}

/** 服务端同款编码：UNICODE\0 前缀 + UTF-16BE 的紧凑 JSON */
export function encodeUserComment(record: ExifRecord): Uint8Array {
  const text = JSON.stringify(record)
  const out = new Uint8Array(8 + text.length * 2)
  for (let index = 0; index < 8; index += 1) out[index] = UNICODE_PREFIX.charCodeAt(index)
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    out[8 + index * 2] = unit >> 8
    out[9 + index * 2] = unit & 0xFF
  }
  return out
}

/** 构造只含 Orientation=1 与 UserComment 的 APP1 Exif 段（演示用） */
export function buildExifSegment(comment: Uint8Array, options: { bigEndian?: boolean } = {}): Uint8Array {
  const little = !options.bigEndian
  const ifd0 = 8
  const exifIfd = ifd0 + 2 + 2 * 12 + 4
  const dataStart = exifIfd + 2 + 12 + 4
  const inline = comment.length <= 4
  const tiff = new Uint8Array(dataStart + (inline ? 0 : comment.length))
  const view = new DataView(tiff.buffer)
  tiff[0] = tiff[1] = little ? 0x49 : 0x4D
  view.setUint16(2, 42, little)
  view.setUint32(4, ifd0, little)
  view.setUint16(ifd0, 2, little)
  let entry = ifd0 + 2
  view.setUint16(entry, TAG_ORIENTATION, little)
  view.setUint16(entry + 2, TYPE_SHORT, little)
  view.setUint32(entry + 4, 1, little)
  view.setUint16(entry + 8, 1, little)
  entry += 12
  view.setUint16(entry, TAG_EXIF_IFD, little)
  view.setUint16(entry + 2, TYPE_LONG, little)
  view.setUint32(entry + 4, 1, little)
  view.setUint32(entry + 8, exifIfd, little)
  view.setUint32(entry + 12, 0, little)
  view.setUint16(exifIfd, 1, little)
  entry = exifIfd + 2
  view.setUint16(entry, TAG_USER_COMMENT, little)
  view.setUint16(entry + 2, TYPE_UNDEFINED, little)
  view.setUint32(entry + 4, comment.length, little)
  if (inline) {
    tiff.set(comment, entry + 8)
  } else {
    view.setUint32(entry + 8, dataStart, little)
    tiff.set(comment, dataStart)
  }
  view.setUint32(entry + 12, 0, little)
  const length = 2 + EXIF_HEADER.length + tiff.length
  const segment = new Uint8Array(2 + length)
  segment[0] = 0xFF
  segment[1] = 0xE1
  segment[2] = length >> 8
  segment[3] = length & 0xFF
  segment.set(EXIF_HEADER, 4)
  segment.set(tiff, 4 + EXIF_HEADER.length)
  return segment
}

/** 把 APP1 段插到 SOI（及紧随的 APP0）之后；已有 Exif 段则替换 */
export function insertExifSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg.length < 2 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error("insertExifSegment: 不是 JPEG")
  let offset = 2
  let replaceEnd = -1
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xFF) {
    const marker = jpeg[offset + 1]
    const length = (jpeg[offset + 2] << 8) | jpeg[offset + 3]
    if (marker === 0xE0) {
      offset += 2 + length
      continue
    }
    if (marker === 0xE1 && ascii(jpeg, offset + 4, 6) === "Exif\0\0") replaceEnd = offset + 2 + length
    break
  }
  const tail = jpeg.subarray(replaceEnd >= 0 ? replaceEnd : offset)
  const out = new Uint8Array(offset + segment.length + tail.length)
  out.set(jpeg.subarray(0, offset), 0)
  out.set(segment, offset)
  out.set(tail, offset + segment.length)
  return out
}
