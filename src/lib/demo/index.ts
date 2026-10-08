import type { EvidencePackage, ManifestFile, ManifestLeg, ManifestNode, ManifestOrder, OrderSummary, PackageManifest, PackageNode } from "../types"
import type { DemoGpsPoint, DemoInstruction, DemoPerson } from "./payload"
/**
 * 现场生成演示证据包：提货（司机甲）→ 接力（甲 → 乙）→ 送货（乙），三节点、三张带 EXIF 记录的签单图、两份手写签名、一份两页回执。
 * 节点原文经 pyJsonDumps 复刻 Python 序列化，哈希用与真实链相同的公式；前驱 / 后继故意指向「其他运单」的节点，
 * 让核验结果与真实证据包一样出现「跳过」。只用于教学与篡改实验，不是任何真实运单。
 */
import { strToU8, zipSync } from "fflate"
import { buildExifSegment, encodeUserComment, insertExifSegment } from "../exif"
import { sha512Hex, sha512HexOfText } from "../hash"
import { computeNodeSignature } from "../node"
import { pyJsonDumps } from "../pyjson"
import { buildWatermarkLines } from "../watermark"
import { deviceRows, gpsRow, instructionSnapshot, orderSnapshot, personSnapshot } from "./payload"
import { tinyPdf } from "./pdf"
import { signaturePng } from "./png"

export const DEMO_SN = "SR-DEMO-0001"

export interface JpegSpec {
  width: number
  height: number
  background: string
  /** 左下角水印文字（三行 + 经纬度行） */
  lines: string[]
  caption: string
}

/** 浏览器用 canvas 实现；Node 测试返回内嵌的小 JPEG */
export type JpegEncoder = (spec: JpegSpec) => Promise<Uint8Array>

export interface DemoOptions {
  jpegEncoder: JpegEncoder
  /** 演示的「今天」；默认当前时间 */
  now?: Date
  /** 随机种子：同种子同时钟 → 同一条链 */
  seed?: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function uuidFrom(random: () => number): string {
  const bytes = new Uint8Array(16)
  for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(random() * 256)
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const pad = (value: number) => String(value).padStart(2, "0")

function fmt(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function fmtMicro(date: Date, micro: number): string {
  return `${fmt(date)}.${String(micro).padStart(6, "0")}`
}

function at(base: Date, dayOffset: number, hour: number, minute = 0, second = 0): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, minute, second)
}

function route(from: [number, number], to: [number, number], count: number, driverId: number, start: Date, end: Date, firstId: number, random: () => number): DemoGpsPoint[] {
  const points: DemoGpsPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1)
    const wobble = Math.sin(t * Math.PI * 2) * 0.004
    points.push({
      id: firstId + index,
      driverId,
      lat: Number((from[0] + (to[0] - from[0]) * t + wobble).toFixed(6)),
      lng: Number((from[1] + (to[1] - from[1]) * t - wobble).toFixed(6)),
      speed: Number((30 + random() * 25).toFixed(1)),
      direction: Number((random() * 360).toFixed(1)),
      time: fmt(new Date(start.getTime() + (end.getTime() - start.getTime()) * t))
    })
  }
  return points
}

interface DemoFile extends ManifestFile {
  bytes: Uint8Array
}

