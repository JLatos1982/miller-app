import { createHash } from "node:crypto"

export const MILLER_NORTH_LISTENER_MEMORY_VERSION = "miller-north-listener-memory-v1"
export const MILLER_NORTH_LISTENER_ADAPTERS = Object.freeze([
  { adapter_id: "indigenous_media", label: "Indigenous media and governance newsrooms", source_families: ["APTN News", "IndigiNews", "First Nations health organizations", "Nation and tribal council newsrooms"], modes: ["site_search", "newsroom_listing"], priorities: ["named incident", "institutional response", "Indigenous-led assessment"] },
  { adapter_id: "regulators", label: "Professional regulators", source_families: ["provincial medical, nursing and allied-health colleges"], modes: ["decision_index", "site_search"], priorities: ["disciplinary decision", "undertaking", "conduct finding", "practice restriction"] },
  { adapter_id: "human_rights", label: "Human-rights bodies", source_families: ["B.C. Human Rights Tribunal", "Alberta Human Rights Commission", "Saskatchewan Human Rights Commission"], modes: ["decision_search", "case_summary_search"], priorities: ["merits decision", "accepted complaint", "public settlement", "judicial review"] },
  { adapter_id: "coroners_inquests", label: "Coroners, fatality inquiries and inquests", source_families: ["B.C. Coroners Service", "Alberta fatality inquiries", "Saskatchewan Coroners Service"], modes: ["report_index", "recommendation_search"], priorities: ["finding", "recommendation", "institutional response"] },
  { adapter_id: "health_system", label: "Health authorities and hospitals", source_families: ["provincial health authorities", "regional health organizations", "hospital newsrooms"], modes: ["newsroom_listing", "report_index"], priorities: ["incident response", "patient-safety review", "implementation update"] },
  { adapter_id: "courts", label: "Courts and judicial reviews", source_families: ["CanLII", "provincial courts"], modes: ["bounded_legal_search"], priorities: ["judgment", "judicial review", "healthcare human-rights matter"] },
  { adapter_id: "government_legislature", label: "Government and legislatures", source_families: ["Hansard", "committee records", "auditors", "ombudspersons", "public disclosure logs"], modes: ["dated_site_search", "document_index"], priorities: ["ministerial response", "implementation evidence", "aggregate complaint reporting"] },
])

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const canonicalUrl = value => { try { const url = new URL(value); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); return url.toString().replace(/\/$/, "") } catch { return clean(value) } }
const hash = value => createHash("sha256").update(clean(value)).digest("hex")
export const listenerDocumentId = source => hash(canonicalUrl(source.url)).slice(0, 24)
export const listenerSourceFingerprint = source => hash([canonicalUrl(source.url), clean(source.title), clean(source.publication_date), clean(source.text || source.summary)].join("\u001f"))
export const listenerEventFingerprint = source => hash([clean(source.province).toLowerCase(), clean(source.facility).toLowerCase(), clean(source.event_date || source.event_year), clean(source.event_type || source.title).toLowerCase()].join("\u001f")).slice(0, 24)

export function runMillerNorthListenerCycle(observations, previous = { documents: {} }, { checkedAt = new Date().toISOString() } = {}) {
  const prior = previous?.documents || {}, documents = { ...prior }, changes = []
  for (const source of observations) {
    if (!source?.url || !source?.title || !source?.adapter_id) continue
    const document_id = listenerDocumentId(source), source_fingerprint = listenerSourceFingerprint(source), event_fingerprint = listenerEventFingerprint(source)
    const old = prior[document_id]
    const relevance = ["potentially_relevant", "relevant_existing_incident", "relevant_new_incident_candidate", "irrelevant"].includes(source.relevance) ? source.relevance : "potentially_relevant"
    const state = !old ? "new_document" : old.source_fingerprint === source_fingerprint ? "already_seen_document" : "updated_document"
    const eventState = relevance === "irrelevant" ? "irrelevant_result" : source.related_incident_id ? "existing_incident_with_new_evidence" : source.new_incident_candidate ? "genuinely_new_incident_candidate" : "requires_verification"
    documents[document_id] = { document_id, adapter_id: source.adapter_id, url: canonicalUrl(source.url), title: clean(source.title), source_fingerprint, event_fingerprint, first_seen_at: old?.first_seen_at || checkedAt, last_checked_at: checkedAt, relevance, related_incident_id: source.related_incident_id || null, verification_state: source.verification_state || "verification_in_progress" }
    if (state !== "already_seen_document") changes.push({ document_id, document_state: state, event_state: eventState, material_change: state === "new_document" || source.material_change === true, owner_review_required: eventState !== "irrelevant_result", related_incident_id: source.related_incident_id || null })
  }
  const count = predicate => changes.filter(predicate).length
  return { schema_version: MILLER_NORTH_LISTENER_MEMORY_VERSION, checked_at: checkedAt, metrics: { documents_checked: observations.length, documents_new: count(item => item.document_state === "new_document"), documents_updated: count(item => item.document_state === "updated_document"), potentially_relevant: count(item => item.event_state !== "irrelevant_result"), adds_evidence_to_existing_incident: count(item => item.event_state === "existing_incident_with_new_evidence"), requires_verification: count(item => item.event_state === "requires_verification"), genuinely_new_incident_candidates: count(item => item.event_state === "genuinely_new_incident_candidate"), irrelevant: count(item => item.event_state === "irrelevant_result") }, changes, documents, publication_writes: 0, production_writes: 0 }
}

