/** 演示链的合成业务数据：形状对齐服务端 build_sign_chain_payload，数值用 pyFloat 标记以复刻 Python 序列化。 */
import { pyFloat } from "../pyjson"

export interface DemoPerson {
  id: number
  name: string
  phone: string
  idCardMasked: string | null
}

export interface DemoInstruction {
  id: number
  sn: string
  shippingSn: string
  dateShip: string
  sourceCity: string
  sourceAddress: string
  source: [number, number]
  targetCity: string
  targetAddress: string
  target: [number, number]
  createdAt: string
}

export interface DemoGpsPoint {
  id: number
  driverId: number
  lat: number
  lng: number
  speed: number
  direction: number
  time: string
}

export function personSnapshot(person: DemoPerson | null): Record<string, unknown> | null {
  if (!person) return null
  return { id: person.id, name: person.name, phone: person.phone, id_card_masked: person.idCardMasked }
}

export function instructionSnapshot(inst: DemoInstruction, status: number, timePickedUp: string | null, timeDelivered: string | null, updatedAt: string): Record<string, unknown> {
  return {
    aha_id: null,
    amount: 2,
    comment: null,
    comment_supplier: null,
    creator_name: "",
    creator_phone: "",
    date_ship: inst.dateShip,
    deleted: false,
    device: "服务器整机",
    distance: null,
    express_sn: null,
    fleet_id: null,
    id: inst.id,
    insured_value: 0,
    package: null,
    scene: null,
    shipping_sn: inst.shippingSn,
    sn: inst.sn,
    source_address: inst.sourceAddress,
    source_city: inst.sourceCity,
    source_latitude: pyFloat(inst.source[0]),
    source_longitude: pyFloat(inst.source[1]),
    source_name: "",
    source_phone: "",
    status,
    target_address: inst.targetAddress,
    target_city: inst.targetCity,
    target_latitude: pyFloat(inst.target[0]),
    target_longitude: pyFloat(inst.target[1]),
    target_name: "",
    target_phone: "",
    time_created: inst.createdAt,
    time_delivered: timeDelivered,
    time_eta: null,
    time_picked_up: timePickedUp,
    time_updated: updatedAt,
    transportation: 1,
    volume: null,
    weight: null
  }
}

export function deviceRows(inst: DemoInstruction): Record<string, unknown>[] {
  return [{
    amount: 2,
    deleted: false,
    id: 1,
    instruction_id: inst.id,
    insured_value: "10000.00",
    is_server: true,
    name: "服务器整机",
    sn: "DEV-DEMO-0001",
    so_sn: "ID_SYD_DEMO",
    time_created: inst.createdAt,
    time_updated: inst.createdAt,
    type: "2U",
    volume: "2U",
    weight: pyFloat(20),
    instruction: inst.id
  }]
}

export function gpsRow(point: DemoGpsPoint, inst: DemoInstruction): Record<string, unknown> {
  return {
    deleted: false,
    direction: pyFloat(point.direction),
    driver_id: point.driverId,
    gps_time: point.time,
    id: point.id,
    instruction_id: inst.id,
    latitude: pyFloat(point.lat),
    longitude: pyFloat(point.lng),
    speed: pyFloat(point.speed),
    time_created: point.time,
    time_updated: point.time
  }
}

export interface DemoOrderSnapshotInput {
  id: number
  uuid: string
  instructionId: number
  driverId: number
  signerId: number
  signedType: number
  gpsImei: string
  scene: string
  timeScanned: string
  timeSigned: string
  createdAt: string
}

export function orderSnapshot(order: DemoOrderSnapshotInput): Record<string, unknown> {
  return {
    backfill_operator_id: null,
    backfill_reason: null,
    chain_node_id: null,
    chained: false,
    comment: null,
    deleted: false,
    driver_id: order.driverId,
    gps_imei: order.gpsImei,
    id: order.id,
    instruction_id: order.instructionId,
    jd_code: null,
    jd_erp: null,
    scene: order.scene,
    signed_type: order.signedType,
    signer_id: order.signerId,
    signing_way: 2,
    source: 1,
    time_created: order.createdAt,
    time_scanned: order.timeScanned,
    time_signed: order.timeSigned,
    time_updated: order.createdAt,
    uuid: order.uuid,
    void_reason: "",
    voided: false,
    voided_at: null,
    voided_by_id: null
  }
}