async function demoImage(encoder: JpegEncoder, random: () => number, inst: DemoInstruction, uploadedAt: Date, background: string, caption: string, nodeUuid: string, orderId: number, position: [number, number]): Promise<{ file: DemoFile, chain: Record<string, unknown> }> {
  const uuid = uuidFrom(random)
  const uploaded = fmt(uploadedAt)
  // 与服务端一致：EXIF 记录与可见水印用 6 位小数字符串，链上 images[] 存该字符串对应的数值
  const latitude = position[0].toFixed(6)
  const longitude = position[1].toFixed(6)
  const lines = buildWatermarkLines({ sn: inst.sn, uploadedAt: uploaded, uuid, latitude, longitude })
  const raw = await encoder({ width: 640, height: 480, background, lines, caption })
  const rawSha512 = await sha512Hex(raw)
  const jpeg = insertExifSegment(raw, buildExifSegment(encodeUserComment({ uuid, sn: inst.sn, uploaded_at: uploaded, raw_sha512: rawSha512, latitude, longitude })))
  const sha512 = await sha512Hex(jpeg)
  const watermarkText = lines.join("\n")
  return {
    file: { kind: "image", uuid, path: `files/images/${uuid}.jpg`, sha512, size: jpeg.length, content_type: "image/jpeg", storage_key: `carrier/images/${uuid}.jpg`, node_uuid: nodeUuid, order_id: orderId, raw_sha512: rawSha512, watermark_text: watermarkText, latitude: Number(latitude), longitude: Number(longitude), page_count: null, missing: false, bytes: jpeg },
    chain: { uuid, sha512, raw_sha512: rawSha512, watermark_text: watermarkText, latitude: Number(latitude), longitude: Number(longitude) }
  }
}

