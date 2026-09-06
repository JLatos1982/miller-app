import { readFile, writeFile } from "node:fs/promises"

import { buildMillerNorthPublicIncidentPresentation, validateMillerNorthPublicIncidentPresentation } from "../server/millerNorthPublicPresentation.js"
import { liveListeningId, MILLER_NORTH_LIVE_LISTENING_SCHEMA, validateMillerNorthLiveListeningProjection } from "../server/millerNorthLiveListeningPublic.js"

const root = new URL("../", import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"))
const writeJson = async (path, value) => writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`)

const rawProjection = await readJson("src/data/indigenous-healthcare-evidence-public-v1.json")
const proposals = await readJson("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json")
const socialLeads = await readJson("artifacts/miller-north/miller-north-social-leads-v1.json")
const presentation = buildMillerNorthPublicIncidentPresentation(rawProjection.records)
const validation = validateMillerNorthPublicIncidentPresentation(presentation, rawProjection.records)
const publicPresentation = { schema_version: presentation.schema_version, generated_at: presentation.generated_at, mode: presentation.mode, metrics: presentation.metrics, groups: presentation.groups }

const leadCatalog = Object.freeze({
  "mnc_kitimat-pregnancy-review-2021": { evidence_state: "corroborated_public_report", title: "Pregnancy-care concerns followed by a health-system review", summary: "A public source reported that an Indigenous patient was turned away from a Kitimat hospital before a stillbirth at another hospital, and that the B.C. health minister said a review was underway. The reporting records family allegations and a review response; it does not establish a finding about the care.", municipality: "Kitimat and Terrace", facility: "Kitimat hospital and a Terrace hospital", date_label: "Reported in January 2021" },
  "mnc_connor-sutton-vancouver-island-2020": { evidence_state: "corroborated_public_report", title: "Family-reported concerns about care at two Island hospitals", summary: "An Indigenous-led public report described a family's account of racist treatment and care concerns at two Vancouver Island hospitals. The health authority acknowledged that systemic anti-Indigenous racism exists within the system; the source did not publish a formal finding about the individual care episode.", municipality: "Vancouver Island", facility: "Cowichan District Hospital and Royal Jubilee Hospital", date_label: "Reported in 2020" },
  "mnc_myra-crow-chief-strathmore-2022": { evidence_state: "corroborated_public_report", title: "Human-rights complaint concerning hospital care", summary: "A First Nations government public source reported that the Alberta Human Rights Commission accepted a complaint alleging anti-Indigenous discrimination connected to care at Strathmore Hospital. Acceptance of a complaint is a legal-process step, not a finding on its merits.", municipality: "Strathmore", facility: "Strathmore Hospital", date_label: "Care reported in 2022; complaint publicized in September 2023" },
  "mnc_janelle-orcherton-regina-general-2021": { evidence_state: "verification_in_progress", title: "Reported stereotyping during an emergency visit", summary: "A public report described an Indigenous patient's account of racist stereotyping and communication concerns during an emergency-department visit. The health authority said it was following up and apologized that the patient felt heritage influenced the care; no later public outcome was located in the existing research set.", municipality: "Regina", facility: "Regina General Hospital emergency department", date_label: "Event reported for late November 2021" },
  "mnc_pearl-gambler-misericordia-2020": { evidence_state: "corroborated_public_report", title: "Legal and human-rights processes concerning maternity care", summary: "Public reporting described allegations that race affected maternity care at an Edmonton hospital and documented related court, professional-regulator and human-rights complaint processes. These are reported allegations and procedural steps, not adjudicated findings.", municipality: "Edmonton", facility: "Misericordia Hospital", date_label: "Care reported for June 2020; legal reporting published in 2022 and 2023", support_first: true },
  "mnc_marissa-smoke-cardston-2021": { evidence_state: "verification_in_progress", title: "Reported stereotyping during hospital care", summary: "A public report described a First Nations patient's account of disrespectful treatment and stereotyping at a southern Alberta hospital. The report said complaints were filed and the health authority opened an investigation; a later public result was not located in the existing research set.", municipality: "Cardston", facility: "Cardston Health Centre", date_label: "Event reported for March 25, 2021" },
  "mnc_thomas-favel-regina-general-2022": { evidence_state: "linked_existing_incident", title: "Hospital complaint linked to an Evidence Library record", summary: "An Indigenous news source publicly reported that a First Nations patient and family filed an ombudsperson complaint alleging racism and discrimination during hospital treatment. Additional news organizations reported the same underlying account; the item links to the more developed Evidence Library record.", municipality: "Regina", facility: "Regina General Hospital", date_label: "Event reported for September 30, 2022" },
  "mnc_brydon-lafavour-prince-albert-2025": { evidence_state: "corroborated_public_report", title: "Hospital security response after an internal review", summary: "Public reporting described a First Nations patient being removed from a Prince Albert emergency department. The reporting said the health authority's internal review found that the guards' actions did not meet its standards and that the guards were barred from its facilities.", municipality: "Prince Albert", facility: "Victoria Hospital emergency department", date_label: "Event reported for December 11, 2025" },
  "mnc_leo-manson-nanaimo-2022": { evidence_state: "corroborated_public_report", title: "Family complaint and health-authority response", summary: "Public sources reported a First Nations family's complaint about an Elder's hospital treatment. The health authority acknowledged that the care was not culturally safe while not attributing the individual treatment directly to heritage; the item preserves that distinction.", municipality: "Nanaimo", facility: "Nanaimo Regional General Hospital", date_label: "Event reported for May 25, 2022" },
  "mnc_jaali-sutherland-weenie-saskatoon-2026": { evidence_state: "verification_in_progress", title: "Family calls for an independent review after a hospital death", summary: "A public report described a family's concerns after an Indigenous patient died during delivery at a Saskatoon hospital and their call for an independent investigation. The family position is presented as a reported account; no independent finding is implied.", municipality: "Saskatoon", facility: "Jim Pattison Children's Hospital", date_label: "Reported in May 2026" },
  "mnc_yvonne-houssin-port-alberni-2018": { evidence_state: "corroborated_public_report", title: "Reported stereotyping during a hospital visit", summary: "Public reporting described a Métis patient's account of being questioned about drugs and alcohol during a hospital visit and her view that she was singled out as an Indigenous patient. The item records a public account, not an adjudicated finding.", municipality: "Port Alberni", facility: "West Coast General Hospital", date_label: "Event reported for 2018" },
  "mnc_dexter-adams-royal-alexandra-2024": { evidence_state: "corroborated_public_report", title: "Family seeks answers after braids were cut during hospital care", summary: "Several public reports described a family's account that an Indigenous patient's braids were cut and discarded during an Edmonton hospital stay without family knowledge or consent. The health authority called the incident deeply regrettable; that response is not presented as a finding about individual intent.", municipality: "Edmonton", facility: "Royal Alexandra Hospital", date_label: "Event reported for 2024" },
  "mnc_janette-sanderson-victoria-hospital-2020": { evidence_state: "corroborated_public_report", title: "Reported injury concern followed by a health-authority investigation", summary: "An Indigenous news source reported a Cree patient's account of severe pain and swelling after an injection during an emergency visit. Public reporting said a First Nations organization called for an investigation and the health authority was investigating; no clinical-cause finding is implied.", municipality: "Prince Albert", facility: "Victoria Hospital emergency department", date_label: "Event reported for June 30, 2020" },
  "mnc_nathan-cushman-south-health-campus-2021": { evidence_state: "verification_in_progress", title: "Family complaint concerning stereotyping and hospital care", summary: "A public report described an Indigenous patient and family's account of stereotyping and care concerns during a Calgary hospital admission. The report said a complaint was filed and the health authority assigned a patient-concerns consultant; no later public determination was located in the existing research set.", municipality: "Calgary", facility: "South Health Campus", date_label: "Admission reported for June 11–16, 2021" },
  "mnc_leonard-lenny-sylvester-island-health-2025": { evidence_state: "corroborated_public_report", title: "Family seeks review after a hospital death", summary: "Multiple public reports described a First Nations family's concerns following a patient's death after hospital treatment. Reporting said the health authority apologized directly and committed to a full review with family participation; the item does not state a finding about cause, care or intent.", municipality: "Cowichan Valley and Victoria", facility: "Cowichan District Hospital and Victoria General Hospital", date_label: "Death reported for November 20, 2025" },
})

const groupsBySourceUrl = new Map()
for (const group of presentation.groups) for (const source of group.sources) groupsBySourceUrl.set(source.url, group.public_record_id)
const publicSource = (source, role = "primary_public_report") => ({ role, organization: source.organization || source.source_organization || "Public source", title: `${source.organization || source.source_organization || "Public source"} report`, source_type: source.source_type || "public_reporting", publication_date: source.publication_date || null, url: source.url || source.source_url })
const candidateSources = (candidate, config) => {
  const primary = publicSource({ organization: candidate.source_organization, source_type: candidate.source_type, publication_date: candidate.publication_date, url: candidate.source_url })
  const supporting = (candidate.supporting_sources || []).filter(source => source.url).map(source => publicSource(source, "corroborating_public_report"))
  return config.support_first && supporting.length ? [supporting[0], primary, ...supporting.slice(1)] : [primary, ...supporting]
}

const items = proposals.candidates.filter(candidate => leadCatalog[candidate.candidate_id]).map(candidate => {
  const config = leadCatalog[candidate.candidate_id]
  const sources = candidateSources(candidate, config)
  const linked = [candidate.source_url, ...(candidate.supporting_sources || []).map(source => source.url)].map(url => groupsBySourceUrl.get(url)).find(Boolean) || null
  return {
    listening_item_id: liveListeningId(candidate.source_url),
    title: config.title,
    summary: config.summary,
    province: candidate.province,
    municipality: config.municipality,
    facility: config.facility,
    event_date: candidate.event_date || null,
    event_year: candidate.event_year || candidate.approximate_event_year || null,
    date_label: config.date_label,
    source_publication_date: candidate.publication_date || null,
    last_checked_date: "2026-09-06",
    evidence_state: config.evidence_state,
    corroboration_located: sources.length > 1,
    linked_evidence_group_id: linked,
    linked_evidence_href: linked ? `/indigenous-healthcare-evidence?group=${linked}` : null,
    sources,
  }
}).sort((left, right) => (right.event_date || String(right.event_year || "") || right.source_publication_date || "").localeCompare(left.event_date || String(left.event_year || "") || left.source_publication_date || ""))

const heldCandidateIds = proposals.candidates.filter(candidate => !leadCatalog[candidate.candidate_id]).map(candidate => candidate.candidate_id)
const duplicateSocialLead = socialLeads.leads.find(lead => lead.verification_state === "matched_existing_incident")
const unresolvedSocialLead = socialLeads.leads.find(lead => lead.verification_state !== "matched_existing_incident")
const liveListening = {
  schema_version: MILLER_NORTH_LIVE_LISTENING_SCHEMA,
  generated_at: new Date().toISOString(),
  publication_scope: "publication_safe_public_sources",
  methodology: "Recent public-source signals under review. These records are not canonical incident findings and may later be linked, reconciled, retained as context, or withheld.",
  metrics: { leads_inspected: proposals.candidates.length + socialLeads.leads.length, items_displayed: items.length, linked_existing_incidents: items.filter(item => item.linked_evidence_group_id).length, duplicates_suppressed: duplicateSocialLead ? 1 : 0, held_back: heldCandidateIds.length + (unresolvedSocialLead ? 1 : 0) },
  items,
}
const liveValidation = validateMillerNorthLiveListeningProjection(liveListening, { evidenceGroupIds: presentation.groups.map(group => group.public_record_id) })

await Promise.all([
  writeJson("src/data/indigenous-healthcare-evidence-groups-public-v1.json", publicPresentation),
  writeJson("src/data/miller-north-live-listening-public-v1.json", liveListening),
  writeJson("artifacts/miller-north/miller-north-incident-presentation-reconciliation-2026-09-06.json", { ...presentation, validation, note: "Database/source-derived rows are not equivalent to distinct incidents. No underlying row was changed or deleted." }),
  writeJson("artifacts/miller-north/miller-north-live-listening-publication-review-2026-09-06.json", { generated_at: new Date().toISOString(), mode: "private_owner_review", leads_inspected: liveListening.metrics.leads_inspected, publication_safe_items: items.length, linked_to_existing_incidents: liveListening.metrics.linked_existing_incidents, duplicates_suppressed: duplicateSocialLead ? [{ source_url: duplicateSocialLead.source_url, reason: "Non-independent social repost of an already represented candidate" }] : [], held_back: [...heldCandidateIds.map(candidate_id => ({ candidate_id, reason: candidate_id.includes("rene-whitstone") ? "Direct source retrieval was unavailable; indexed excerpt alone was insufficient for browser publication." : candidate_id.includes("penny-kerrigan") ? "Republished article lacked a stronger directly inspected source in the current set." : "Multiple distinct accounts share one long-form source and require individual owner review before Live Listening publication." })), ...(unresolvedSocialLead ? [{ source_url: unresolvedSocialLead.source_url, reason: "Public discussion did not establish enough incident identity or authoritative follow-up." }] : [])], owner_review_count: liveListening.metrics.held_back, public_projection_validation: liveValidation }),
  writeJson("artifacts/miller-north/miller-north-public-presentation-validation-2026-09-06.json", { incident_presentation: validation, live_listening: liveValidation, production_records_changed: false, destructive_merges: 0 }),
])

console.log(JSON.stringify({ incident_presentation: validation, live_listening: liveValidation }, null, 2))
