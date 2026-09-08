import { createHash } from "node:crypto"

export const PALANTIR_REMOTE_CONTRACT_RESEARCH_ID = "remote_contract_opportunity_hunter_v1"

export const PALANTIR_REMOTE_CONTRACT_LISTENER = Object.freeze({
  listener_id: "palantir_remote_contract_opportunities_weekly",
  display_name: "Palantír remote contract opportunities",
  cadence: "weekly",
  state: "designed_not_enabled",
  enablement_blocker: "Stable, terms-compatible source adapters and owner alert thresholds must be approved before scheduling.",
  alert_policy: "new_strong_fit_only",
  duplicate_policy: "canonical_url_company_title",
  application_authority: false,
  contact_authority: false,
  mutation_authority: false,
  publication_authority: false,
})

const SOURCE_HOSTS = new Set([
  "jobs.ashbyhq.com",
  "jobs.lever.co",
  "www.alignerr.com",
  "www.jobs.ca",
  "www.upwork.com",
])

const FARM_TERMS = Object.freeze({
  excellent: ["public records", "regulatory research", "source verification", "database cleanup", "data cleaning", "structured extraction", "document review", "resource directory", "fact checking", "citation"],
  good: ["data annotation", "model evaluation", "data quality", "health research", "policy research", "research assistant", "content research", "audit support"],
})

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const list = value => Array.isArray(value) ? value : value ? [value] : []
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const lower = value => clean(value, 2000).toLowerCase()

