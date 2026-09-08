import { createHash } from "node:crypto"

export const PALANTIR_REVIEW_STATES = Object.freeze(["pending", "approved", "rejected", "needs_more_research", "deferred", "false_positive"])
const STATES = new Set(PALANTIR_REVIEW_STATES)
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)

export function normalizePalantirReviewItem(input = {}) {
  const canonicalId = clean(input.canonical_id || input.canonical_finding_id || input.recommendation_id || input.milestone_id, 180)
  if (!canonicalId) throw new Error("palantir_review_canonical_id_required")
  const state = STATES.has(input.review_state) ? input.review_state : "pending"
  return Object.freeze({
    schema_version: "palantir-owner-review-item-v1",
    review_id: clean(input.review_id, 180) || `review:${digest({ canonicalId, type: input.item_type || input.review_type })}`,
    canonical_id: canonicalId,
    item_type: clean(input.item_type || input.review_type, 80) || "intelligence_finding",
    title: clean(input.title, 180),
    source_reference: /^https:\/\//.test(String(input.source_reference || "")) ? clean(input.source_reference, 500) : null,
    review_state: state,
    decision_reason: clean(input.decision_reason, 400) || null,
    decided_by: state === "pending" ? null : clean(input.decided_by, 100) || "owner",
    decided_at: state === "pending" ? null : clean(input.decided_at, 40) || null,
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function applyPalantirReviewDecision(item, { state, actor = "owner", reason, decidedAt = new Date().toISOString() } = {}) {
  const current = normalizePalantirReviewItem(item)
  if (!STATES.has(state) || state === "pending") throw new Error("palantir_review_state_invalid")
  const updated = normalizePalantirReviewItem({ ...current, review_state: state, decision_reason: reason, decided_by: actor, decided_at: decidedAt })
  return Object.freeze({ item: updated, audit: { schema_version: "palantir-owner-review-audit-v1", review_id: updated.review_id, previous_state: current.review_state, new_state: state, actor: clean(actor, 100), reason: clean(reason, 400) || null, decided_at: new Date(decidedAt).toISOString() } })
}

export function preservePalantirReviewDecision(existing = [], refreshed = []) {
  const decisions = new Map(existing.map(normalizePalantirReviewItem).filter(item => item.review_state !== "pending").map(item => [item.canonical_id, item]))
  return refreshed.map(item => {
    const normalized = normalizePalantirReviewItem(item)
    const decision = decisions.get(normalized.canonical_id)
    return decision ? Object.freeze({ ...normalized, review_state: decision.review_state, decision_reason: decision.decision_reason, decided_by: decision.decided_by, decided_at: decision.decided_at, review_decision_preserved: true }) : normalized
  })
}