export async function buildDemoEvidencePackage(options: DemoOptions): Promise<EvidencePackage> {
  const now = options.now ?? new Date()
  const random = mulberry32(options.seed ?? Math.floor(Math.random() * 2 ** 31))
  const base = at(now, -1, 0)
  const inst: DemoInstruction = {
    id: 20260001,
    sn: DEMO_SN,
    shippingSn: "SHIP-DEMO-0001",
    dateShip: fmt(base).slice(0, 10),
    sourceCity: "上海",
    sourceAddress: "浦东新区演示路 1 号",
    source: [31.2304, 121.4737],
    targetCity: "上海",
    targetAddress: "闵行区示例路 2 号",
    target: [31.1124, 121.3819],
    createdAt: fmt(at(base, -1, 8))
  }
  const driverA: DemoPerson = { id: 1001, name: "演示司机甲", phone: "138****0001", idCardMasked: "110***********1234" }
  const driverB: DemoPerson = { id: 1002, name: "演示司机乙", phone: "138****0002", idCardMasked: null }
  const scanner: DemoPerson = { id: 2001, name: "演示收发货人", phone: "139****0009", idCardMasked: null }
  const t1 = at(base, 0, 9, 0, 0)
  const t2 = at(base, 0, 15, 0, 0)
  const t3 = at(base, 1, 10, 0, 0)
  const imeiA = "IMEI-DEMO-A-0001"
  const imeiB = "IMEI-DEMO-B-0002"
  const legAPoints = route(inst.source, [31.17, 121.43], 12, driverA.id, t1, t2, 1, random)
  const legBPoints = route([31.17, 121.43], inst.target, 14, driverB.id, t2, t3, 13, random)
  const foreignPrev = await sha512HexOfText(`demo-foreign-prev-${options.seed ?? 0}`)
  const steps: Array<{ kind: "pickup" | "relay" | "delivery", signedType: 1 | 2 | 3, eventType: "driver_sign" | "driver_relay", phase: 4 | 5 | 6, time: Date, driver: DemoPerson, signer: DemoPerson, imei: string, background: string, caption: string, position: [number, number] }> = [
    { kind: "pickup", signedType: 1, eventType: "driver_sign", phase: 4, time: t1, driver: driverA, signer: scanner, imei: imeiA, background: "#b8543f", caption: "提货现场照片（演示）", position: inst.source },
    { kind: "relay", signedType: 3, eventType: "driver_relay", phase: 6, time: t2, driver: driverB, signer: driverA, imei: imeiB, background: "#4f7f5a", caption: "接力交接照片（演示）", position: [31.17, 121.43] },
    { kind: "delivery", signedType: 2, eventType: "driver_sign", phase: 5, time: t3, driver: driverB, signer: scanner, imei: imeiB, background: "#3f5f8f", caption: "送货签收照片（演示）", position: inst.target }
  ]
  const nodes: PackageNode[] = []
  const files: DemoFile[] = []
  const orders: ManifestOrder[] = []
  let prevSignature = foreignPrev
  let nodeId = 880001
  for (const [index, step] of steps.entries()) {
    const orderId = 55001 + index
    const nodeUuid = uuidFrom(random)
    const orderUuid = uuidFrom(random)
    const timeSigned = fmt(step.time)
    const createdAt = fmtMicro(new Date(step.time.getTime() + 3000), 100000 + Math.floor(random() * 899999))
    const image = await demoImage(options.jpegEncoder, random, inst, new Date(step.time.getTime() - 60000), step.background, step.caption, nodeUuid, orderId, step.position)
    files.push(image.file)
    let signature: Record<string, unknown> | null = null
    if (step.kind !== "relay") {
      const png = signaturePng(index + (options.seed ?? 0))
      const uuid = uuidFrom(random)
      const sha512 = await sha512Hex(png)
      files.push({ kind: "signature", uuid, path: `files/signatures/${uuid}.png`, sha512, size: png.length, content_type: "image/png", storage_key: `carrier/signatures/${uuid}.png`, node_uuid: nodeUuid, order_id: orderId, raw_sha512: null, watermark_text: null, page_count: null, missing: false, bytes: png })
      signature = { uuid, sha512 }
    }
    let receipt: Record<string, unknown> | null = null
    if (step.kind === "delivery") {
      const pdf = tinyPdf([
        ["Demo receipt (not a real document)", `SN: ${inst.sn}`, `Pickup: ${fmt(t1)}  Relay: ${fmt(t2)}  Delivery: ${fmt(t3)}`, `QR text on this page: ${inst.sn}|1|2`],
        ["Devices: DEV-DEMO-0001 x2", `QR text on this page: ${inst.sn}|2|2`]
      ])
      const uuid = uuidFrom(random)
      const sha512 = await sha512Hex(pdf)
      files.push({ kind: "receipt", uuid, path: `files/receipts/${uuid}.pdf`, sha512, size: pdf.length, content_type: "application/pdf", storage_key: `carrier/receipts/${uuid}.pdf`, node_uuid: nodeUuid, order_id: orderId, raw_sha512: null, watermark_text: null, page_count: 2, missing: false, bytes: pdf })
      receipt = { uuid, sha512, storage_key: `carrier/receipts/${uuid}.pdf`, page_count: 2 }
    }
    const status = step.kind === "delivery" ? 5 : 4
    const gps = step.kind === "pickup" ? [] : step.kind === "relay" ? legAPoints : [...legAPoints, ...legBPoints]
    const payload: Record<string, unknown> = {
      devices: deviceRows(inst),
      event_type: step.eventType,
      gps_locations: gps.map(point => gpsRow(point, inst)),
      image_phase: step.phase,
      images: [image.chain],
      instruction: instructionSnapshot(inst, status, fmt(t1), step.kind === "delivery" ? fmt(t3) : null, createdAt.slice(0, 19)),
      instruction_assignments: { delivery: [], pickup: [] },
      instruction_vehicle_drivers: { delivery: [], pickup: [] },
      no_sign_image: false,
      order: orderSnapshot({ id: orderId, uuid: orderUuid, instructionId: inst.id, driverId: step.driver.id, signerId: step.signer.id, signedType: step.signedType, gpsImei: step.imei, scene: `DEMO-${step.signedType}-${index}`, timeScanned: fmt(new Date(step.time.getTime() - 90000)), timeSigned, createdAt: createdAt.slice(0, 19) }),
      order_driver_snapshot: personSnapshot(step.driver),
      order_signer_snapshot: personSnapshot(step.signer),
      signature,
      so_relation: { so_other_list: [], so_requirement_list: [{ order_id: 9001, sn: "ID_SYD_DEMO" }], so_source_list: [], so_target_list: [] }
    }
    if (step.kind === "relay") payload.leg = { carrier_snapshot: personSnapshot(driverA), end_time: timeSigned, imei: imeiA, start_time: fmt(t1) }
    if (receipt) payload.receipt = receipt
    const data = pyJsonDumps(payload)
    const nodeSignature = await computeNodeSignature({ uuid: nodeUuid, created_at: createdAt, prev_signature: prevSignature, data })
    const orderSummary: OrderSummary = { id: orderId, uuid: orderUuid, signed_type: step.signedType, signing_way: 2, source: 1, time_signed: timeSigned, gps_imei: step.imei, jd_erp: null, chained: true, voided: false, voided_at: null, void_reason: "" }
    nodes.push({
      format_version: 1,
      uuid: nodeUuid,
      id: nodeId,
      previous_node_id: nodeId - 1,
      created_at: createdAt,
      prev_signature: prevSignature,
      signature: nodeSignature,
      feishu_msg_id: `om_demo_${index + 1}`,
      data,
      event_type: step.eventType,
      order: orderSummary,
      next_node: null,
      files: files.filter(file => file.node_uuid === nodeUuid).map(file => file.path)
    })
    orders.push({ ...orderSummary, driver_name: step.driver.name, chain_node_uuid: nodeUuid, note: null })
    prevSignature = nodeSignature
    nodeId += 1
  }
  for (let index = 0; index < nodes.length - 1; index += 1) {
    nodes[index].next_node = { uuid: nodes[index + 1].uuid, created_at: nodes[index + 1].created_at, signature: nodes[index + 1].signature }
  }
  nodes[nodes.length - 1].next_node = { uuid: uuidFrom(random), created_at: fmtMicro(new Date(t3.getTime() + 125000), 420042), signature: await sha512HexOfText(`demo-foreign-next-${options.seed ?? 0}`), feishu_msg_id: "om_demo_4" }
  const legs: ManifestLeg[] = [
    { index: 1, driver_user_id: driverA.id, driver_name: driverA.name, imei: imeiA, start_time: fmt(t1), end_time: fmt(t2), total_points: legAPoints.length },
    { index: 2, driver_user_id: driverB.id, driver_name: driverB.name, imei: imeiB, start_time: fmt(t2), end_time: fmt(t3), total_points: legBPoints.length }
  ]
  const manifestNodes: ManifestNode[] = nodes.map(node => ({ uuid: node.uuid, path: `nodes/${node.uuid}.json`, id: node.id, created_at: node.created_at, order_id: node.order.id, event_type: node.event_type, voided: false }))
  const manifest: PackageManifest = {
    format_version: 1,
    package: { kind: "siroute-evidence-package", exported_at: fmt(now), exporter: "verify demo builder", exporter_version: "demo", environment: "DEMO", allow_missing: false },
    instruction: { id: inst.id, sn: inst.sn, shipping_sn: inst.shippingSn, status: 5, date_ship: inst.dateShip, source_city: inst.sourceCity, source_address: inst.sourceAddress, target_city: inst.targetCity, target_address: inst.targetAddress, time_picked_up: fmt(t1), time_delivered: fmt(t3), transportation: 1, device: "服务器整机", amount: 2 },
    nodes: manifestNodes,
    orders,
    legs,
    files: files.map(({ bytes: _bytes, ...entry }) => entry),
    notes: []
  }
  return { manifest, nodes, files: new Map(files.map(file => [file.path, file.bytes])) }
}

/** 把内存里的证据包打成 zip（与后端 zip 布局一致），供「下载演示证据包」再拖进 /verify 形成闭环 */
export function buildDemoZip(pkg: EvidencePackage): Uint8Array {
  const entries: Record<string, Uint8Array> = { "manifest.json": strToU8(JSON.stringify(pkg.manifest, null, 2)) }
  for (const node of pkg.nodes) entries[`nodes/${node.uuid}.json`] = strToU8(JSON.stringify(node, null, 2))
  for (const [path, bytes] of pkg.files) entries[path] = bytes
  return zipSync(entries)
}
