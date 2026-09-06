import { assertResearchPrivacy } from "./farmResearchViews.js"

export const MILLER_NORTH_RESEARCH_POLICY_SCHEMA = "miller-north-research-policy-public-v1"
export const PUBLIC_EVIDENCE_STATUSES = new Set([
  "implemented",
  "substantially_implemented",
  "partially_implemented",
  "implementation_underway",
  "implementation_evidence_fragmentary",
])

const forbiddenProjectionKey = /^(owner_review|owner_review_flag|owner_review_reason|owner_assessment|owner_view|public_role_people|privacy|case_id|source_id|source_family_id|source_references|information_requests_sent|production_mutations|publication_mutations)$/i
const internalIdentifier = /\b(?:mnrpc|mnpce|mnpct|mnpcs|frf|fdedge|farm_dossier)_[a-z0-9_]+\b/i

function assertPublicationSafe(value, path = "projection") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicationSafe(item, `${path}[${index}]`))
    return true
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && internalIdentifier.test(value)) throw new Error(`miller_north_research_internal_identifier:${path}`)
    return true
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenProjectionKey.test(key)) throw new Error(`miller_north_research_private_key:${path}.${key}`)
    assertPublicationSafe(nested, `${path}.${key}`)
  }
  return true
}

const validateSource = source => {
  if (!source?.title || !source?.organization || !source?.category || !/^https:\/\//.test(source.url || "")) throw new Error("miller_north_research_source_invalid")
}

const validateClaim = claim => {
  if (!claim?.text || !claim.sources?.length) throw new Error("miller_north_research_claim_source_missing")
  claim.sources.forEach(validateSource)
}

export function validateMillerNorthResearchPolicyProjection(projection) {
  assertResearchPrivacy(projection)
  assertPublicationSafe(projection)
  if (projection.schema_version !== MILLER_NORTH_RESEARCH_POLICY_SCHEMA || projection.visibility !== "hidden_site_read_only" || projection.publication_state !== "owner_approved_hidden_experience") throw new Error("miller_north_research_scope_invalid")
  if (!projection.caution?.includes("Missing public evidence does not prove") || !projection.caution?.includes("not legal advice") || !projection.caution?.includes("reported experiences")) throw new Error("miller_north_research_caution_missing")
  if (!Array.isArray(projection.cases) || projection.cases.length !== 3) throw new Error("miller_north_research_case_count")
  const slugs = new Set()
  const provinces = new Set()
  for (const record of projection.cases) {
    if (!/^[a-z0-9-]{3,80}$/.test(record.slug || "") || slugs.has(record.slug)) throw new Error("miller_north_research_case_slug")
    slugs.add(record.slug)
    if (!["British Columbia", "Saskatchewan", "Alberta"].includes(record.province) || provinces.has(record.province)) throw new Error("miller_north_research_province")
    provinces.add(record.province)
    if (!record.title || !record.focus || !record.what_happened || !record.one_thing_to_remember || !record.recommended_next_question) throw new Error("miller_north_research_case_content")
    if (!record.why_this_matters?.length || record.why_this_matters.length > 3) throw new Error("miller_north_research_significance_limit")
    if (!record.what_public_evidence_shows?.length || !record.what_remains_unclear?.length || !record.timeline?.length || !record.evidence_path?.length || !record.sources?.length) throw new Error("miller_north_research_case_sections")
    record.what_public_evidence_shows.forEach(validateClaim)
    record.what_remains_unclear.forEach(validateClaim)
    record.timeline.forEach(item => { if (!item.date || !item.type || !item.title || !item.description || !item.organization || !item.sources?.length) throw new Error("miller_north_research_timeline_invalid"); item.sources.forEach(validateSource) })
    record.evidence_path.forEach(item => { if (!item.from || !item.relationship || !item.to || !item.sources?.length) throw new Error("miller_north_research_edge_invalid"); item.sources.forEach(validateSource) })
    record.sources.forEach(validateSource)
  }
  const bc = projection.cases.find(record => record.province === "British Columbia")
  if (bc.recommendations?.length !== 24) throw new Error("miller_north_research_recommendation_count")
  if (new Set(bc.recommendations.map(item => item.number)).size !== 24 || !bc.recommendations.every(item => PUBLIC_EVIDENCE_STATUSES.has(item.status) && item.summary && item.theme && item.latest_evidence_date && item.responsible_organizations?.length && item.sources?.length && item.reporting_limitation)) throw new Error("miller_north_research_recommendation_invalid")
  const counts = Object.fromEntries([...PUBLIC_EVIDENCE_STATUSES].map(status => [status, bc.recommendations.filter(item => item.status === status).length]))
  if (JSON.stringify(counts) !== JSON.stringify(bc.status_counts)) throw new Error("miller_north_research_status_counts")
  if (bc.source_note?.canonical_recommendation_number !== 11 || !bc.source_note?.text.includes("original In Plain Sight report")) throw new Error("miller_north_research_pida_note")
  for (const [province, findings] of Object.entries(projection.bounded_discovery || {})) {
    if (!["british_columbia", "saskatchewan", "alberta"].includes(province) || findings.length > 5) throw new Error("miller_north_research_discovery_limit")
    findings.forEach(validateClaim)
  }
  return { cases: projection.cases.length, recommendations: bc.recommendations.length, displayed_claims: projection.cases.reduce((sum, record) => sum + record.what_public_evidence_shows.length + record.what_remains_unclear.length + record.timeline.length + record.evidence_path.length, 0), evidence_bearing_claims: projection.cases.reduce((sum, record) => sum + record.what_public_evidence_shows.length + record.what_remains_unclear.length + record.timeline.length + record.evidence_path.length, 0), sources: new Set(projection.cases.flatMap(record => record.sources.map(source => source.url))).size, discovery_findings: Object.values(projection.bounded_discovery || {}).flat().length }
}
