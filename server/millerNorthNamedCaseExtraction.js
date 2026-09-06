const clean = (value = "") => String(value).replace(/\s+/g, " ").trim()
const normal = (value = "") => clean(value).toLowerCase()
const sentenceFor = (text, term) => clean(text).split(/(?<=[.!?])\s+/).find((sentence) => normal(sentence).includes(normal(term))) || null
const facilityPattern = /(?:Royal University Hospital|Jim Pattison(?: Children's)? Hospital|Prince Albert Victoria Hospital|Victoria Hospital|Regina General Hospital|Misericordia Hospital|Royal Alexandra Hospital|University Hospital of Northern British Columbia|(?:[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4}\s+(?:Hospital|Health Centre|Health Center|Emergency Department)))/g
const namePattern = /\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s+(?:“[^”]+”\s+|[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)){1,2})\b/g
const officialTerms = /\b(?:Dr\.?|Chief|Minister|Premier|CEO|president|professor|researcher|journalist|reporter|ombudsperson|spokes(?:man|woman|person)|mayor|nurse|physician|health authority|FSIN|APTN|CBC|Global News)\b/i
const encounterTerms = /\b(?:patient|treated|treatment|admitted|emergency|ER|hospitalized|died|death|discharged|released|refused|denied|wait(?:ed|ing)?|security|restrain(?:ed)?|removed|injection|surgery|delivery|pain|care)\b/i
const patientTerms = /\b(?:patient|family|mother|father|elder|woman|man|child|baby|widow|brother|sister|daughter|son)\b/i
const excludedNames = new Set(["First Nations", "Global News", "Indigenous People", "Health Authority", "Royal University", "Prince Albert", "Saskatchewan Health", "Alberta Health", "British Columbia", "The First", "The Saskatchewan", "First Nations Health", "Canada Health", "Indian Hospitals", "Federal Indian", "Current Problems", "Health Care", "Human Rights", "Family Left", "Call For", "No Discipline", "No Easy", "Covenant Health", "Kash Shade Saakooyinaa", "Custom Head", "Kings Bench", "King's Bench", "Court Of", "Court Of Kings", "Civilian Review", "Complaints Commission"])
const nonPersonTokens = /\b(?:But|Social|Sharing|Article|Content|Account|Finally|Trending|Latest|Stories|Contact|Login|Author|About|Editorial|Policy|Photo|Postmedia|NHL|Oilers|Apologies|Boston|What|Unity|Trek|Water|Dialogue|Centre|Community|Care|Tower|Milestone|Construction|Hospital|In|January|February|March|April|May|June|July|August|September|October|November|December|Civilian|Review|Complaints|Commission|Our|Commitment|Each|Other|Wishes|Logo|Translation|Services|Ombudsman|Family|Leadership|Council|Access|Weight|Bias)\b/

function namesIn(text) {
  const names = new Set()
  const bylines = new Set([...text.matchAll(/content="([^"]+)"\s+itemprop="author"|name="author"\s+content="([^"]+)"/gi)].map((match) => clean(match[1] || match[2]).split(/[|,]/)[0]))
  for (const match of text.matchAll(namePattern)) {
    const name = clean(match[1])
    if (name.split(" ").length < 2 || excludedNames.has(name) || bylines.has(name) || nonPersonTokens.test(name) || /\b(?:Hospital|Health|News|First|Indigenous|Saskatchewan|Alberta|British|Canada|Court|Kings? Bench|King's Bench|Civilian|Complaints|Commission)\b/.test(name)) continue
    names.add(name)
  }
  return [...names]
}

function facilitiesIn(text) { return [...new Set([...text.matchAll(facilityPattern)].map((match) => clean(match[0]).replace(/^(?:At|The)\s+/, "")))] }
function yearIn(text) { const matches = [...text.matchAll(/\b(202[4-6]|20(?:0|1|2)\d)\b/g)].map((match) => Number(match[1])); return matches[0] || null }
const personKey = (value = "") => normal(value).split(/\s+/).filter(Boolean).sort().join(" ")
function provinceFor({ text, province }) { if (province && province !== "unknown") return province; if (/\bSaskatchewan|Saskatoon|Regina|Prince Albert\b/i.test(text)) return "saskatchewan"; if (/\bAlberta|Edmonton|Calgary|Maskwacis\b/i.test(text)) return "alberta"; if (/\bBritish Columbia|B\.C\.|Vancouver|Victoria\b/i.test(text)) return "british_columbia"; return null }
function municipalityFor(text) { const match = text.match(/\b(Saskatoon|Regina|Prince Albert|Edmonton|Calgary|Maskwacis|Wetaskiwin|Vancouver|Victoria|Nanaimo|Terrace|Prince George)\b/i); return match ? match[1] : null }
function sourceInput({ title, excerpt, normalizedSource }) {
  if (!normalizedSource) return { text: clean(`${title}. ${excerpt}`), title, segments: [] }
  const segments = normalizedSource.evidence_segments || []
  return { text: clean(`${normalizedSource.title || title || ""}. ${segments.map(segment => segment.text).join(" ")}`), title: normalizedSource.title || title, segments }
}
function evidenceFor({ text, term, segments = [] }) {
  const segment = segments.find(item => normal(item.text).includes(normal(term))) || null
  return { text: sentenceFor(segment?.text || text, term), evidence_span_id: segment?.evidence_span_id || null }
}
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function extractMillerNorthNamedCases({ title = "", excerpt = "", sourceUrl = "", sourceOrganization = "", province = null, existingIncidents = [], normalizedSource = null } = {}) {
  const input = sourceInput({ title, excerpt, normalizedSource })
  const text = input.text, facilities = facilitiesIn(text), names = namesIn(text)
  const patientContext = patientTerms.test(text), hasOfficialOnly = officialTerms.test(text) && !patientContext
  const candidates = names.map((person) => {
    const personEvidenceEntry = evidenceFor({ text, term: person, segments: input.segments })
    const personEvidence = personEvidenceEntry.text
    const personSegmentIndex = input.segments.findIndex(segment => normal(segment.text).includes(normal(person)))
    const localText = personSegmentIndex >= 0 ? input.segments.slice(Math.max(0, personSegmentIndex - 2), personSegmentIndex + 3).map(segment => segment.text).join(" ") : text
    const localFacilities = facilitiesIn(localText)
    const localEncounter = clean(localText).split(/(?<=[.!?])\s+/).find(sentence => encounterTerms.test(sentence)) || null
    const candidateIdentityContext = /\b(?:Indigenous|First Nations|Métis|Cree|Dene|Anishinaabe|Haida|Penelakut)\b/i.test(localText)
    const candidatePatientContext = patientTerms.test(localText)
    const candidateOutsideScope = /\b(?:Windsor|Ontario|Manitoba|Quebec|Nunavut|New Brunswick|Nova Scotia|Massachusetts|Ohio|United States)\b/i.test(localText)
    // A name near a hospital is not enough. It must be syntactically tied to
    // a care event or to an explicitly named close family account of that
    // event. This keeps officials, campaigns, and page chrome out of the
    // paid named-case lane.
    const personLink = new RegExp("\\b" + escapeRegex(person) + "\\b[^.!?]{0,100}\\b(?:was|died|received|treated|admitted|hospitalized|denied|refused|removed|discharged|waited|underwent|gave birth|experienced|patient)\\b|\\b(?:wife|husband|mother|father|daughter|son|sister|brother)\\s+of\\s+(?:the\\s+)?" + escapeRegex(person) + "\\b|\\b" + escapeRegex(person) + "\\b[^.!?]{0,50}\\bsaid\\s+(?:her|his|their)\\s+(?:mother|father|daughter|son|sister|brother)\\b", "i").test(localText)
    const facility = localFacilities.find((item) => (personEvidence && normal(personEvidence).includes(normal(item))) || clean(localText).split(/(?<=[.!?])\s+/).some(sentence => encounterTerms.test(sentence) && normal(sentence).includes(normal(item)))) || (localFacilities.length === 1 ? localFacilities[0] : null)
    const facilityEvidenceEntry = facility ? evidenceFor({ text, term: facility, segments: input.segments }) : { text: null, evidence_span_id: null }
    const facilityEvidence = facilityEvidenceEntry.text
    const encounterSegment = personSegmentIndex >= 0 ? input.segments.slice(Math.max(0, personSegmentIndex - 2), personSegmentIndex + 3).find(segment => encounterTerms.test(segment.text) && (!facility || normal(segment.text).includes(normal(facility)))) || null : input.segments.find(segment => encounterTerms.test(segment.text) && (!facility || normal(segment.text).includes(normal(facility)))) || null
    const encounterEvidence = personEvidence && encounterTerms.test(personEvidence) ? personEvidence : clean(encounterSegment?.text || localEncounter || "") || null
    const isPhotoCredit = new RegExp("\\bphoto by\\s+" + escapeRegex(person) + "\\b", "i").test(personEvidence || "")
    const isFamilyReporter = new RegExp("\\b" + escapeRegex(person) + ",?\\s+(?:wife|husband|mother|father|daughter|son|sister|brother)\\s+of\\b", "i").test(personEvidence || "")
    const legalOrInstitutionalName = /\b(?:court|king'?s bench|judge|justice|tribunal|lawsuit)\b/i.test(`${personEvidence || ""} ${localText}`)
    const isOfficial = (officialTerms.test(personEvidence || "") || isPhotoCredit || legalOrInstitutionalName) && !/\b(?:was treated|was admitted|died|was removed|was discharged|received care|underwent|gave birth)\b/i.test(personEvidence || "")
    const existing = existingIncidents.find((incident) => normal(incident.working_title).includes(normal(person)) || personKey(incident.working_title).includes(personKey(person)))
    let classification = "insufficient"
    if (candidateOutsideScope) classification = "insufficient"
    else if (isOfficial) classification = candidatePatientContext ? "named_case_partial" : "organization_or_official_name"
    else if (hasOfficialOnly && !encounterEvidence) classification = "organization_or_official_name"
    else if (existing && encounterEvidence) classification = "existing_case_likely"
    else if (facility && encounterEvidence && candidatePatientContext && personLink && !isFamilyReporter) classification = "named_case_strong"
    else if (((facility && candidatePatientContext) || (encounterEvidence && candidatePatientContext)) && personLink) classification = "named_case_partial"
    else if (personEvidence) classification = "context_name_only"
    const event_year = yearIn(encounterEvidence || "")
    const concernEntry = /\b(?:racism|racist|discrimination|mistreatment|neglect|complaint|investigation)\b/i.test(text) ? evidenceFor({ text, term: /racism/i.test(text) ? "racism" : /discrimination/i.test(text) ? "discrimination" : "complaint", segments: input.segments }) : { text: null, evidence_span_id: null }
    const responseSegment = input.segments.find(segment => /\b(?:health authority|review|investigation|apolog)\b/i.test(segment.text)) || null
    const evidence = { person: personEvidence, facility: facilityEvidence, encounter: encounterEvidence, event_year: event_year ? sentenceFor(text, String(event_year)) : null, evidence_span_ids: { person: personEvidenceEntry.evidence_span_id, facility: facilityEvidenceEntry.evidence_span_id, encounter: encounterSegment?.evidence_span_id || personEvidenceEntry.evidence_span_id, concern: concernEntry.evidence_span_id, institutional_response: responseSegment?.evidence_span_id || null } }
    const score = (classification === "named_case_strong" ? 18 : classification === "named_case_partial" ? 9 : 0) + (event_year && event_year >= 2025 ? 4 : 0) + (/(complaint|investigation|review|apolog|human rights)/i.test(localText) ? 3 : 0) + (/(aptn|fsin|ckom|global news|cbc)/i.test(`${sourceOrganization || normalizedSource?.source_organization || ""} ${input.title || ""}`) ? 2 : 0) + (["saskatchewan", "alberta"].includes(provinceFor({ text, province })) ? 2 : 0) - (candidateIdentityContext ? 0 : 20) - (classification === "existing_case_likely" ? 15 : 0)
    return { classification, person: isOfficial ? null : person, facility, municipality: municipalityFor(text), province: provinceFor({ text, province }), care_setting: facility ? "healthcare facility" : null, event_date: null, event_year, approximate_event_year: null, concrete_encounter: encounterEvidence ? clean(encounterEvidence) : null, reported_concern: concernEntry.text, institutional_response: responseSegment ? clean(responseSegment.text).split(/(?<=[.!?])\s+/).find((sentence) => /\b(?:health authority|review|investigation|apolog)\b/i.test(sentence)) || null : null, source_url: sourceUrl || normalizedSource?.url || "", source_organization: sourceOrganization || normalizedSource?.source_organization || null, source_publication_year: yearIn(normalizedSource?.publication_date || input.title), evidence, extraction_confidence: classification === "named_case_strong" ? "bounded" : classification === "named_case_partial" ? "limited" : "unresolved", expected_value_score: score, likely_existing_incident_id: existing?.id || null }
  })
  if (!candidates.length) return [{ classification: hasOfficialOnly ? "organization_or_official_name" : "insufficient", person: null, facility: facilities[0] || null, municipality: municipalityFor(text), province: provinceFor({ text, province }), care_setting: facilities[0] ? "healthcare facility" : null, event_date: null, event_year: null, approximate_event_year: null, concrete_encounter: null, reported_concern: null, institutional_response: null, source_url: sourceUrl || normalizedSource?.url || "", source_organization: sourceOrganization || normalizedSource?.source_organization || null, source_publication_year: yearIn(normalizedSource?.publication_date || input.title), evidence: { evidence_span_ids: {} }, extraction_confidence: "unresolved", expected_value_score: 0, likely_existing_incident_id: null }]
  return candidates
}
