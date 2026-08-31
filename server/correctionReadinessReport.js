import { CORRECTION_READINESS_CLASSES, CORRECTION_READINESS_VERSION, rankCorrectionReadiness } from "./correctionReadiness.js"

const GROUP_TITLES = Object.freeze({
  ready_for_trusted_writer_preview: "Ready for trusted-writer preview",
  likely_ready_after_revalidation: "Likely ready after revalidation",
  needs_more_evidence: "Needs more evidence",
  conflict: "Conflict",
  human_review: "Human review",
})

const REASON_LABELS = Object.freeze({
  exact_resource_identity: "exact identity",
  first_party_source: "first-party source",
  fresh_source: "fresh evidence",
  no_current_authoritative_conflict: "no conflict",
  allowed_canonical_field: "allowed field",
  public_privacy_safe: "public value",
  evidence_shape_complete: "complete evidence",
  current_value_missing: "current value missing",
  current_value_stale: "current value stale",
  current_value_wrong: "current value differs",
  website_writer_compatible: "website writer compatible",
})

const BLOCKER_LABELS = Object.freeze({
  ambiguous_identity: "identity is ambiguous",
  ai_only_support: "support is AI-only",
  conflicting_sources: "current authoritative sources conflict",
  domain_mismatch: "source domain does not match",
  redirected_source: "source redirects",
  stale_source: "source needs revalidation",
  non_first_party_source: "source is not first-party",
  incomplete_evidence_shape: "evidence is incomplete",
  unsupported_field: "field is unsupported",
  privacy_unsafe: "value is not public/privacy-safe",
})

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value)
}

function actionFor(readinessClass) {
  if (readinessClass === "ready_for_trusted_writer_preview") return "Run trusted-writer preview."
  if (readinessClass === "likely_ready_after_revalidation") return "Revalidate source, then rescore."
  if (readinessClass === "needs_more_evidence") return "Collect first-party, complete evidence."
  if (readinessClass === "conflict") return "Resolve authoritative conflict before any preview."
  return "Request human identity/privacy review."
}

function reportRow(item) {
  const { candidate } = item
  return Object.freeze({
    candidate_id: item.id,
    resource: candidate.resource_name || candidate.resource_id,
    resource_id: candidate.resource_id,
    field: candidate.field,
    current_value: displayValue(candidate.current_value),
    proposed_value: displayValue(candidate.proposed_value),
    readiness_score: item.score,
    readiness_class: item.readiness_class,
    why_it_ranks_highly: item.reasons.map((reason) => REASON_LABELS[reason] || reason),
    remaining_blocker: item.penalties.length ? BLOCKER_LABELS[item.penalties[0]] || item.penalties[0] : "none",
    recommended_next_action: actionFor(item.readiness_class),
  })
}

export function buildCorrectionReadinessOwnerReport(candidates = [], options = {}) {
  const ranked = rankCorrectionReadiness(candidates, options).slice(0, 10).map(reportRow)
  const groups = Object.fromEntries(CORRECTION_READINESS_CLASSES.map((readinessClass) => [readinessClass, []]))
  for (const row of ranked) groups[row.readiness_class].push(row)
  const counts = Object.freeze({
    total_candidates: candidates.length,
    ready_now: ranked.filter((row) => row.readiness_class === "ready_for_trusted_writer_preview").length,
    revalidate: ranked.filter((row) => row.readiness_class === "likely_ready_after_revalidation").length,
    needs_evidence: ranked.filter((row) => row.readiness_class === "needs_more_evidence").length,
    conflict: ranked.filter((row) => row.readiness_class === "conflict").length,
    human_review: ranked.filter((row) => row.readiness_class === "human_review").length,
  })
  return Object.freeze({
    version: CORRECTION_READINESS_VERSION,
    mode: "fixture_only_no_live_access",
    summary: counts,
    top_candidates: Object.freeze(ranked),
    groups: Object.freeze(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, Object.freeze(rows)]))),
  })
}

export function formatCorrectionReadinessOwnerReport(report) {
  const lines = [
    "# Miller Farm correction readiness backlog",
    "",
    `Synthetic/local report — ${report.summary.total_candidates} candidates: ${report.summary.ready_now} ready now, ${report.summary.revalidate} revalidate, ${report.summary.needs_evidence} need evidence, ${report.summary.conflict} conflict, ${report.summary.human_review} human review.`,
  ]
  for (const readinessClass of CORRECTION_READINESS_CLASSES) {
    const rows = report.groups[readinessClass]
    lines.push("", `## ${GROUP_TITLES[readinessClass]} (${rows.length})`)
    if (!rows.length) { lines.push("None."); continue }
    for (const row of rows) {
      lines.push(`- **${row.resource}** — \`${row.field}\`: ${row.current_value} → ${row.proposed_value} (score ${row.readiness_score}). ${row.why_it_ranks_highly.join(", ") || "No positive signals"}. Blocker: ${row.remaining_blocker}. Next: ${row.recommended_next_action}`)
    }
  }
  return `${lines.join("\n")}\n`
}
