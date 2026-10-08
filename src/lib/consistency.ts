import type { Check, EvidencePackage, ManifestLeg, NodePayload, PackageNode } from "./types"
/**
 * 步骤 3：业务一致性（跨节点）。只用有效签收单（未作废）推导事件序列与运输段；缺键的旧节点一律 skip。
 */
import { imageUuidFromPath, parseChainTime, parseNodePayload } from "./payload"

const WINDOW_TOLERANCE_MS = 60 * 1000
const PHASE_RULES: Array<[string, number, number, string]> = [
  ["driver_sign", 1, 4, "提货"],
  ["driver_sign", 2, 5, "送货"],
  ["driver_relay", 3, 6, "接力"]
]
const SIGNED_TYPE_TEXT: Record<number, string> = { 1: "提货单", 2: "签收单", 3: "接力单" }

function sortKey(node: PackageNode): [number, number] {
  return [parseChainTime(node.order.time_signed) ?? 0, node.id]
}

function effectiveNodes(pkg: EvidencePackage): PackageNode[] {
  return pkg.nodes.filter(node => !node.order.voided).sort((a, b) => {
    const [ta, ia] = sortKey(a)
    const [tb, ib] = sortKey(b)
    return ta - tb || ia - ib
  })
}

function checkEventPhase(node: PackageNode, payload: NodePayload | null): Check {
  const id = `consistency.event_phase.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  const eventType = payload?.event_type ?? node.event_type
  const signedType = payload?.order?.signed_type ?? node.order.signed_type
  const phase = payload?.image_phase
  if (!payload || eventType == null || signedType == null || phase === undefined) {
    return { id, step: 3, title: "事件类型 / 单据类型 / 照片场景", status: "skip", detail: "节点缺少 event_type / order.signed_type / image_phase 之一（旧节点），不作判定", subject }
  }
  if (eventType === "admin_backfill_sign") {
    return { id, step: 3, title: "事件类型 / 单据类型 / 照片场景", status: "warn", detail: "历史后台补录节点（admin_backfill_sign）：现行规则下补录不再上链，此类节点不是司机现场签收", subject }
  }
  const rule = PHASE_RULES.find(([type, signed, imagePhase]) => type === eventType && signed === signedType && imagePhase === phase)
  const actual = `${eventType} / ${SIGNED_TYPE_TEXT[signedType] ?? signedType} / image_phase ${String(phase)}`
  return rule
    ? { id, step: 3, title: "事件类型 / 单据类型 / 照片场景", status: "pass", detail: `${rule[3]}节点三者对应：${actual}`, actual, subject }
    : { id, step: 3, title: "事件类型 / 单据类型 / 照片场景", status: "fail", detail: `三者不构成合法组合：${actual}（合法组合：driver_sign/提货单/4、driver_sign/签收单/5、driver_relay/接力单/6）`, actual, subject }
}

function checkOrderRef(pkg: EvidencePackage, node: PackageNode, payload: NodePayload | null): Check {
  const id = `consistency.order_ref.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  if (!payload?.order) return { id, step: 3, title: "节点归属", status: "skip", detail: "节点原文缺少 order 快照", subject }
  const problems: string[] = []
  if (payload.order.id !== undefined && payload.order.id !== node.order.id) problems.push(`原文 order.id ${String(payload.order.id)} ≠ 清单签收单 ${node.order.id}`)
  if (payload.order.instruction_id !== undefined && payload.order.instruction_id !== pkg.manifest.instruction.id) problems.push(`原文 order.instruction_id ${String(payload.order.instruction_id)} ≠ 运单 ${pkg.manifest.instruction.id}`)
  if (payload.instruction?.sn !== undefined && payload.instruction.sn !== pkg.manifest.instruction.sn) problems.push(`原文申请单号 ${String(payload.instruction.sn)} ≠ ${String(pkg.manifest.instruction.sn)}`)
  return problems.length
    ? { id, step: 3, title: "节点归属", status: "fail", detail: problems.join("；"), subject }
    : { id, step: 3, title: "节点归属", status: "pass", detail: "节点原文中的签收单 id、运单 id 与申请单号都指向本证据包的运单", subject }
}

