import type { EvidencePackage } from "@/lib/types"
import { ref, shallowRef } from "vue"
import { canvasJpegEncoder } from "@/app/demo/canvasJpeg"
import { buildDemoEvidencePackage } from "@/lib/demo"

const DEMO_SEED = 20260414
let building: Promise<EvidencePackage> | null = null
const demo = shallowRef<EvidencePackage | null>(null)
const error = ref("")

export function clonePackage(pkg: EvidencePackage): EvidencePackage {
  return {
    manifest: structuredClone(pkg.manifest),
    nodes: structuredClone(pkg.nodes),
    files: new Map([...pkg.files].map(([path, bytes]) => [path, new Uint8Array(bytes)]))
  }
}

/** 演示链全站只生成一次（同种子、同「今天」），各步骤页各自复制一份做篡改实验。 */
export function useDemoChain() {
  async function ensure(): Promise<EvidencePackage> {
    if (demo.value) return demo.value
    if (!building) {
      const today = new Date()
      building = buildDemoEvidencePackage({ jpegEncoder: canvasJpegEncoder, now: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12), seed: DEMO_SEED })
        .then((pkg) => {
          demo.value = pkg
          return pkg
        })
        .catch((exc: unknown) => {
          error.value = exc instanceof Error ? exc.message : String(exc)
          building = null
          throw exc
        })
    }
    return building
  }
  return { demo, error, ensure, clonePackage }
}
