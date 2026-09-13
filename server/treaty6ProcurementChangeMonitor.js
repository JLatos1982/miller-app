import { createHash } from "node:crypto"

export const TREATY6_PROCUREMENT_CHANGE_MONITOR_V1 = "TREATY6_PROCUREMENT_CHANGE_MONITOR_V1"
export const TREATY6_PROCUREMENT_EVENT_PUBLICATION_POLICY_V1 = "TREATY6_PROCUREMENT_EVENT_PUBLICATION_POLICY_V1"
const meaningful = ["title", "buyer", "status", "closing_date", "category", "jurisdiction", "supplier_pathway_type", "source_access"]
const eventFor = (before, after) => {
  if (!before) return "NEW_OPPORTUNITY"
  if (before.status !== after.status && /closed/i.test(after.status || "")) return "OPPORTUNITY_CLOSED"
  if (before.status !== after.status) return "STATUS_CHANGED"
  if (before.closing_date !== after.closing_date) return "DEADLINE_CHANGED"
  if (before.supplier_pathway_type !== after.supplier_pathway_type) return "SUPPLIER_PATH_CHANGED"
  return meaningful.some(key => before[key] !== after[key]) ? "OPPORTUNITY_UPDATED" : null
}
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const clean = value => String(value || "").trim()
export function normalizeTreaty6Snapshot(item, { observedAt = new Date().toISOString() } = {}) {
  if (!clean(item?.source_id) || !clean(item?.source_family) || !/^https:\/\//.test(clean(item?.canonical_url)) || !clean(item?.title) || !clean(item?.last_verified_at)) throw new Error("treaty6_snapshot_provenance_required")
  const snapshot = Object.freeze({ source_id: clean(item.source_id), source_family: clean(item.source_family), canonical_url: clean(item.canonical_url), title: clean(item.title), buyer: clean(item.buyer), status: clean(item.status || "UNKNOWN"), published_date: item.published_date || null, closing_date: item.closing_date || null, category: clean(item.category), jurisdiction: clean(item.jurisdiction), indigenous_relevance: clean(item.indigenous_relevance), supplier_pathway_type: clean(item.supplier_pathway_type), source_access: clean(item.source_access || "PUBLIC_LINK_ONLY"), last_verified_at: item.last_verified_at, observed_at: observedAt, evidence_type: clean(item.evidence_type || "OFFICIAL_PAGE") })
  return Object.freeze({ ...snapshot, content_fingerprint: hash(snapshot) })
}
export function treaty6Freshness(snapshot, { now = new Date() } = {}) { const age = new Date(now).getTime() - Date.parse(snapshot.last_verified_at); return /closed/i.test(snapshot.status) ? "CLOSED" : !Number.isFinite(age) ? "UNKNOWN" : age <= 7 * 864e5 ? "FRESH" : age <= 30 * 864e5 ? "AGING" : "STALE" }
export function runTreaty6ProcurementChangeMonitor({ previous = [], current = [], observedAt = new Date().toISOString() } = {}) {
  const prior = new Map(previous.map(item => [item.canonical_url, item])); const snapshots = current.map(item => normalizeTreaty6Snapshot(item, { observedAt })); const events = snapshots.map(item => { const type = eventFor(prior.get(item.canonical_url), item); return type ? Object.freeze({ event_id: `t6-${hash([type, item.canonical_url, item.content_fingerprint]).slice(0, 20)}`, event_type: type, entity_id: item.canonical_url, observed_at: observedAt, published_at: item.published_date, effective_at: item.closing_date, provenance: { source_id: item.source_id, canonical_url: item.canonical_url, fingerprint: item.content_fingerprint, evidence_type: item.evidence_type }, snapshot: item }) : null }).filter(Boolean)
  return Object.freeze({ monitor: TREATY6_PROCUREMENT_CHANGE_MONITOR_V1, result: events.length ? "MEANINGFUL_CHANGES_FOUND" : "NO_MEANINGFUL_CHANGE", snapshots: Object.freeze(snapshots), events: Object.freeze(events), append_only: true, no_competing_scheduler: true })
}
export function evaluateTreaty6EventPublication(event, { now = new Date() } = {}) { const fresh = treaty6Freshness(event?.snapshot || {}, { now }); const publishable = Boolean(event?.event_type && event?.provenance?.canonical_url?.startsWith("https://") && fresh === "FRESH" && event.snapshot.source_access !== "MEMBERSHIP_REQUIRED"); return Object.freeze({ policy: TREATY6_PROCUREMENT_EVENT_PUBLICATION_POLICY_V1, publishable, result: publishable ? "PUBLICATION_SAFE" : "PRIVATE_REVIEW", freshness: fresh, qualification_claim: false }) }
