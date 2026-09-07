import { analyzeHistoricalOfficialRecord } from "./millerNorthHistoricalBackfill.js"

const LOCATION_PATTERNS = [
  /place of death:\s*([^\n]{2,120})/i,
  /(?:at|to)\s+([A-Z][A-Za-z' -]+(?:Hospital|Health Centre|Correctional Centre|Police Station))/,
]

const RECOMMENDATION_PATTERN = /\brecommend(?:ation|ations|ed|s)?\b/gi
const ACCOUNTABLE_PATTERN = /(?:to|for)\s+(?:the\s+)?(Ministry of [^.;\n]+|[A-Z][A-Za-z&' -]+(?:Health Authority|Police Department|RCMP|Hospital|Emergency Health Services))/g

export function classifyBcInquestOcr(record, text, { pageCount = null } = {}) {
  const normalized = String(text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  const triage = analyzeHistoricalOfficialRecord(record, normalized)
  const healthcareRelevant = triage.mechanism_tags.length > 0 || /\bhospital\b|\bhealth(?:care| care)?\b|\bmedical\b|\bphysician\b|\bnurse\b/i.test(normalized)
  const indigenousRelevant = triage.indigenous_terms.length > 0
  let classification = "clearly_out_of_scope"
  if (healthcareRelevant && !indigenousRelevant) classification = "healthcare_relevant_no_indigenous_relevance_established"
  else if (indigenousRelevant && !healthcareRelevant) classification = "indigenous_relevant_not_healthcare_relevant"
  else if (indigenousRelevant && healthcareRelevant) classification = "potentially_miller_north_relevant"

  const recommendationMentions = normalized.match(RECOMMENDATION_PATTERN)?.length || 0
  const accountableOrganizations = [...normalized.matchAll(ACCOUNTABLE_PATTERN)].map(match => match[1].trim()).filter((value, index, values) => values.indexOf(value) === index).slice(0, 12)
  const location = LOCATION_PATTERNS.map(pattern => normalized.match(pattern)?.[1]?.trim()).find(Boolean) || null
  const quality = normalized.length >= 1500 ? "good" : normalized.length >= 500 ? "usable" : normalized.length ? "limited" : "unreadable"
  const firstEvidenceIndex = Math.min(...triage.indigenous_terms.map(term => normalized.toLowerCase().indexOf(term.replaceAll("_", " "))).filter(index => index >= 0))
  const excerptStart = Number.isFinite(firstEvidenceIndex) ? Math.max(0, firstEvidenceIndex - 300) : 0

  return {
    document_id: record.document_id,
    url: record.url,
    person_or_event: record.person_or_event,
    year: record.year,
    page_count: pageCount,
    ocr_character_count: normalized.length,
    document_quality: quality,
    indigenous_terms: triage.indigenous_terms,
    mechanism_tags: triage.mechanism_tags,
    healthcare_relevant: healthcareRelevant,
    indigenous_relevance_explicit: indigenousRelevant,
    classification,
    location_or_facility_candidate: location,
    recommendation_mentions: recommendationMentions,
    accountable_organization_candidates: accountableOrganizations,
    evidence_excerpt: normalized.slice(excerptStart, excerptStart + 1200) || null,
    requires_outward_investigation: classification === "potentially_miller_north_relevant",
    publication_status: "private_review_only",
  }
}

export function summarizeBcInquestOcr(records = [], expectedTotal = 49) {
  const byClassification = Object.fromEntries([...new Set(records.map(item => item.classification))].sort().map(key => [key, records.filter(item => item.classification === key).length]))
  return {
    expected_scans: expectedTotal,
    scans_reviewed: records.length,
    unreadable_scans_remaining: Math.max(0, expectedTotal - records.filter(item => item.document_quality !== "unreadable").length),
    potentially_relevant: records.filter(item => item.classification === "potentially_miller_north_relevant").length,
    owner_review_required: records.filter(item => item.requires_outward_investigation).length,
    by_classification: byClassification,
  }
}
