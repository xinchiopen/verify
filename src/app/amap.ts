/** 高德 JS API 按需加载；没有 key 时调用方不渲染入口。 */
export type AMapLngLat = [number, number]

export interface AMapOverlay {}

export interface AMapMap {
  add: (overlays: AMapOverlay | AMapOverlay[]) => void
  destroy: () => void
  setFitView: (overlays?: AMapOverlay[]) => void
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options?: { viewMode?: "2D" | "3D", zoom?: number, resizeEnable?: boolean }) => AMapMap
  Marker: new (options: { position: AMapLngLat, title?: string }) => AMapOverlay
  Polyline: new (options: { path: AMapLngLat[], strokeColor: string, strokeWeight: number, strokeOpacity?: number, lineJoin?: "round" | "miter" | "bevel" }) => AMapOverlay
}

interface AMapWindow extends Window {
  AMap?: AMapNamespace
  _AMapSecurityConfig?: { securityJsCode?: string }
}

let amapPromise: Promise<AMapNamespace> | null = null

export function amapConfigured(): boolean {
  return Boolean(import.meta.env.VITE_AMAP_WEB_KEY?.trim())
}

export function loadAmap(): Promise<AMapNamespace> {
  const key = import.meta.env.VITE_AMAP_WEB_KEY?.trim()
  if (!key) return Promise.reject(new Error("未配置 VITE_AMAP_WEB_KEY"))
  const amapWindow = window as AMapWindow
  if (amapWindow.AMap) return Promise.resolve(amapWindow.AMap)
  if (amapPromise) return amapPromise
  amapPromise = new Promise((resolve, reject) => {
    const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim()
    if (securityJsCode) amapWindow._AMapSecurityConfig = { securityJsCode }
    const script = document.createElement("script")
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.async = true
    script.addEventListener("load", () => {
      if (amapWindow.AMap) {
        resolve(amapWindow.AMap)
      } else {
        amapPromise = null
        reject(new Error("高德地图 SDK 未正确加载"))
      }
    }, { once: true })
    script.addEventListener("error", () => {
      amapPromise = null
      reject(new Error("高德地图 SDK 加载失败"))
    }, { once: true })
    document.head.appendChild(script)
  })
  return amapPromise
}
