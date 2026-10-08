/**
 * 证据包（Evidence Package）与核验报告的类型。
 * 字段与 docs/evidence_package_format.md（format_version 1）一一对应；
 * 节点 payload（data 解析后）只声明核验会读到的键，其余保持 unknown。
 */

export type CheckStatus = "pass" | "fail" | "warn" | "skip"

export type CheckStep = 1 | 2 | 3 | 4

export interface Check {
  /** 稳定 id，如 node.hash.<uuid> / file.sha512.<path> */
  id: string
  step: CheckStep
  title: string
  status: CheckStatus
  detail?: string
  expected?: string
  actual?: string
  subject?: { nodeUuid?: string, filePath?: string }
}

export interface PackageInfo {
  kind: string
  exported_at: string
  exporter: string
  exporter_version: string
  environment: string | null
  allow_missing: boolean
}

export interface InstructionSummary {
  id: number
  sn: string | null
  shipping_sn: string | null
  status: number | null
  date_ship: string | null
  source_city: string | null
  source_address: string | null
  target_city: string | null
  target_address: string | null
  time_picked_up: string | null
  time_delivered: string | null
  transportation: number | null
  device: string | null
  amount: number | null
}

export interface ManifestNode {
  uuid: string
  path: string
  id: number
  created_at: string
  order_id: number
  event_type: string | null
  voided: boolean
}

export interface OrderSummary {
  id: number
  uuid: string
  signed_type: number | null
  signing_way: number | null
  source: number
  time_signed: string | null
  gps_imei: string | null
  jd_erp: string | null
  chained: boolean
  voided: boolean
  voided_at: string | null
  void_reason: string
}

export interface ManifestOrder extends OrderSummary {
  driver_name: string | null
  chain_node_uuid: string | null
  note: "backfill" | "node_missing" | null
}

export interface ManifestLeg {
  index: number
  driver_user_id: number | null
  driver_name: string | null
  imei: string | null
  start_time: string | null
  end_time: string | null
  total_points: number
  /** 段起点 / 终点签收单 id；首版导出可能缺省，核验按位置回退匹配 */
  start_order_id?: number | null
  end_order_id?: number | null
}

export type FileKind = "image" | "signature" | "receipt"

export interface ManifestFile {
  kind: FileKind
  uuid: string
  path: string
  sha512: string
  size: number
  content_type: string
  storage_key: string
  node_uuid: string
  order_id: number
  raw_sha512: string | null
  watermark_text: string | null
  /** 水印第四行的令牌经纬度（WGS-84）；旧证据包 / 无位置的图为 null 或缺省 */
  latitude?: number | null
  longitude?: number | null
  page_count: number | null
  missing: boolean
}

export interface PackageManifest {
  format_version: number
  package: PackageInfo
  instruction: InstructionSummary
  nodes: ManifestNode[]
  orders: ManifestOrder[]
  legs: ManifestLeg[]
  files: ManifestFile[]
  notes: string[]
}

export interface NextNodeHint {
  uuid: string
  created_at: string
  signature: string
  /** 后继节点写链时发到飞书群的消息 id；凭它索取的消息里 signature_prev 应等于本节点哈希 */
  feishu_msg_id?: string | null
}

export interface PackageNode {
  format_version: number
  uuid: string
  id: number
  previous_node_id: number | null
  /** 哈希输入原样字符串：YYYY-MM-DD HH:MM:SS.ffffff */
  created_at: string
  /** 前驱节点哈希；全链首节点为空字符串 */
  prev_signature: string
  signature: string
  feishu_msg_id: string | null
  /** 库内 JSON 原文，逐字节未动；核验只拼接它，绝不重新序列化 */
  data: string
  event_type: string | null
  order: OrderSummary
  next_node: NextNodeHint | null
  files: string[]
}

/** 节点 data 解析后核验会用到的键（旧节点可能缺少其中任意一项） */
export interface NodePayloadImage {
  uuid?: string
  sha512?: string
  raw_sha512?: string | null
  watermark_text?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface NodePayloadGps {
  driver_id?: number
  gps_time?: string | null
  latitude?: number
  longitude?: number
}

export interface NodePayload {
  event_type?: string
  image_phase?: number | null
  images?: NodePayloadImage[]
  signature?: { uuid?: string, sha512?: string } | null
  receipt?: { uuid?: string, sha512?: string, storage_key?: string, page_count?: number } | null
  leg?: { carrier_snapshot?: { id?: number, name?: string | null } | null, start_time?: string | null, end_time?: string | null, imei?: string | null } | null
  gps_locations?: NodePayloadGps[]
  order?: { id?: number, instruction_id?: number, signed_type?: number | null, signing_way?: number | null, time_signed?: string | null, gps_imei?: string | null }
  instruction?: { id?: number, sn?: string | null }
  [key: string]: unknown
}

export interface EvidencePackage {
  manifest: PackageManifest
  /** 按 manifest.nodes 顺序 */
  nodes: PackageNode[]
  /** zip 内路径 → 文件字节；缺失文件（manifest missing=true）不在其中 */
  files: Map<string, Uint8Array>
}

export interface FeishuAnchor {
  uuid: string
  created_at: string
  signature: string
  signature_prev: string
}

/** 通过飞书接口拉取时附带的元数据：发送时间（毫秒）与所在群 */
export interface FeishuMessageMeta {
  sentAtMs: number
  chatId?: string | null
}

export interface VerificationReport {
  format_version: 1
  generated_at: string
  verifier: { name: "verify", version: string }
  package: {
    sn: string | null
    exported_at: string
    exporter_version: string
    node_count: number
    voided_node_count: number
    file_count: number
  }
  checks: Check[]
  summary: Record<CheckStatus, number>
  overall: "pass" | "fail" | "warn"
}
