import { createHash } from "node:crypto"
import { comparePublicResources, normalizeIdentityText, normalizePhone, normalizePublicUrl } from "./resourceIdentity.js"

export const SHELTER_DISCOVERY_VERSION = "miller-shelter-discovery-v1.0.0"
export const SHELTER_REVIEW_ACTIONS = Object.freeze(new Set(["approve", "reject", "exclude", "defer", "merge"]))
const confidentialPattern = /\b(confidential|undisclosed|safe house|transition house|domestic violence|intimate partner violence|women'?s shelter|youth safe house)\b/i

const clean = (value, max = 2000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
export function discoveryFingerprint(candidate = {}) {
  const identity = [normalizeIdentityText(candidate.name), normalizeIdentityText(candidate.operator), normalizePublicUrl(candidate.website || candidate.source_url), normalizePhone(candidate.phone || candidate.crisis_line), normalizeIdentityText(candidate.community)].join("|")
  return createHash("sha256").update(identity).digest("hex")
}

export function normalizeShelterCandidate(input = {}) {
  const name = clean(input.name, 300), sourceUrl = clean(input.source_url || input.website, 2000)
  if (name.length < 3) throw new Error("A shelter or program name is required.")
  if (!/^https:\/\//i.test(sourceUrl)) throw new Error("A current HTTPS evidence URL is required.")
  const type = clean(input.shelter_type || "emergency_shelter", 100)
  const safetyText = `${name} ${type} ${input.population_served || ""} ${input.evidence_notes || ""}`
  const explicitlyConfidential = input.location_disclosure_status === "confidential" || input.location_disclosure_status === "undisclosed"
  const safetySensitive = confidentialPattern.test(safetyText)
  const disclosure = explicitlyConfidential || (safetySensitive && !input.address_intentionally_public) ? "confidential" : input.public_address ? "public" : "undisclosed"
  return Object.freeze({
    name, operator: clean(input.operator, 300), shelter_type: type, population_served: clean(input.population_served, 500), gender_eligibility: clean(input.gender_eligibility, 300), age_eligibility: clean(input.age_eligibility, 300), community: clean(input.community, 200), region: clean(input.region, 200), health_authority: clean(input.health_authority, 200),
    public_address: disclosure === "public" ? clean(input.public_address, 500) : "", location_disclosure_status: disclosure,
    phone: clean(input.phone, 100), crisis_line: clean(input.crisis_line, 100), email: clean(input.email, 320), website: clean(input.website || sourceUrl, 2000), intake_process: clean(input.intake_process), hours_or_dates: clean(input.hours_or_dates), accessibility: clean(input.accessibility), pets_policy: clean(input.pets_policy), couples_policy: clean(input.couples_policy), substance_use_rules: clean(input.substance_use_rules), managed_alcohol_program: ["yes", "no", "unknown", "not_stated"].includes(input.managed_alcohol_program) ? input.managed_alcohol_program : "unknown", indigenous_specific: input.indigenous_specific === true ? "yes" : input.indigenous_specific === false ? "no" : "unknown", capacity: clean(input.capacity, 100),
    source_url: sourceUrl, source_name: clean(input.source_name, 300), retrieved_title: clean(input.retrieved_title, 500), source_excerpt: clean(input.source_excerpt, 4000), additional_sources: Array.isArray(input.additional_sources) ? input.additional_sources.filter((x) => /^https:\/\//i.test(x)).slice(0, 10) : [], checked_at: clean(input.checked_at, 40) || new Date().toISOString(), evidence_notes: clean(input.evidence_notes, 4000), confidence: ["high", "medium", "low"].includes(input.confidence) ? input.confidence : "medium", review_status: "pending", geocoding_status: disclosure === "public" ? "awaiting_authorized_geocoder" : "not_requested", source_fingerprint: "",
  })
}

export function prepareShelterCandidate(input) { const item = normalizeShelterCandidate(input); return Object.freeze({ ...item, source_fingerprint: discoveryFingerprint(item) }) }

export function findConservativeMatches(candidate, resources = []) {
  return resources.map((resource) => ({ resource, ...comparePublicResources({ ...candidate, organization: candidate.operator, city: candidate.community, address: candidate.public_address }, { ...resource, address: resource.address || resource.public_address }) })).filter((item) => item.classification !== "likely_distinct" && item.classification !== "insufficient").sort((a, b) => b.score - a.score)
}

export function directoryApprovalState(candidate = {}) {
  return { directory_approved: true, geography_created: false, public_map: false, geocoding_status: candidate.location_disclosure_status === "public" ? "awaiting_authorized_geocoder" : "not_requested" }
}
