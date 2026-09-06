import { createHash } from "node:crypto"
import { extractMillerNorthNamedCases } from "./millerNorthNamedCaseExtraction.js"

// This extractor is intentionally evidence-bounded. It never tries to supply
// a patient's missing identity; its anonymous path is usable only where the
// source itself describes a distinct healthcare event with stable event facts.
const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const normal = value => clean(value).toLowerCase()
const sentenceSplit = value => clean(value).split(/(?<=[.!?])\s+/).filter(Boolean)
const encounter = /\b(?:hospital|emergency|er|clinic|treatment|care|admitted|admission|discharged|released|denied|refused|turned away|restrain(?:ed|t)|security|injection|surgery|delivery|died|death|pain|medication|ambulance)\b/i
const distinctive = /\b(?:denied|refused|turned away|restrain(?:ed|t)|security|injection|surgery|delivery|died|death|pain|medication|ambulance|wait(?:ed|ing)?|discharged|released|removed|burn(?:ed|ing)|assault|complaint)\b/i
const concern = /\b(?:racism|racist|discrimination|mistreatment|neglect|stereotyp|complaint|human rights|investigation|review|apolog)\b/i
const indigenousContext = /\b(?:Indigenous|First Nations|Métis|Cree|Dene|Anishinaabe|Haida|Inuit|Penelakut)\b/i
const unnamedTerms = /\b(?:unnamed|not publicly named|identity (?:was )?(?:not )?released|identity (?:was )?withheld|patient|woman|man|mother|father|elder|family|child|baby)\b/i
const facilityPattern = /\b(?:[A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,6}\s+(?:Hospital|Health Centre|Health Center|Medical Centre|Medical Center|Emergency Department)|Royal University Hospital|Jim Pattison(?: Children's)? Hospital|Prince Albert Victoria Hospital|Victoria Hospital|Regina General Hospital|Misericordia Hospital|Royal Alexandra Hospital|University Hospital of Northern British Columbia|South Health Campus|Cardston Health Centre|Nanaimo Regional General Hospital|Cowichan District Hospital|Victoria General Hospital)\b/g
const municipalityPattern = /\b(Saskatoon|Regina|Prince Albert|North Battleford|Battleford|Lloydminster|La Ronge|Meadow Lake|Yorkton|Edmonton|Calgary|Wetaskiwin|Red Deer|Maskwacis|Fort Saskatchewan|Strathmore|Vancouver|Victoria|Nanaimo|Terrace|Prince George|Port Alberni|Kitimat|Surrey|Kamloops|Kelowna)\b/i

const sourceText = ({ normalizedSource, title = "", excerpt = "" }) => normalizedSource
  ? clean(`${normalizedSource.title || title}. ${(normalizedSource.evidence_segments || []).map(segment => segment.text).join(" ")}`)
  : clean(`${title}. ${excerpt}`)
const sourceSegments = ({ normalizedSource, title = "", excerpt = "" }) => normalizedSource?.evidence_segments?.length
  ? normalizedSource.evidence_segments
  : [{ evidence_span_id: null, text: clean(`${title}. ${excerpt}`), structural_label: "search_metadata" }]
const provinceFor = ({ text, province }) => province || (/\b(?:Saskatchewan|Saskatoon|Regina|Prince Albert|North Battleford|Lloydminster|La Ronge|Meadow Lake|Yorkton)\b/i.test(text) ? "saskatchewan" : /\b(?:Alberta|Edmonton|Calgary|Wetaskiwin|Red Deer|Maskwacis|Fort Saskatchewan|Strathmore)\b/i.test(text) ? "alberta" : /\b(?:British Columbia|B\.C\.|Vancouver|Victoria|Nanaimo|Terrace|Prince George|Port Alberni|Kitimat|Surrey|Kamloops|Kelowna)\b/i.test(text) ? "british_columbia" : null)
const municipalityFor = text => clean(text).match(municipalityPattern)?.[1] || null
const facilityFor = text => [...String(text).matchAll(facilityPattern)].map(match => clean(match[0])).find(Boolean) || null
const eventYearFor = text => {
  const years = [...String(text).matchAll(/\b(20(?:1[5-9]|2[0-6]))\b/g)].map(match => Number(match[1]))
  return years[0] || null
}
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 48)

function nearbyEventBlocks(segments) {
  const blocks = []
  for (let index = 0; index < segments.length; index += 1) {
    const current = clean(segments[index]?.text)
    if (!current || !encounter.test(current)) continue
    const joined = clean(segments.slice(Math.max(0, index - 1), Math.min(segments.length, index + 2)).map(segment => segment.text).join(" "))
    if (!distinctive.test(joined) || !indigenousContext.test(joined) || !unnamedTerms.test(joined)) continue
    blocks.push({ index, text: joined, segment_ids: segments.slice(Math.max(0, index - 1), Math.min(segments.length, index + 2)).map(segment => segment.evidence_span_id).filter(Boolean) })
  }
  return blocks.filter((block, index, all) => all.findIndex(other => normal(other.text) === normal(block.text)) === index)
}

function unnamedCandidate({ block, province, sourceUrl, sourceOrganization }) {
  const local = block.text, facility = facilityFor(local), municipality = municipalityFor(local), event_year = eventYearFor(local)
  const concrete_encounter = sentenceSplit(local).find(sentence => encounter.test(sentence) && distinctive.test(sentence)) || null
  const reported_concern = sentenceSplit(local).find(sentence => concern.test(sentence)) || null
  if (!facility || !municipality || !event_year || !concrete_encounter || concrete_encounter.length < 12) return null
  const event_identity_facts = {
    facility,
    locality: municipality,
    timing_basis: "event_year_explicit_in_source",
    distinctive_encounter_facts: concrete_encounter.slice(0, 1200),
    evidence_span_ids: block.segment_ids,
  }
  const incident_fingerprint = fingerprint({ incident_identity_class: "unnamed_but_specific_incident", province, facility: normal(facility), municipality: normal(municipality), event_year, distinctive_encounter_facts: normal(concrete_encounter) })
  return {
    extraction_classification: "unnamed_specific_incident",
    incident_identity_class: "unnamed_but_specific_incident",
    public_case_name: null,
    working_title: `Patient not publicly named — ${facility} — ${event_year}`,
    province,
    municipality,
    facility,
    care_setting: "healthcare facility",
    timing: { event_date: null, event_year, approximate_event_year: null, publication_date: null },
    concrete_encounter,
    reported_concern,
    source_url: sourceUrl,
    source_organization: sourceOrganization || null,
    evidence_span_ids: block.segment_ids,
    event_identity_facts,
    incident_fingerprint,
    reconciliation_confidence: "bounded",
    evidence_status: "reported",
  }
}

export function extractMillerNorthIncidents({ title = "", excerpt = "", sourceUrl = "", sourceOrganization = "", province = null, existingIncidents = [], normalizedSource = null } = {}) {
  const text = sourceText({ normalizedSource, title, excerpt })
  const segments = sourceSegments({ normalizedSource, title, excerpt })
  const resolvedProvince = provinceFor({ text, province })
  const namedRows = extractMillerNorthNamedCases({ title, excerpt, sourceUrl, sourceOrganization, province: resolvedProvince, existingIncidents, normalizedSource })
  const named = namedRows.filter(row => row.classification === "named_case_strong" && !row.likely_existing_incident_id).map(row => ({
    extraction_classification: "named_individual_incident",
    incident_identity_class: "named_incident",
    public_case_name: row.person,
    working_title: row.person,
    province: row.province,
    municipality: row.municipality,
    facility: row.facility,
    care_setting: row.care_setting,
    timing: { event_date: row.event_date, event_year: row.event_year, approximate_event_year: row.approximate_event_year, publication_date: null },
    concrete_encounter: row.concrete_encounter,
    person_evidence: row.evidence?.person || null,
    reported_concern: row.reported_concern,
    source_url: row.source_url,
    source_organization: row.source_organization,
    evidence_span_ids: Object.values(row.evidence?.evidence_span_ids || {}).filter(Boolean),
    event_identity_facts: { distinctive_encounter_facts: row.concrete_encounter || "", evidence_span_ids: Object.values(row.evidence?.evidence_span_ids || {}).filter(Boolean) },
    incident_fingerprint: fingerprint({ incident_identity_class: "named_incident", public_case_name: normal(row.person), province: row.province, facility: normal(row.facility), event_year: row.event_year, encounter: normal(row.concrete_encounter) }),
    reconciliation_confidence: row.extraction_confidence === "bounded" ? "bounded" : "review_required",
    evidence_status: "reported",
  }))
  const hasPublicPatientName = namedRows.some(row => row.person && ["named_case_strong", "named_case_partial", "existing_case_likely"].includes(row.classification))
  const unnamed = hasPublicPatientName || !resolvedProvince ? [] : nearbyEventBlocks(segments).map(block => unnamedCandidate({ block, province: resolvedProvince, sourceUrl, sourceOrganization })).filter(Boolean)
  const incident_candidates = [...named, ...unnamed].filter((row, index, all) => all.findIndex(other => other.incident_fingerprint === row.incident_fingerprint) === index)
  const hasOfficialReview = /\b(?:ombudsperson|tribunal|commission|accepted complaint|finding|determination|inquest|coroner|disciplinary)\b/i.test(text)
  const hasInstitutionalResponse = /\b(?:health authority|health services|hospital|government).{0,80}\b(?:review|investigation|apolog|responded|statement)\b/i.test(text)
  const source_classification = incident_candidates.length > 1 ? "multi_incident_source"
    : named.length ? "named_individual_incident"
      : unnamed.length ? "unnamed_specific_incident"
        : hasOfficialReview ? "official_review_or_finding"
          : hasInstitutionalResponse ? "institutional_response"
            : /\b(?:systemic|study|survey|prevalence|policy|framework|strategy)\b/i.test(text) || (indigenousContext.test(text) && /\bpatients?\b/i.test(text) && /\b(?:racism|discrimination)\b/i.test(text)) ? "systemic_context"
              : "insufficient_detail"
  return { source_classification, incident_candidates, named_case_candidates: namedRows, normalized_source_completeness: normalizedSource?.retrieval_completeness || "metadata_only", source_has_multiple_separable_events: incident_candidates.length > 1 }
}