function checkSignTimeMonotonic(effective: PackageNode[]): Check {
  const id = "consistency.sign_time_monotonic"
  if (!effective.length) return { id, step: 3, title: "签收事件序列", status: "skip", detail: "没有有效签收单" }
  const types = effective.map(node => node.order.signed_type ?? 0)
  const sequenceOk = /^1?3*2?$/.test(types.join(""))
  let increasing = true
  let chainAfterSign = true
  for (let index = 0; index < effective.length; index += 1) {
    const signed = parseChainTime(effective[index].order.time_signed)
    const chained = parseChainTime(effective[index].created_at)
    if (index > 0 && signed !== null && (parseChainTime(effective[index - 1].order.time_signed) ?? 0) >= signed) increasing = false
    if (signed !== null && chained !== null && chained < signed) chainAfterSign = false
  }
  const sequence = types.map(type => SIGNED_TYPE_TEXT[type] ?? String(type)).join(" → ")
  if (!sequenceOk) return { id, step: 3, title: "签收事件序列", status: "fail", detail: `有效签收单顺序不合法：${sequence}（应为 提货单 → 接力单… → 签收单）` }
  if (!increasing) return { id, step: 3, title: "签收事件序列", status: "fail", detail: `签单时间不是严格递增：${sequence}` }
  if (!chainAfterSign) return { id, step: 3, title: "签收事件序列", status: "warn", detail: `存在上链时间早于签单时间的节点（同一请求内应先取签单时间再写链）：${sequence}` }
  return { id, step: 3, title: "签收事件序列", status: "pass", detail: `有效签收单按 ${sequence} 依次发生，签单时间递增，上链时间不早于签单时间` }
}

function checkReceiptOnlyDelivery(pkg: EvidencePackage): Check {
  const id = "consistency.receipt_only_delivery"
  const offenders: string[] = []
  for (const node of pkg.nodes) {
    const payload = parseNodePayload(node)
    if (!payload) continue
    const hasReceipt = Boolean(payload.receipt)
    const isDelivery = payload.event_type === "driver_sign" && (payload.order?.signed_type ?? node.order.signed_type) === 2
    if (hasReceipt && !isDelivery) offenders.push(`${node.uuid} 不是送货签收却带回执`)
    if (!hasReceipt && isDelivery && "receipt" in payload) offenders.push(`${node.uuid} 是送货签收却没有回执`)
  }
  return offenders.length
    ? { id, step: 3, title: "回执只随送货签收上链", status: "fail", detail: offenders.join("；") }
    : { id, step: 3, title: "回执只随送货签收上链", status: "pass", detail: "只有送货签收节点携带电子回执摘要" }
}

function checkSignatureRule(node: PackageNode, payload: NodePayload | null): Check {
  const id = `consistency.signature_rule.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  if (!payload || !("signature" in payload)) return { id, step: 3, title: "手写签名规则", status: "skip", detail: "节点原文没有 signature 键（旧节点）", subject }
  const signingWay = payload.order?.signing_way ?? node.order.signing_way
  const signedType = payload.order?.signed_type ?? node.order.signed_type
  const has = Boolean(payload.signature)
  if (signingWay === 2 && (signedType === 1 || signedType === 2)) {
    return has
      ? { id, step: 3, title: "手写签名规则", status: "pass", detail: "小程序码签收，收发货人手写签名已随节点上链", subject }
      : { id, step: 3, title: "手写签名规则", status: "warn", detail: "小程序码签收但没有手写签名：服务端可配置关闭签名要求，请结合业务确认", subject }
  }
  return has
    ? { id, step: 3, title: "手写签名规则", status: "warn", detail: "京东通行码签收或接力节点按规则不应有手写签名，但节点带了签名摘要", subject }
    : { id, step: 3, title: "手写签名规则", status: "pass", detail: signedType === 3 ? "接力节点不涉及手写签名" : "京东通行码签收不涉及手写签名", subject }
}

function legStartNodes(effective: PackageNode[]): PackageNode[] {
  const pickup = effective.find(node => node.order.signed_type === 1)
  const relays = effective.filter(node => node.order.signed_type === 3)
  const delivery = [...effective].reverse().find(node => node.order.signed_type === 2)
  if (!delivery) return []
  return pickup ? [pickup, ...relays] : [delivery]
}

function checkLegs(pkg: EvidencePackage, effective: PackageNode[]): Check[] {
  const checks: Check[] = []
  const delivery = [...effective].reverse().find(node => node.order.signed_type === 2)
  const points = delivery ? parseNodePayload(delivery)?.gps_locations : undefined
  const starts = legStartNodes(effective)
  pkg.manifest.legs.forEach((leg: ManifestLeg, index) => {
    const gpsId = `consistency.gps_window.${leg.index}`
    const imeiId = `consistency.leg_imei.${leg.index}`
    const start = parseChainTime(leg.start_time)
    const end = parseChainTime(leg.end_time)
    if (!delivery || !points) {
      checks.push({ id: gpsId, step: 3, title: `第 ${leg.index} 段轨迹时间窗`, status: "skip", detail: "没有送货签收节点或节点原文无 gps_locations，无法核对" })
    } else if (start === null || end === null) {
      checks.push({ id: gpsId, step: 3, title: `第 ${leg.index} 段轨迹时间窗`, status: "skip", detail: "运输段缺少起止时间" })
    } else {
      const legPoints = points.filter(point => leg.driver_user_id === null || point.driver_id === leg.driver_user_id)
      const outside = legPoints.filter((point) => {
        const time = parseChainTime(point.gps_time)
        return time !== null && (time < start - WINDOW_TOLERANCE_MS || time > end + WINDOW_TOLERANCE_MS)
      })
      if (!legPoints.length) {
        checks.push({ id: gpsId, step: 3, title: `第 ${leg.index} 段轨迹时间窗`, status: "warn", detail: `送货节点原文中没有该段司机（${leg.driver_name ?? leg.driver_user_id ?? "未知"}）的轨迹点` })
      } else if (outside.length) {
        checks.push({ id: gpsId, step: 3, title: `第 ${leg.index} 段轨迹时间窗`, status: "fail", detail: `该段司机的 ${legPoints.length} 个轨迹点中有 ${outside.length} 个落在段窗口 ${leg.start_time} ~ ${leg.end_time} 之外（容差 60 秒）` })
      } else {
        checks.push({ id: gpsId, step: 3, title: `第 ${leg.index} 段轨迹时间窗`, status: "pass", detail: `该段司机的 ${legPoints.length} 个轨迹点全部落在 ${leg.start_time} ~ ${leg.end_time} 内` })
      }
    }
    const startNode = leg.start_order_id != null ? effective.find(node => node.order.id === leg.start_order_id) : starts[index]
    if (!startNode) {
      checks.push({ id: imeiId, step: 3, title: `第 ${leg.index} 段令牌`, status: "skip", detail: leg.start_order_id != null ? `该段起点签收单 #${leg.start_order_id} 不在证据包的链节点中（后台补录单或未关联节点），无法核对令牌` : "找不到该段的起点签收单" })
    } else if (!leg.imei && !startNode.order.gps_imei) {
      checks.push({ id: imeiId, step: 3, title: `第 ${leg.index} 段令牌`, status: "skip", detail: "该段与起点签收单都没有记录令牌 IMEI" })
    } else if (leg.imei === startNode.order.gps_imei) {
      checks.push({ id: imeiId, step: 3, title: `第 ${leg.index} 段令牌`, status: "pass", detail: `运输段令牌 ${leg.imei} 与起点签收单（${SIGNED_TYPE_TEXT[startNode.order.signed_type ?? 0] ?? ""}）记录的签单令牌一致`, expected: startNode.order.gps_imei ?? "", actual: leg.imei ?? "" })
    } else {
      checks.push({ id: imeiId, step: 3, title: `第 ${leg.index} 段令牌`, status: "fail", detail: `运输段令牌 ${String(leg.imei)} 与起点签收单记录的签单令牌 ${String(startNode.order.gps_imei)} 不一致`, expected: startNode.order.gps_imei ?? "", actual: leg.imei ?? "" })
    }
  })
  return checks
}

