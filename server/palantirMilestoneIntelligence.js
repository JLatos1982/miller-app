import { createHash } from "node:crypto"

export const PALANTIR_MILESTONE_TYPES = Object.freeze(["inquest", "verdict", "tribunal_hearing", "regulator_outcome", "court_appeal", "audit_follow_up", "government_response", "recommendation_deadline", "implementation_report", "annual_report", "funding_renewal", "consultation_result", "policy_update", "document_release"])
const TYPES = new Set(PALANTIR_MILESTONE_TYPES)
const STATUSES = new Set(["proposed", "scheduled", "window_open", "document_expected", "document_found", "changed", "owner_review", "closed_public_trail", "cancelled"])
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null
const days = value => Math.round(new Date(`${value}T00:00:00Z`).getTime() / 86_400_000)

export function normalizePalantirMilestone(input = {}) {
  const milestoneType = clean(input.milestone_type, 80)
  const monitoringSource = /^https:\/\//.test(String(input.monitoring_source || "")) ? clean(input.monitoring_source, 500) : null
  const expectedDate = date(input.expected_date)
  const windowStart = date(input.date_window?.start || input.window_start)
  const windowEnd = date(input.date_window?.end || input.window_end)
  if (!TYPES.has(milestoneType) || !monitoringSource || !(expectedDate || windowStart || clean(input.date_window_label, 120))) throw new Error("palantir_milestone_required_fields_missing")
  if (windowStart && windowEnd && days(windowEnd) < days(windowStart)) throw new Error("palantir_milestone_window_invalid")
  const vague = !expectedDate && !windowStart
  return Object.freeze({
    schema_version: "palantir-milestone-v1",
    milestone_id: clean(input.milestone_id, 180) || `milestone:${digest({ milestoneType, expectedDate, windowStart, expected_document: input.expected_document, monitoringSource })}`,
    matter_id: clean(input.matter_id || input.related_event_id, 180) || null,
    milestone_type: milestoneType,
    expected_date: expectedDate,
    date_window: { start: windowStart, end: windowEnd, label: clean(input.date_window_label, 120) || null },
    expected_document: clean(input.expected_document, 220) || null,
    monitoring_source: monitoringSource,
    accountable_institution: clean(input.accountable_institution, 220) || null,
    current_status: STATUSES.has(input.current_status) ? input.current_status : "proposed",
    last_checked: clean(input.last_checked, 40) || null,
    next_check: date(input.next_check),
    trigger_reason: clean(input.trigger_reason, 400) || null,
    owner_priority: ["low", "normal", "high"].includes(input.owner_priority) ? input.owner_priority : "normal",
    related_recommendation_id: clean(input.related_recommendation_id, 180) || null,
    related_legal_process_id: clean(input.related_legal_process_id, 180) || null,
    consumer_relevance: [...new Set((input.consumer_relevance || []).map(item => clean(item, 80)).filter(Boolean))],
    schedule_precision: vague ? "vague_owner_review" : expectedDate ? "exact_date" : "date_window",
    owner_review_required: vague || input.owner_review_required === true,
    automatic_schedule: !vague && input.owner_approved === true,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function recommendPalantirMilestoneSchedule(milestone, { now = new Date(), normalBlindCadenceDays = 7 } = {}) {
  const item = normalizePalantirMilestone(milestone)
  if (item.current_status === "cancelled" || item.current_status === "closed_public_trail") return Object.freeze({ action: "stop", next_check: null, search_cycles_avoided: 0, reason: "The public-document watch is closed." })
  if (item.schedule_precision === "vague_owner_review") return Object.freeze({ action: "owner_review", next_check: null, search_cycles_avoided: 0, reason: "The source does not establish a usable date or date window." })
  const today = Math.floor(new Date(now).getTime() / 86_400_000)
  const target = days(item.expected_date || item.date_window.start)
  const end = days(item.expected_date || item.date_window.end || item.date_window.start)
  if (today < target - 3) {
    const checkDay = target - 2
    const avoided = Math.max(0, Math.floor((checkDay - today) / Math.max(1, normalBlindCadenceDays)))
    return Object.freeze({ action: "defer_until_milestone", next_check: new Date(checkDay * 86_400_000).toISOString().slice(0, 10), search_cycles_avoided: avoided, reason: "Targeted checking around the documented milestone is more useful than repeated broad searching." })
  }
  if (today <= end + 7) return Object.freeze({ action: "targeted_recheck", next_check: new Date((today + 2) * 86_400_000).toISOString().slice(0, 10), search_cycles_avoided: 0, reason: "The expected document window is open or recently elapsed." })
  return Object.freeze({ action: "monthly_follow_up", next_check: new Date((today + 30) * 86_400_000).toISOString().slice(0, 10), search_cycles_avoided: 3, reason: "The expected window passed without a located document; continue targeted low-frequency monitoring." })
}

export function createPalantirWatchCandidate(input = {}) {
  const milestone = normalizePalantirMilestone(input)
  return Object.freeze({ schema_version: "palantir-watch-candidate-v1", milestone, disposition: milestone.schedule_precision === "vague_owner_review" ? "owner_review" : "private_watch_candidate", owner_review_required: true, automatic_schedule: false, automatic_publication: false, mutation_authority: false })
}

export function adaptFarmMilestoneListener(listener = {}) {
  if (listener?.schedule?.kind !== "milestone" || !listener.schedule.next_expected_at) throw new Error("palantir_farm_milestone_listener_invalid")
  return normalizePalantirMilestone({
    milestone_id: `milestone:${clean(listener.listener_id, 140)}`,
    milestone_type: "document_release",
    expected_date: String(listener.schedule.next_expected_at).slice(0, 10),
    expected_document: listener.purpose || "Expected public source update",
    monitoring_source: listener.source_url || listener.public_index,
    accountable_institution: listener.agency,
    current_status: "scheduled",
    trigger_reason: listener.purpose,
    owner_approved: listener.enabled === true,
  })
}
