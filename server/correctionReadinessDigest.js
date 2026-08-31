import { CORRECTION_READINESS_VERSION, rankCorrectionReadiness } from "./correctionReadiness.js"

const READY = "ready_for_trusted_writer_preview"
const MATERIAL_SCORE_DELTA = 10

function keyFor(candidate) {
  if (!candidate?.resource_id || !candidate?.field) throw new Error("correction_readiness_digest_identity_required")
  return `${candidate.resource_id}\u001f${candidate.field}`
}

function indexed(candidates, options) {
  return new Map(rankCorrectionReadiness(candidates, options).map((item) => [keyFor(item.candidate), item]))
}

function actionFor(change) {
  if (change.reasons.includes("newly_ready")) return "Run trusted-writer preview."
  if (change.reasons.includes("new_conflict")) return "Resolve authoritative conflict before any preview."
  if (change.reasons.includes("conflict_resolved")) return "Revalidate the current source, then rescore."
  if (change.reasons.includes("no_longer_ready")) return "Revalidate evidence before advancing."
  if (change.reasons.includes("proposed_value_changed")) return "Review the changed proposed value and its evidence."
  if (change.reasons.includes("candidate_appeared")) return "Review evidence completeness and readiness."
  if (change.reasons.includes("candidate_disappeared")) return "Confirm the candidate was intentionally removed."
  return "Review the readiness change before advancing."
}

function priority(reasons) {
  if (reasons.includes("newly_ready") || reasons.includes("new_conflict")) return 100
  if (reasons.includes("no_longer_ready")) return 95
  if (reasons.includes("conflict_resolved")) return 90
  if (reasons.includes("candidate_disappeared")) return 80
  if (reasons.includes("candidate_appeared")) return 70
  if (reasons.includes("proposed_value_changed")) return 60
  if (reasons.includes("readiness_class_changed")) return 50
  return 40
}

function summarizeChange(key, previous, current) {
  const reasons = []
  if (!previous) reasons.push("candidate_appeared")
  if (!current) reasons.push("candidate_disappeared")
  if (previous && current) {
    if (previous.readiness_class !== READY && current.readiness_class === READY) reasons.push("newly_ready")
    if (previous.readiness_class === READY && current.readiness_class !== READY) reasons.push("no_longer_ready")
    if (previous.readiness_class !== current.readiness_class) reasons.push("readiness_class_changed")
    if (previous.readiness_class !== "conflict" && current.readiness_class === "conflict") reasons.push("new_conflict")
    if (previous.readiness_class === "conflict" && current.readiness_class !== "conflict") reasons.push("conflict_resolved")
    if (previous.candidate.proposed_value !== current.candidate.proposed_value) reasons.push("proposed_value_changed")
    if (Math.abs(current.score - previous.score) >= MATERIAL_SCORE_DELTA) reasons.push("material_score_changed")
  }
  if (!reasons.length) return null
  const selected = current || previous
  return Object.freeze({
    identity: key,
    resource: selected.candidate.resource_name || selected.candidate.resource_id,
    resource_id: selected.candidate.resource_id,
    field: selected.candidate.field,
    previous: previous ? Object.freeze({ score: previous.score, readiness_class: previous.readiness_class, proposed_value: previous.candidate.proposed_value }) : null,
    current: current ? Object.freeze({ score: current.score, readiness_class: current.readiness_class, proposed_value: current.candidate.proposed_value }) : null,
    reasons: Object.freeze(reasons),
    recommended_next_action: actionFor({ reasons }),
    priority: priority(reasons),
  })
}

export function buildCorrectionReadinessChangeDigest(previousCandidates = [], currentCandidates = [], options = {}) {
  const previous = indexed(previousCandidates, options)
  const current = indexed(currentCandidates, options)
  const keys = new Set([...previous.keys(), ...current.keys()])
  const changes = [...keys].map((key) => summarizeChange(key, previous.get(key), current.get(key))).filter(Boolean)
    .sort((left, right) => right.priority - left.priority || left.identity.localeCompare(right.identity)).slice(0, 10)
  return Object.freeze({
    version: CORRECTION_READINESS_VERSION,
    mode: "fixture_only_no_live_access",
    important_changes_count: changes.length,
    quiet: changes.length === 0,
    changes: Object.freeze(changes),
  })
}

function readableReason(reason) {
  return reason.replaceAll("_", " ")
}

export function formatCorrectionReadinessChangeDigest(digest) {
  if (digest.quiet) return "# Miller Farm correction readiness digest\n\nNo meaningful candidate readiness changes.\n"
  const lines = ["# Miller Farm correction readiness digest", "", `${digest.important_changes_count} important change${digest.important_changes_count === 1 ? "" : "s"}.`]
  for (const change of digest.changes) {
    const previous = change.previous ? `${change.previous.readiness_class} / ${change.previous.score}` : "not present"
    const current = change.current ? `${change.current.readiness_class} / ${change.current.score}` : "not present"
    lines.push(`- **${change.resource}** — \`${change.field}\`: ${previous} → ${current}. Why: ${change.reasons.map(readableReason).join(", ")}. Next: ${change.recommended_next_action}`)
  }
  return `${lines.join("\n")}\n`
}