function checkImagesDeclared(node: PackageNode, payload: NodePayload | null): Check {
  const id = `consistency.images_declared.${node.uuid}`
  const subject = { nodeUuid: node.uuid }
  if (!payload?.images) return { id, step: 3, title: "图片清单对应", status: "skip", detail: "节点原文没有 images 键（旧节点）", subject }
  const declared = new Set(payload.images.map(image => image.uuid).filter((uuid): uuid is string => Boolean(uuid)))
  const packaged = new Set(node.files.map(imageUuidFromPath).filter((uuid): uuid is string => Boolean(uuid)))
  const missing = [...declared].filter(uuid => !packaged.has(uuid))
  const extra = [...packaged].filter(uuid => !declared.has(uuid))
  if (!missing.length && !extra.length) {
    return { id, step: 3, title: "图片清单对应", status: "pass", detail: `节点原文声明的 ${declared.size} 张图片与证据包内该节点的图片一一对应`, subject }
  }
  const parts = [missing.length ? `链上声明但包内没有：${missing.join("、")}` : null, extra.length ? `包内有但链上未声明：${extra.join("、")}` : null].filter(Boolean)
  return { id, step: 3, title: "图片清单对应", status: "fail", detail: parts.join("；"), subject }
}

export function verifyConsistency(pkg: EvidencePackage): Check[] {
  const checks: Check[] = []
  const effective = effectiveNodes(pkg)
  for (const node of pkg.nodes) {
    const payload = parseNodePayload(node)
    checks.push(checkEventPhase(node, payload))
    checks.push(checkOrderRef(pkg, node, payload))
    checks.push(checkImagesDeclared(node, payload))
  }
  checks.push(checkSignTimeMonotonic(effective))
  checks.push(checkReceiptOnlyDelivery(pkg))
  for (const node of effective) checks.push(checkSignatureRule(node, parseNodePayload(node)))
  checks.push(...checkLegs(pkg, effective))
  const voided = pkg.nodes.filter(node => node.order.voided)
  if (voided.length) {
    checks.push({ id: "consistency.voided_excluded", step: 3, title: "作废节点", status: "skip", detail: `以下节点对应的签收单已作废（链上节点不变）：${voided.map(node => `${node.uuid}（${node.order.void_reason || "未填原因"}）`).join("、")}。它们的哈希与文件已核验，但不参与事件序列与运输段推导` })
  }
  return checks
}
