import type { EvidencePackage, ManifestLeg } from "@/lib/types"
/** 把送货节点原文里的轨迹点按运输段归并，供草图 / 时间轴 / 地图共用。 */
import { parseChainTime, parseNodePayload } from "@/lib/payload"

export const LEG_COLORS = ["#2b4a6f", "#2f6b4f", "#a9712b", "#7a3b69", "#b6322a"]

export interface TrackPoint {
  lat: number
  lng: number
  time: string
  timestamp: number
  inside: boolean
}

export interface TrackLeg {
  leg: ManifestLeg
  color: string
  points: TrackPoint[]
  start: number | null
  end: number | null
}

const TOLERANCE_MS = 60 * 1000

export function collectTrackLegs(pkg: EvidencePackage): TrackLeg[] {
  const effective = pkg.nodes.filter(node => !node.order.voided)
  const delivery = [...effective].reverse().find(node => node.order.signed_type === 2) ?? [...pkg.nodes].reverse().find(node => (parseNodePayload(node)?.gps_locations?.length ?? 0) > 0)
  const points = delivery ? parseNodePayload(delivery)?.gps_locations ?? [] : []
  return pkg.manifest.legs.map((leg, index) => {
    const start = parseChainTime(leg.start_time)
    const end = parseChainTime(leg.end_time)
    const legPoints: TrackPoint[] = points
      .filter(point => leg.driver_user_id === null || point.driver_id === leg.driver_user_id)
      .map(point => ({ lat: Number(point.latitude), lng: Number(point.longitude), time: point.gps_time ?? "", timestamp: parseChainTime(point.gps_time) ?? 0, inside: true }))
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .sort((a, b) => a.timestamp - b.timestamp)
    for (const point of legPoints) {
      point.inside = start === null || end === null || (point.timestamp >= start - TOLERANCE_MS && point.timestamp <= end + TOLERANCE_MS)
    }
    return { leg, color: LEG_COLORS[index % LEG_COLORS.length], points: legPoints, start, end }
  })
}
