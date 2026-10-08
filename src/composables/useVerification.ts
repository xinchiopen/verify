import type { FeishuMessage } from "@/lib/feishu"
import type { Check, EvidencePackage, FeishuMessageMeta, VerificationReport } from "@/lib/types"
import type { VerifyStage } from "@/lib/verify"
import { computed, reactive, shallowRef } from "vue"
import { verifyConsistency } from "@/lib/consistency"
import { fetchMessage, messageToAnchorText } from "@/lib/feishu"
import { parseEvidencePackage } from "@/lib/package"
import { buildReport } from "@/lib/report"
import { nodesWithExternalSuccessor, successorMetaKey, verifyAnchors, verifyFiles, verifyNodes } from "@/lib/verify"
import { useFeishuConnection } from "./useFeishuConnection"

export type AnchorKind = "self" | "next"

const STAGE_TEXT: Record<VerifyStage, string> = { parse: "解压证据包", nodes: "重算节点哈希", files: "比对证据文件", consistency: "检查业务一致性", anchors: "比对链外锚点" }

export function useVerification() {
  const pkg = shallowRef<EvidencePackage | null>(null)
  const report = shallowRef<VerificationReport | null>(null)
  const baseChecks = shallowRef<Check[]>([])
  const feishuMessages = reactive<Record<string, string>>({})
  const successorFeishuMessages = reactive<Record<string, string>>({})
  const feishuMessageMeta = reactive<Record<string, FeishuMessageMeta>>({})
  const fetchErrors = reactive<Record<string, string>>({})
  const fetched = reactive<Record<string, FeishuMessage>>({})
  const fetching = reactive<Record<string, boolean>>({})
  const feishu = useFeishuConnection()
  const state = reactive({ busy: false, stage: "" as VerifyStage | "", error: "", fileName: "", demo: false })

  async function run(input: File | Uint8Array | EvidencePackage, options: { fileName?: string, demo?: boolean } = {}) {
    state.busy = true
    state.error = ""
    state.fileName = options.fileName ?? ""
    state.demo = Boolean(options.demo)
    report.value = null
    for (const key of Object.keys(feishuMessages)) delete feishuMessages[key]
    for (const key of Object.keys(successorFeishuMessages)) delete successorFeishuMessages[key]
    for (const bag of [feishuMessageMeta, fetchErrors, fetched, fetching] as Record<string, unknown>[]) {
      for (const key of Object.keys(bag)) delete bag[key]
    }
    try {
      state.stage = "parse"
      const parsed = await parseEvidencePackage(input)
      state.stage = "nodes"
      const checks = await verifyNodes(parsed)
      state.stage = "files"
      checks.push(...(await verifyFiles(parsed)))
      state.stage = "consistency"
      checks.push(...verifyConsistency(parsed))
      pkg.value = parsed
      baseChecks.value = checks
      state.stage = "anchors"
      report.value = buildReport(parsed, [...checks, ...verifyAnchors(parsed, feishuMessages, successorFeishuMessages, feishuMessageMeta)])
    } catch (exc) {
      state.error = exc instanceof Error ? exc.message : String(exc)
      pkg.value = null
    } finally {
      state.busy = false
      state.stage = ""
    }
  }

  function rerunAnchors() {
    if (!pkg.value) return
    report.value = buildReport(pkg.value, [...baseChecks.value, ...verifyAnchors(pkg.value, feishuMessages, successorFeishuMessages, feishuMessageMeta)])
  }

  function metaKey(kind: AnchorKind, nodeUuid: string): string {
    return kind === "self" ? nodeUuid : successorMetaKey(nodeUuid)
  }

  /** 按节点文件里的飞书消息 id 拉取一条消息并填入对应文本框；返回是否成功 */
  async function fetchAnchor(kind: AnchorKind, nodeUuid: string, rerun = true): Promise<boolean> {
    const node = pkg.value?.nodes.find(item => item.uuid === nodeUuid)
    const messageId = kind === "self" ? node?.feishu_msg_id : node?.next_node?.feishu_msg_id
    const key = metaKey(kind, nodeUuid)
    delete fetchErrors[key]
    if (!node || !messageId) {
      fetchErrors[key] = "导出时未记录该消息的飞书 id，无法拉取"
      return false
    }
    if (!feishu.isConnected.value || !feishu.state.token) {
      fetchErrors[key] = "请先用飞书凭证连接"
      return false
    }
    fetching[key] = true
    try {
      const message = await fetchMessage(messageId, feishu.state.token, feishu.clientOptions())
      fetched[key] = message
      feishuMessageMeta[key] = { sentAtMs: message.createTimeMs, chatId: message.chatId }
      if (kind === "self") feishuMessages[nodeUuid] = messageToAnchorText(message)
      else successorFeishuMessages[nodeUuid] = messageToAnchorText(message)
      return true
    } catch (exc) {
      fetchErrors[key] = exc instanceof Error ? exc.message : String(exc)
      delete feishuMessageMeta[key]
      delete fetched[key]
      return false
    } finally {
      fetching[key] = false
      if (rerun) rerunAnchors()
    }
  }

  /** 顺序拉取包内每个节点的消息，以及后继不在包内的节点的后继消息 */
  async function fetchAllAnchors(): Promise<{ ok: number, failed: number }> {
    if (!pkg.value) return { ok: 0, failed: 0 }
    let ok = 0
    let failed = 0
    for (const node of pkg.value.nodes) {
      if (await fetchAnchor("self", node.uuid, false)) ok += 1
      else failed += 1
    }
    for (const node of nodesWithExternalSuccessor(pkg.value)) {
      if (await fetchAnchor("next", node.uuid, false)) ok += 1
      else failed += 1
    }
    rerunAnchors()
    return { ok, failed }
  }

  function reset() {
    pkg.value = null
    report.value = null
    baseChecks.value = []
    state.error = ""
    state.fileName = ""
  }

  const stageText = computed(() => state.stage ? STAGE_TEXT[state.stage] : "")
  const checksByStep = computed(() => {
    const groups: Record<1 | 2 | 3 | 4, Check[]> = { 1: [], 2: [], 3: [], 4: [] }
    for (const check of report.value?.checks ?? []) groups[check.step].push(check)
    return groups
  })

  return { pkg, report, state, stageText, feishuMessages, successorFeishuMessages, feishuMessageMeta, fetchErrors, fetched, fetching, metaKey, fetchAnchor, fetchAllAnchors, checksByStep, run, rerunAnchors, reset }
}
