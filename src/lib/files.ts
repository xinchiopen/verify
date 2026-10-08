import type { Check, EvidencePackage, ManifestFile, NodePayloadImage, PackageNode } from "./types"
/**
 * 步骤 2：证据原件。
 * - 每个文件：SHA-512 实算 vs manifest 声明（后台库内记录）vs 节点 data 内摘要（链上记录）三方一致；
 * - 签单图片：EXIF UserComment 记录（uuid / sn / raw_sha512，可含 latitude / longitude）与节点交叉比对；由记录重建的水印文字（三行，带坐标时四行）与链上 watermark_text 一致；
 * - 电子回执：PDF 页数与 page_count 一致，并列出每页二维码应有的文本 sn|页码|总页数 供目视。
 */
import { parseUserComment } from "./exif"
import { sha512Hex } from "./hash"
import { parseNodePayload, shortHash } from "./payload"
import { buildWatermarkText } from "./watermark"

function nodeOf(pkg: EvidencePackage, file: ManifestFile): PackageNode | undefined {
  return pkg.nodes.find(node => node.uuid === file.node_uuid)
}

function chainImage(pkg: EvidencePackage, file: ManifestFile): NodePayloadImage | undefined {
  const node = nodeOf(pkg, file)
  const payload = node ? parseNodePayload(node) : null
  return payload?.images?.find(image => image.uuid === file.uuid)
}

function chainDigest(pkg: EvidencePackage, file: ManifestFile): string | undefined {
  const node = nodeOf(pkg, file)
  const payload = node ? parseNodePayload(node) : null
  if (!payload) return undefined
  if (file.kind === "image") return payload.images?.find(image => image.uuid === file.uuid)?.sha512
  if (file.kind === "signature") return payload.signature?.sha512 ?? undefined
  return payload.receipt?.sha512 ?? undefined
}

const KIND_TITLE: Record<ManifestFile["kind"], string> = { image: "签单图片摘要", signature: "手写签名摘要", receipt: "电子回执摘要" }

export async function verifyFileDigests(pkg: EvidencePackage): Promise<Check[]> {
  const checks: Check[] = []
  for (const file of pkg.manifest.files) {
    const id = `file.sha512.${file.path}`
    const subject = { filePath: file.path, nodeUuid: file.node_uuid }
    const title = KIND_TITLE[file.kind] ?? "文件摘要"
    if (file.missing) {
      checks.push({ id, step: 2, title, status: "fail", detail: "导出时对象存储中已找不到该文件，证据包内没有它的原件", expected: file.sha512, subject })
      continue
    }
    const bytes = pkg.files.get(file.path)
    if (!bytes) {
      checks.push({ id, step: 2, title, status: "fail", detail: "清单声明了该文件，但证据包内没有它", expected: file.sha512, subject })
      continue
    }
    const actual = await sha512Hex(bytes)
    const onChain = chainDigest(pkg, file)
    const manifestOk = actual === file.sha512
    const chainOk = onChain === undefined ? null : actual === onChain
    const parts = [`文件实算 ${shortHash(actual)}`, `清单（库内）${shortHash(file.sha512)}`, `链上 ${onChain === undefined ? "（节点未记录）" : shortHash(onChain)}`]
    if (manifestOk && chainOk) {
      checks.push({ id, step: 2, title, status: "pass", detail: `三方一致：${parts.join(" / ")}`, expected: file.sha512, actual, subject })
    } else if (manifestOk && chainOk === null) {
      checks.push({ id, step: 2, title, status: "warn", detail: `与清单一致，但节点原文里没有该文件的摘要，无法与链上记录比对：${parts.join(" / ")}`, expected: file.sha512, actual, subject })
    } else {
      const reasons = [!manifestOk ? "与清单（库内记录）不一致" : null, chainOk === false ? "与链上记录不一致" : null].filter(Boolean).join("，")
      checks.push({ id, step: 2, title, status: "fail", detail: `${reasons}：${parts.join(" / ")}`, expected: onChain ?? file.sha512, actual, subject })
    }
  }
  return checks
}

