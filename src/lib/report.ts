import type { Check, CheckStatus, EvidencePackage, VerificationReport } from "./types"
import { VERIFIER_NAME, VERIFIER_VERSION } from "./version"

export function summarize(checks: Check[]): Record<CheckStatus, number> {
  const summary: Record<CheckStatus, number> = { pass: 0, fail: 0, warn: 0, skip: 0 }
  for (const check of checks) summary[check.status] += 1
  return summary
}

export function overallStatus(summary: Record<CheckStatus, number>): VerificationReport["overall"] {
  if (summary.fail > 0) return "fail"
  if (summary.warn > 0) return "warn"
  return "pass"
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function buildReport(pkg: EvidencePackage, checks: Check[]): VerificationReport {
  const summary = summarize(checks)
  return {
    format_version: 1,
    generated_at: nowText(),
    verifier: { name: VERIFIER_NAME, version: VERIFIER_VERSION },
    package: {
      sn: pkg.manifest.instruction.sn,
      exported_at: pkg.manifest.package.exported_at,
      exporter_version: pkg.manifest.package.exporter_version,
      node_count: pkg.nodes.length,
      voided_node_count: pkg.nodes.filter(node => node.order.voided).length,
      file_count: pkg.manifest.files.length
    },
    checks,
    summary,
    overall: overallStatus(summary)
  }
}

export function reportToJson(report: VerificationReport): string {
  return JSON.stringify(report, null, 2)
}