function canonicalUrl(value) {
  const url = new URL(clean(value, 1000))
  if (url.protocol !== "https:" || !SOURCE_HOSTS.has(url.hostname)) throw new Error("palantir_opportunity_source_not_allowlisted")
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (!["gh_jid"].includes(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

function detectFarmFit(text) {
  if (FARM_TERMS.excellent.some(term => text.includes(term))) return "excellent_farm_fit"
  if (FARM_TERMS.good.some(term => text.includes(term))) return "good_farm_assisted_fit"
  if (/counsell|interview|relationship|clinical judgment|personalized/.test(text)) return "mostly_human_work"
  return "poor_fit"
}

function detectAutomationPotential(text, farmFit) {
  if (farmFit === "excellent_farm_fit" && /clean|extract|verify|monitor|track|normaliz|structured|citation|database/.test(text)) return "high"
  if (["excellent_farm_fit", "good_farm_assisted_fit"].includes(farmFit)) return "moderate"
  return "low"
}

function compensationValue(compensation = {}) {
  const hourly = Number(compensation.hourly_max || compensation.hourly_min || 0)
  const fixed = Number(compensation.fixed_fee || 0)
  return hourly || Math.min(100, fixed / 10)
}

export function normalizePalantirRemoteContractOpportunity(input, { now = new Date() } = {}) {
  const sourceUrl = canonicalUrl(input.url)
  const title = clean(input.title, 180)
  const company = clean(input.company, 140)
  if (!title || !company) throw new Error("palantir_opportunity_identity_missing")
  const skills = list(input.required_skills).map(value => clean(value, 100)).filter(Boolean).slice(0, 20)
  const concerns = list(input.major_concerns).map(value => clean(value, 180)).filter(Boolean).slice(0, 8)
  const combined = lower([title, company, input.summary, ...skills].join(" "))
  const farmFit = input.farm_fit || detectFarmFit(combined)
  const hoursMin = Math.max(0, Number(input.hours_min || 0))
  const hoursMax = Math.max(hoursMin, Number(input.hours_max || 0))
  const oneTimeHours = Math.max(0, Number(input.one_time_hours || 0))
  const credentialRequired = Boolean(input.credential_required)
  const credentialStatus = clean(input.credential_status || (credentialRequired ? "unknown" : "not_required"), 80)
  const contractType = clean(input.contract_type || "contract", 80)
  const remoteStatus = clean(input.remote_status || "unknown", 80)
  const canadaEligible = input.canada_eligible === true
  const compensation = {
    currency: clean(input.compensation?.currency, 8) || null,
    hourly_min: Number(input.compensation?.hourly_min || 0) || null,
    hourly_max: Number(input.compensation?.hourly_max || 0) || null,
    fixed_fee: Number(input.compensation?.fixed_fee || 0) || null,
    disclosed: Boolean(input.compensation?.hourly_min || input.compensation?.hourly_max || input.compensation?.fixed_fee),
  }
  const canonicalId = `palantir-opportunity:${hash({ sourceUrl, title: lower(title), company: lower(company) }).slice(0, 24)}`
  const availabilityFit = oneTimeHours > 0 || (hoursMax > 0 && hoursMin <= 15 && hoursMax <= 20) ? "compatible" : hoursMin > 20 ? "incompatible" : "unclear"
  const ownerFit = credentialRequired && credentialStatus !== "confirmed"
    ? "credential_mismatch_or_unconfirmed"
    : clean(input.owner_fit || (["excellent_farm_fit", "good_farm_assisted_fit"].includes(farmFit) ? "strong" : "conditional"), 80)
  return Object.freeze({
    schema_version: "palantir-remote-contract-opportunity-v1",
    canonical_opportunity_id: canonicalId,
    title,
    company,
    source: clean(input.source, 80),
    url: sourceUrl,
    location: clean(input.location, 100) || "Remote",
    remote_status: remoteStatus,
    canada_eligible: canadaEligible,
    contract_type: contractType,
    hours: { minimum_weekly: hoursMin || null, maximum_weekly: hoursMax || null, one_time_total: oneTimeHours || null, fit: availabilityFit },
    compensation,
    required_skills: skills,
    relevant_owner_strengths: list(input.relevant_owner_strengths).map(value => clean(value, 100)).filter(Boolean).slice(0, 12),
    missing_skills: list(input.missing_skills).map(value => clean(value, 100)).filter(Boolean).slice(0, 12),
    credential_required: credentialRequired,
    credential_status: credentialStatus,
    owner_fit: ownerFit,
    farm_fit: farmFit,
    automation_potential: input.automation_potential || detectAutomationPotential(combined, farmFit),
    application_effort: clean(input.application_effort || "tailored_resume_needed", 80),
    time_to_money: clean(input.time_to_money || "realistic_within_weeks", 80),
    why_worth_pursuing: clean(input.why_worth_pursuing, 400),
    major_concerns: concerns,
    next_action: clean(input.next_action, 300),
    listing_status: clean(input.listing_status || "active_at_review", 80),
    reviewed_at: new Date(now).toISOString(),
    application_authority: false,
    contact_authority: false,
  })
}

function opportunityPriority(item) {
  let value = 0
  if (item.owner_fit === "strong") value += 6
  else if (item.owner_fit === "conditional") value += 3
  if (item.farm_fit === "excellent_farm_fit") value += 5
  else if (item.farm_fit === "good_farm_assisted_fit") value += 3
  if (item.hours.fit === "compatible") value += 3
  if (item.compensation.disclosed) value += 1
  if (item.time_to_money === "immediate_application") value += 2
  if (item.credential_status === "credential_mismatch_or_unconfirmed" || item.owner_fit === "credential_mismatch_or_unconfirmed") value -= 8
  if (item.hours.fit === "incompatible" || item.remote_status !== "fully_remote" || !item.canada_eligible) value -= 8
  return value
}

export function runPalantirRemoteContractOpportunityCycle({ opportunities = [], previousOpportunityIds = [], now = new Date() } = {}) {
  const normalized = opportunities.map(item => normalizePalantirRemoteContractOpportunity(item, { now }))
  const unique = normalized.filter((item, index, values) => values.findIndex(candidate => candidate.canonical_opportunity_id === item.canonical_opportunity_id) === index)
  const previous = new Set(previousOpportunityIds)
  const eligible = unique.filter(item => item.canada_eligible && item.remote_status === "fully_remote" && item.contract_type !== "permanent" && item.hours.fit !== "incompatible" && item.listing_status !== "expired")
  const ranked = eligible
    .map(item => ({ ...item, priority: opportunityPriority(item) }))
    .sort((left, right) => right.priority - left.priority || compensationValue(right.compensation) - compensationValue(left.compensation) || left.title.localeCompare(right.title))
  const alerts = ranked.filter(item => !previous.has(item.canonical_opportunity_id) && item.priority >= 10 && item.owner_fit !== "credential_mismatch_or_unconfirmed")
  return Object.freeze({
    schema_version: "palantir-remote-contract-cycle-v1",
    research_request_id: PALANTIR_REMOTE_CONTRACT_RESEARCH_ID,
    completed_at: new Date(now).toISOString(),
    sources_checked: [...new Set(unique.map(item => item.source).filter(Boolean))],
    opportunities_seen: unique.length,
    eligible_count: eligible.length,
    duplicates_suppressed: normalized.length - unique.length,
    rejected_count: unique.length - eligible.length,
    ranked,
    alerts,
    metrics: {
      excellent_farm_fit: eligible.filter(item => item.farm_fit === "excellent_farm_fit").length,
      good_farm_assisted_fit: eligible.filter(item => item.farm_fit === "good_farm_assisted_fit").length,
      high_automation_potential: eligible.filter(item => item.automation_potential === "high").length,
      compensation_disclosed: eligible.filter(item => item.compensation.disclosed).length,
      cross_domain_discoveries: 0,
    },
    continuation: { exclude_opportunity_ids: unique.map(item => item.canonical_opportunity_id), recheck_active_urls: ranked.map(item => item.url) },
    listener: PALANTIR_REMOTE_CONTRACT_LISTENER,
    application_actions: 0,
    external_contacts: 0,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function buildPalantirRemoteContractOwnerBrief(cycle, { limit = 10 } = {}) {
  if (cycle?.schema_version !== "palantir-remote-contract-cycle-v1") throw new Error("palantir_opportunity_cycle_required")
  const shortlist = cycle.ranked.slice(0, Math.max(1, Math.min(10, Number(limit) || 10)))
  const bestFarmAssisted = cycle.ranked.filter(item => ["excellent_farm_fit", "good_farm_assisted_fit"].includes(item.farm_fit)).slice(0, 3)
  const easiestFirstDollar = [...shortlist].sort((left, right) => {
    const ease = item => (item.hours.one_time_total && item.hours.one_time_total <= 2 ? 6 : 0)
      + (item.application_effort.startsWith("easy_application") ? 3 : 0)
      + (item.time_to_money === "immediate_application" ? 2 : 0)
      + (item.compensation.disclosed ? 1 : 0)
      - (item.credential_required ? 8 : 0)
    return ease(right) - ease(left)
  })[0] || null
  return Object.freeze({
    schema_version: "palantir-remote-contract-owner-brief-v1",
    research_request_id: cycle.research_request_id,
    generated_at: cycle.completed_at,
    summary: { seen: cycle.opportunities_seen, eligible: cycle.eligible_count, shortlisted: shortlist.length, alerts: cycle.alerts.length },
    shortlist,
    best_farm_assisted: bestFarmAssisted,
    easiest_first_dollar: easiestFirstDollar,
    recurring_listener: cycle.listener,
    raw_logs_included: false,
    automatic_applications: false,
    external_contacts: false,
    mutation_authority: false,
    publication_authority: false,
  })
}