export function verifyImageExif(pkg: EvidencePackage): Check[] {
  const checks: Check[] = []
  const sn = pkg.manifest.instruction.sn ?? ""
  for (const file of pkg.manifest.files.filter(item => item.kind === "image")) {
    const subject = { filePath: file.path, nodeUuid: file.node_uuid }
    const exifId = `file.exif.${file.uuid}`
    const textId = `file.watermark_text.${file.uuid}`
    const image = chainImage(pkg, file)
    const bytes = pkg.files.get(file.path)
    const record = bytes ? parseUserComment(bytes) : null
    const legacy = !image?.raw_sha512
    if (!bytes) {
      checks.push({ id: exifId, step: 2, title: "图片 EXIF 记录", status: "skip", detail: "证据包内没有该文件，无法读取 EXIF", subject })
      checks.push({ id: textId, step: 2, title: "水印文字", status: "skip", detail: "证据包内没有该文件", subject })
      continue
    }
    if (!record) {
      if (legacy) {
        checks.push({ id: exifId, step: 2, title: "图片 EXIF 记录", status: "skip", detail: "水印功能上线前的旧图：图片无 EXIF 记录，链上也无 raw_sha512，仅凭 SHA-512 核验", subject })
        checks.push({ id: textId, step: 2, title: "水印文字", status: "skip", detail: "旧图没有水印文字记录", subject })
      } else {
        checks.push({ id: exifId, step: 2, title: "图片 EXIF 记录", status: "fail", detail: "链上记录该图带 EXIF 记录（有 raw_sha512），但文件里读不到：图片可能被重新保存或替换", subject })
        checks.push({ id: textId, step: 2, title: "水印文字", status: "skip", detail: "没有 EXIF 记录，无法重建水印文字", subject })
      }
      continue
    }
    const mismatches: string[] = []
    if (String(record.uuid ?? "") !== file.uuid) mismatches.push(`图片编号 ${String(record.uuid)} ≠ ${file.uuid}`)
    if (String(record.sn ?? "") !== sn) mismatches.push(`申请单号 ${String(record.sn)} ≠ ${sn}`)
    if (image?.raw_sha512 && String(record.raw_sha512 ?? "") !== image.raw_sha512) mismatches.push("原图摘要 raw_sha512 与链上不一致")
    const latitude = typeof record.latitude === "string" ? record.latitude : null
    const longitude = typeof record.longitude === "string" ? record.longitude : null
    const coordinates = latitude && longitude ? `，经纬度 ${latitude}, ${longitude}` : ""
    const summary = `EXIF 记录：图片编号 ${String(record.uuid)}，申请单号 ${String(record.sn)}，上传时间 ${String(record.uploaded_at)}，原图摘要 ${shortHash(String(record.raw_sha512 ?? ""))}${coordinates}`
    checks.push({ id: exifId, step: 2, title: "图片 EXIF 记录", status: mismatches.length ? "fail" : "pass", detail: mismatches.length ? `${mismatches.join("；")}。${summary}` : `与链上 images[] 及运单申请单号一致。${summary}`, subject })
    if (!image?.watermark_text) {
      checks.push({ id: textId, step: 2, title: "水印文字", status: "skip", detail: "链上没有该图的水印文字记录", subject })
    } else {
      const rebuilt = buildWatermarkText({ sn: String(record.sn ?? ""), uploadedAt: String(record.uploaded_at ?? ""), uuid: String(record.uuid ?? ""), latitude, longitude })
      const ok = rebuilt === image.watermark_text
      checks.push({ id: textId, step: 2, title: "水印文字", status: ok ? "pass" : "fail", detail: ok ? "由 EXIF 记录重建的水印文字与链上 watermark_text 一致；图上可见文字请目视核对" : "由 EXIF 记录重建的水印文字与链上 watermark_text 不一致", expected: image.watermark_text, actual: rebuilt, subject })
    }
  }
  return checks
}

export function expectedQrTexts(sn: string, pages: number): string[] {
  return Array.from({ length: Math.max(0, pages) }, (_, index) => `${sn}|${index + 1}|${pages}`)
}

/** 启发式数页：/Type /Page 对象数与 /Count 声明；reportlab 产物两者都明文可读。 */
export function countPdfPages(bytes: Uint8Array): { pageObjects: number, declaredCount: number | null } {
  const text = new TextDecoder("latin1").decode(bytes)
  const pageObjects = (text.match(/\/Type\s*\/Page\b/g) ?? []).length
  let declaredCount: number | null = null
  for (const match of text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)) {
    declaredCount = Math.max(declaredCount ?? 0, Number(match[1]))
  }
  if (declaredCount === null) {
    for (const match of text.matchAll(/\/Count\s+(\d+)/g)) declaredCount = Math.max(declaredCount ?? 0, Number(match[1]))
  }
  return { pageObjects, declaredCount }
}

export function verifyReceipt(pkg: EvidencePackage): Check[] {
  const checks: Check[] = []
  const sn = pkg.manifest.instruction.sn ?? ""
  for (const file of pkg.manifest.files.filter(item => item.kind === "receipt")) {
    const id = `file.receipt.page_count.${file.uuid}`
    const subject = { filePath: file.path, nodeUuid: file.node_uuid }
    const bytes = pkg.files.get(file.path)
    const node = nodeOf(pkg, file)
    const onChain = node ? parseNodePayload(node)?.receipt?.page_count : undefined
    const declared = file.page_count ?? onChain ?? null
    if (!bytes || declared === null) {
      checks.push({ id, step: 2, title: "电子回执页数", status: "skip", detail: bytes ? "清单与链上都没有页数记录" : "证据包内没有该文件", subject })
      continue
    }
    const { pageObjects, declaredCount } = countPdfPages(bytes)
    const qr = expectedQrTexts(sn, declared).join("、")
    const chainNote = onChain !== undefined && onChain !== file.page_count ? `；链上记录页数 ${onChain} 与清单 ${file.page_count} 不一致` : ""
    if (pageObjects === declared && (declaredCount === null || declaredCount === declared) && !chainNote) {
      checks.push({ id, step: 2, title: "电子回执页数", status: "pass", detail: `PDF 共 ${pageObjects} 页，与记录一致。每页二维码应为：${qr}（请在预览中目视核对）`, expected: String(declared), actual: String(pageObjects), subject })
    } else if (pageObjects === declared) {
      checks.push({ id, step: 2, title: "电子回执页数", status: "warn", detail: `页对象数 ${pageObjects} 与记录一致，但 PDF 内 /Count 声明为 ${declaredCount}${chainNote}。每页二维码应为：${qr}`, expected: String(declared), actual: String(pageObjects), subject })
    } else {
      checks.push({ id, step: 2, title: "电子回执页数", status: "fail", detail: `PDF 内有 ${pageObjects} 个页对象，记录页数为 ${declared}${chainNote}`, expected: String(declared), actual: String(pageObjects), subject })
    }
  }
  return checks
}
