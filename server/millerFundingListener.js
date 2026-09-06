const PUBLIC_STATUSES = new Set([
  "open",
  "recurring",
  "upcoming",
  "closed",
  "contact_to_confirm",
  "intake_unknown",
  "paused",
  "archived",
  "verify_before_applying",
])

const PRIVATE_KEYS = new Set([
  "owner_review_state",
  "owner_review_reason",
  "private_notes",
  "patient_name",
  "client_name",
  "username",
])

const SORT_ORDER = Object.freeze({
  open: 0,
  recurring: 1,
  upcoming: 2,
  contact_to_confirm: 3,
  intake_unknown: 4,
  verify_before_applying: 5,
  paused: 6,
  closed: 7,
  archived: 8,
})

const clean = (value, max = 500) => String(value ?? "")
  .split("")
  .map(character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? " " : character
  })
  .join("")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max)

const safeUrl = value => {
  try {
    const parsed = new URL(clean(value, 2_000))
    return parsed.protocol === "https:" ? parsed.toString() : ""
  } catch {
    return ""
  }
}

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function normalizeFundingStatus(status) {
  const value = clean(status, 80).toLowerCase()
  if (["open", "recurring", "upcoming", "closed", "paused", "archived"].includes(value)) return value
  if (["periodic_intakes", "annual_local_deadlines"].includes(value)) return "recurring"
  if (["open_or_ongoing_proposals", "upcoming_or_periodic"].includes(value)) return "contact_to_confirm"
  if (value === "intake_date_unknown") return "intake_unknown"
  return "verify_before_applying"
}

export function nextFundingCheckDue(status, fromDate, deadline = null) {
  const normalized = normalizeFundingStatus(status)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || "")) ? fromDate : new Date().toISOString().slice(0, 10)
  if (deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && ["open", "upcoming"].includes(normalized)) {
    const before = addDays(deadline, -7)
    return before > from ? before : addDays(from, 7)
  }
  const days = ({ open: 7, upcoming: 7, recurring: 30, contact_to_confirm: 30, intake_unknown: 30, verify_before_applying: 30, closed: 90, paused: 90, archived: 180 })[normalized]
  return addDays(from, days || 30)
}

function assertNoPrivateKeys(value) {
  if (!value || typeof value !== "object") return
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_KEYS.has(key)) throw new Error(`private_field:${key}`)
    if (nested && typeof nested === "object") assertNoPrivateKeys(nested)
  }
}

function publicFundingRecord(record, { audience, verifiedAt }) {
  const id = clean(record.funding_record_id || record.funding_assistance_id || record.id, 140)
  const name = clean(record.program_name || record.name, 180)
  const funder = clean(record.funding_organization || record.funder || record.organization, 180)
  const applicationUrl = safeUrl(record.official_application_url || record.application_url || record.url)
  const sourceUrl = safeUrl(record.source?.url || record.official_source || applicationUrl)
  if (!id || !name || !funder || !applicationUrl || !sourceUrl) return null
  const status = normalizeFundingStatus(record.intake_status || record.status)
  const lastVerified = clean(record.last_verified_at || verifiedAt, 10)
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(record.deadline || "")) ? record.deadline : null
  return {
    id: `funding:${audience}:${id}`,
    kind: "funding",
    name,
    funder,
    administering_organization: clean(record.administering_organization, 180) || null,
    jurisdiction: clean(record.province_jurisdiction || record.jurisdiction || "British Columbia", 100),
    geography: clean(record.geographic_scope || record.geography || record.province_jurisdiction || "British Columbia", 180),
    applicant_types: Array.isArray(record.applicant_types) ? record.applicant_types.map(value => clean(value, 80)).filter(Boolean).slice(0, 8) : [],
    who_can_apply: clean(record.who_can_apply || record.applicant, 420),
    indigenous_scope: audience === "miller-north" ? clean(record.first_nations_scope, 120) || "source_defined" : "broader_program",
    purpose: clean(record.purpose || record.category, 180),
    funding_type: clean(record.assistance_type || record.funding_type || "assistance", 100),
    amount: clean(record.amount_or_range || record.amount, 120) || null,
    status,
    opening_date: clean(record.application_opens || record.opening_date, 10) || null,
    deadline,
    recurring_cycle: clean(record.recurring_or_one_time || record.recurring_cycle, 120) || null,
    application_method: clean(record.application_method || "Review the official program page before applying.", 400),
    application_url: applicationUrl,
    source: { title: clean(record.source?.title || name, 200), authority: clean(record.source?.authority || funder, 180), url: sourceUrl },
    last_verified_at: lastVerified,
    next_check_due: nextFundingCheckDue(status, lastVerified, deadline),
    verify_before_applying: !["open", "recurring"].includes(status) || record.verify_before_applying === true,
  }
}

export function buildPublicFundingProjection({ records, audience, verifiedAt }) {
  const seen = new Set()
  const projected = []
  for (const record of records || []) {
    if (audience === "miller-north" && record.confidence !== "high") continue
    if (audience === "miller" && record.source_type && record.source_type !== "official_primary") continue
    const item = publicFundingRecord(record, { audience, verifiedAt })
    if (!item) continue
    const fingerprint = [item.name, item.funder, item.application_url].map(value => value.toLowerCase()).join("|")
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    projected.push(item)
  }
  return {
    schema_version: "miller-funding-public-v1",
    audience,
    generated_at: verifiedAt,
    caution: "Funding availability, deadlines and eligibility can change. Check the official program page before applying.",
    records: projected.sort((a, b) => SORT_ORDER[a.status] - SORT_ORDER[b.status] || a.name.localeCompare(b.name)),
  }
}

export function validatePublicFundingProjection(projection) {
  if (projection?.schema_version !== "miller-funding-public-v1" || !["miller", "miller-north"].includes(projection.audience)) throw new Error("funding_projection_identity")
  const ids = new Set()
  for (const record of projection.records || []) {
    assertNoPrivateKeys(record)
    if (!record.id || ids.has(record.id)) throw new Error("funding_projection_duplicate")
    ids.add(record.id)
    if (!PUBLIC_STATUSES.has(record.status)) throw new Error(`funding_projection_status:${record.status}`)
    if (!record.name || !record.funder || !record.who_can_apply) throw new Error("funding_projection_required_field")
    if (!safeUrl(record.application_url) || !safeUrl(record.source?.url)) throw new Error("funding_projection_source")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.last_verified_at) || !/^\d{4}-\d{2}-\d{2}$/.test(record.next_check_due)) throw new Error("funding_projection_freshness")
  }
  return { records: ids.size, audience: projection.audience }
}

export function materialFundingChanges(previous, current) {
  const fields = ["status", "deadline", "amount", "application_url", "who_can_apply", "purpose"]
  return fields.filter(field => JSON.stringify(previous?.[field] ?? null) !== JSON.stringify(current?.[field] ?? null)).map(field => ({ field, before: previous?.[field] ?? null, after: current?.[field] ?? null, owner_review_required: ["who_can_apply", "purpose"].includes(field) }))
}

export function fundingFreshnessSummary(projection, asOf) {
  const records = projection.records || []
  return {
    total: records.length,
    status_counts: Object.fromEntries([...PUBLIC_STATUSES].map(status => [status, records.filter(record => record.status === status).length])),
    overdue_checks: records.filter(record => record.next_check_due < asOf).length,
  }
}