export function validateMillerNorthListenerMemory(value) {
  if (value?.schema_version !== MILLER_NORTH_LISTENER_MEMORY_VERSION || !value.metrics || !value.documents || value.publication_writes !== 0 || value.production_writes !== 0) throw new Error("miller_north_listener_memory_invalid")
  for (const item of Object.values(value.documents)) if (!/^[a-f0-9]{24}$/.test(item.document_id) || !/^[a-f0-9]{64}$/.test(item.source_fingerprint) || !/^https:/.test(item.url) || !MILLER_NORTH_LISTENER_ADAPTERS.some(adapter => adapter.adapter_id === item.adapter_id)) throw new Error("miller_north_listener_document_invalid")
  return { valid: true, documents: Object.keys(value.documents).length }
}

const LINK_STOP = new Set(["health", "healthcare", "patient", "patients", "public", "evidence", "indigenous", "first", "nations", "care", "report", "reported", "safety", "review", "response", "saskatchewan", "alberta", "british", "columbia", "calls", "hospital", "implementation"])
const terms = value => [...new Set(clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(term => term.length > 3 && !LINK_STOP.has(term)))]
const CHAIN_ANCHORS = Object.freeze({
  mnaw_in_plain_sight: ["in plain sight", "price is right game"],
  mnaw_fnho: ["fnho", "health ombudsperson", "ombudsperson office"],
  mnaw_alberta_patient_safety: ["patient safety investigator", "patient safety advocate", "health charter review"],
  mnaw_saskatoon_sterilization: ["coerced sterilization", "forced sterilization", "tubal ligation"],
  mnaw_alberta_primary_care_panel: ["primary health care advisory panel", "primary care advisory panel"],
})
export function suggestAccountabilityLinks(incident, chains) {
  const incidentText = [incident.title, incident.summary, incident.province, incident.municipality, incident.facility, ...(incident.sources || []).flatMap(source => [source.title, source.organization])].filter(Boolean).join(" ")
  const normalizedIncident = clean(incidentText).toLowerCase().replace(/[^a-z0-9]+/g, " ")
  const incidentTerms = new Set(terms(incidentText))
  return chains.map(chain => {
    const chainText = Object.values(chain).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => typeof value === "string").join(" ")
    const overlap = terms(chainText).filter(term => incidentTerms.has(term))
    const sameProvince = clean(chain.province).toLowerCase().replace("british columbia", "british_columbia") === clean(incident.province).toLowerCase()
    const anchorHits = (CHAIN_ANCHORS[chain.chain_id] || []).filter(anchor => normalizedIncident.includes(anchor))
    const score = anchorHits.length ? .55 + Math.min(.24, anchorHits.length * .12) + (sameProvince ? .15 : 0) : 0
    return { incident_id: incident.listening_item_id || incident.candidate_id, chain_id: chain.chain_id, confidence: Number(Math.min(.95, score).toFixed(2)), reason: anchorHits.length ? `${sameProvince ? "Same province; " : ""}explicit chain concept${anchorHits.length === 1 ? "" : "s"}: ${anchorHits.join(", ")}${overlap.length ? `; additional shared concepts: ${overlap.slice(0, 4).join(", ")}` : ""}.` : "No explicit chain anchor in the public incident record.", owner_review_required: true, relationship_status: score >= .8 ? "likely_existing_chain" : score >= .55 ? "possible_existing_chain" : "insufficient" }
  }).filter(item => item.relationship_status !== "insufficient").sort((a, b) => b.confidence - a.confidence || a.chain_id.localeCompare(b.chain_id)).slice(0, 3)
}
