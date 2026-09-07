import { createHash } from "node:crypto"

import {
  listenerDocumentId,
  runMillerNorthListenerCycle,
} from "./millerNorthListeningPipeline.js"

export const CORONER_SERIOUS_HARM_SCHEMA_VERSION = "miller-north-coroner-serious-harm-v1"

export const DOCUMENT_ROLES = Object.freeze([
  "source_index",
  "initial_notice",
  "coroner_finding",
  "jury_verdict",
  "fatality_inquiry_report",
  "death_review_panel_report",
  "recommendation",
  "organizational_response",
  "government_response",
  "regulator_finding",
  "court_decision",
  "followup_implementation",
  "statistical_context",
  "media_corroboration",
  "indigenous_led_report",
  "unclear",
])

export const MECHANISM_VOCABULARY = Object.freeze({
  discharge_or_sent_home: ["discharged", "sent home", "release from care", "after discharge"],
  refusal_or_denial: ["refused treatment", "refusal of care", "denied care", "would not treat", "left without being seen"],
  delay_or_missed_diagnosis: ["delayed care", "delay in diagnosis", "missed diagnosis", "repeat presentation", "returned to emergency"],
  intoxication_assumption: ["presumed intoxicated", "assumed intoxicated", "drug-seeking", "intoxication assumption"],
  security_or_police: ["hospital security", "protective services", "security officer", "police", "rcmp", "in custody"],
  restraint_or_seclusion: ["restraint", "restrained", "seclusion"],
  mental_health: ["mental health", "suicide", "suicidal", "involuntary", "mental health act"],
  ambulance_or_paramedic: ["ambulance", "paramedic", "ems", "emergency medical services"],
  transfer_or_medevac: ["patient transfer", "interfacility transfer", "air ambulance", "medevac", "flight paramedic", "transported to"],
  rural_or_remote: ["rural", "remote", "nursing station", "reserve", "first nation community"],
  deterioration_or_death: ["deterioration", "death after discharge", "died", "death", "fatal"],
  assessment_or_resuscitation: ["did not adequately assess", "resuscitative", "resuscitation", "unresponsive", "pulseless"],
  consent: ["without informed consent", "coerced", "consent"],
  complaint_or_investigation: ["complaint", "critical incident", "investigation", "inquest", "fatality inquiry"],
})

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const hash = value => createHash("sha256").update(clean(value)).digest("hex")
const normalize = value => clean(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

export const RECOMMENDATION_RESPONSE_STATUSES = Object.freeze({
  accepted: "accepted",
  "accepted in principle": "accepted_in_principle",
  "acceppted in principle": "accepted_in_principle",
  "not accepted": "not_accepted",
  other: "other",
  "waiting for response": "waiting_for_response",
  "no response": "no_response_recorded",
})

export function canonicalizeRecommendationId(value) {
  const match = clean(value).match(/recommendation\s+(\d+)/i)
  return match?.[1] || null
}

export function canonicalizeRecommendationResponseStatus(value) {
  const raw_status = clean(value)
  const normalizedStatus = raw_status.toLowerCase()
  return {
    raw_status,
    status: RECOMMENDATION_RESPONSE_STATUSES[normalizedStatus] || "unmapped",
    correction_applied: normalizedStatus === "acceppted in principle" ? "source_typo_normalized" : null,
  }
}

export function recommendationResponseRowFingerprint(record) {
  return hash(normalize([record.event_key, record.recommendation_id, record.responder, record.raw_response_status, record.response_date, record.recommendation_summary].join("|"))).slice(0, 24)
}

export function compareRecommendationResponseSnapshots(previous = [], current = []) {
  const before = new Map(previous.map(row => [row.row_key, row]))
  const added = [], changed = []
  for (const row of current) {
    const old = before.get(row.row_key)
    if (!old) added.push(row)
    else if (old.row_fingerprint !== row.row_fingerprint) changed.push({ row_key: row.row_key, before: old, after: row })
  }
  return { added, changed, removed: previous.filter(row => !current.some(next => next.row_key === row.row_key)), owner_review_required: added.length + changed.length > 0 }
}

export function classifySeriousHarmDocumentRole(document) {
  const explicit = clean(document?.document_role)
  if (DOCUMENT_ROLES.includes(explicit)) return { role: explicit, basis: "explicit", confidence: 1 }
  const text = normalize([document?.title, document?.summary, document?.agency, document?.source_family].filter(Boolean).join(" "))
  const rules = [
    ["regulator_finding", /consent agreement|discipline decision|practice restriction|public notification|inquiry committee/],
    ["jury_verdict", /jury verdict|verdict at coroner|verdict with coroner/],
    ["fatality_inquiry_report", /fatality inquiry report|report to the minister/],
    ["death_review_panel_report", /death review panel/],
    ["government_response", /government response|ministry response/],
    ["organizational_response", /response to recommendation|response letter|institutional response/],
    ["followup_implementation", /implementation update|progress report|follow up report/],
    ["court_decision", /court decision|judicial review|judgment/],
    ["coroner_finding", /coroner(?:'s)? report|coroner finding/],
    ["recommendation", /recommendation/],
    ["initial_notice", /inquest (?:schedule|notice)|dates? confirmed|inquest into/],
    ["statistical_context", /statistics|statistical report|data dashboard/],
    ["media_corroboration", /news|media|journalism/],
  ]
  const match = rules.find(([, pattern]) => pattern.test(text))
  return match ? { role: match[0], basis: "deterministic_text_rule", confidence: .92 } : { role: "unclear", basis: "no_rule_match", confidence: 0 }
}

export function tagSeriousHarmMechanisms(document) {
  const text = normalize([document?.title, document?.summary, document?.evidence_text].filter(Boolean).join(" "))
  return Object.entries(MECHANISM_VOCABULARY)
    .filter(([, phrases]) => phrases.some(phrase => text.includes(normalize(phrase))))
    .map(([tag]) => tag)
}

export function buildSeriousHarmQueries({ entities = [], province, mechanisms = [], limit = 24 } = {}) {
  const safeEntities = [...new Set(entities.map(clean).filter(Boolean))].slice(0, 12)
  const safeMechanisms = [...new Set(mechanisms.map(clean).filter(Boolean))]
  const selectedMechanisms = (safeMechanisms.length ? safeMechanisms : ["coroner", "inquest", "hospital", "emergency", "ambulance", "patient death", "recommendation response"]).slice(0, 8)
  const geography = clean(province)
  const queries = []
  for (const entity of safeEntities) for (const mechanism of selectedMechanisms) {
    queries.push([`"${entity}"`, mechanism, geography].filter(Boolean).join(" "))
    if (queries.length >= Math.min(48, Math.max(1, limit))) return queries
  }
  return queries
}

export function seriousHarmEventFingerprint(document) {
  const stableIdentity = document?.event_key || [document?.province, document?.event_date || document?.event_year, document?.facility, document?.public_case_name || document?.event_summary].join("|")
  return hash(normalize(stableIdentity)).slice(0, 24)
}

export function reconcileSeriousHarmDocuments(documents) {
  const events = new Map()
  for (const document of documents) {
    const event_fingerprint = seriousHarmEventFingerprint(document)
    const current = events.get(event_fingerprint) || {
      event_fingerprint,
      event_key: document.event_key || null,
      province: document.province,
      event_date: document.event_date || null,
      facility: document.facility || null,
      documents: [],
      roles: [],
      mechanism_tags: [],
    }
    const role = classifySeriousHarmDocumentRole(document).role
    current.documents.push({ document_id: listenerDocumentId(document), url: document.url, title: document.title, role })
    current.roles = [...new Set([...current.roles, role])]
    current.mechanism_tags = [...new Set([...current.mechanism_tags, ...tagSeriousHarmMechanisms(document)])]
    events.set(event_fingerprint, current)
  }
  return [...events.values()].sort((a, b) => `${a.province}|${a.event_date}|${a.event_fingerprint}`.localeCompare(`${b.province}|${b.event_date}|${b.event_fingerprint}`))
}

export function buildRecommendationResponseChains(records) {
  const chains = new Map()
  for (const record of records) {
    if (!record.event_key || !record.recommendation_id || !record.responsible_organization) continue
    const key = `${record.event_key}|${record.recommendation_id}`
    const chain = chains.get(key) || { event_key: record.event_key, recommendation_id: record.recommendation_id, recommendation_summary: record.recommendation_summary, responders: [], response_statuses: [], response_records: [], owner_review_required: true }
    chain.responders.push(record.responsible_organization || record.responder)
    if (record.response_status) chain.response_statuses.push(record.response_status)
    chain.response_records.push({
      responder: record.responsible_organization || record.responder,
      response_date: record.response_date || null,
      response_status: record.response_status || null,
      raw_response_status: record.raw_response_status || record.response_status || null,
      claimed_action: record.claimed_action || null,
      implementation_evidence: record.implementation_evidence || null,
      outcome_evidence: record.outcome_evidence || null,
      independent_verification: record.independent_verification || null,
      unresolved_question: record.unresolved_question || "What action, implementation evidence and outcome evidence are publicly available?",
    })
    chain.responders = [...new Set(chain.responders)]
    chain.response_statuses = [...new Set(chain.response_statuses)]
    chains.set(key, chain)
  }
  return [...chains.values()].sort((a, b) => a.event_key.localeCompare(b.event_key) || String(a.recommendation_id).localeCompare(String(b.recommendation_id), undefined, { numeric: true }))
}

export function exploreDocumentGraph(seed, branches, { maxDocuments = 12, maxDepth = 2 } = {}) {
  const byParent = new Map()
  for (const branch of branches) {
    const list = byParent.get(branch.parent_url) || []
    list.push(branch)
    byParent.set(branch.parent_url, list)
  }
  const queue = [{ document: seed, depth: 0 }], visited = new Set(), documents = [], stop_reasons = []
  while (queue.length && documents.length < maxDocuments) {
    const { document, depth } = queue.shift()
    const id = listenerDocumentId(document)
    if (visited.has(id)) { stop_reasons.push("repeating_document"); continue }
    visited.add(id)
    documents.push({ ...document, depth })
    if (depth >= maxDepth) { stop_reasons.push("maximum_depth_reached"); continue }
    for (const next of byParent.get(document.url) || []) queue.push({ document: next, depth: depth + 1 })
  }
  if (queue.length) stop_reasons.push("maximum_document_count_reached")
  if (!queue.length) stop_reasons.push("no_novel_public_branch_remaining")
  return { seed_url: seed.url, documents, unique_documents: documents.length, stop_reasons: [...new Set(stop_reasons)] }
}

export function runCoronerSeriousHarmListener(observations, previous, options = {}) {
  const enriched = observations.map(document => ({
    ...document,
    adapter_id: document.adapter_id || (document.source_family === "regulator" ? "regulators" : "coroners_inquests"),
    document_role: classifySeriousHarmDocumentRole(document).role,
    mechanism_tags: tagSeriousHarmMechanisms(document),
    event_fingerprint_v1: seriousHarmEventFingerprint(document),
  }))
  const memory = runMillerNorthListenerCycle(enriched, previous, options)
  const enrichedById = new Map(enriched.map(document => [listenerDocumentId(document), document]))
  const documents = Object.fromEntries(Object.entries(memory.documents).map(([id, value]) => {
    const source = enrichedById.get(id)
    return [id, source ? { ...value, source_family: source.source_family || null, document_role: source.document_role, mechanism_tags: source.mechanism_tags, event_fingerprint: source.event_fingerprint_v1 } : value]
  }))
  return {
    ...memory,
    documents,
    serious_harm_schema_version: CORONER_SERIOUS_HARM_SCHEMA_VERSION,
    reconciled_events: reconcileSeriousHarmDocuments(enriched),
  }
}

export function validateCoronerSourceRegistry(registry) {
  if (registry?.schema_version !== "miller-north-coroner-serious-harm-source-registry-v1" || !Array.isArray(registry.sources)) throw new Error("coroner_source_registry_invalid")
  const ids = new Set()
  for (const source of registry.sources) {
    if (!source.source_id || ids.has(source.source_id) || !["british_columbia", "alberta", "saskatchewan", "canada"].includes(source.province) || !/^https:/.test(source.homepage_or_index) || typeof source.direct_public_access !== "boolean" || !source.query_method || !source.priority || !source.last_checked || !Array.isArray(source.document_types)) throw new Error("coroner_source_registry_source_invalid")
    ids.add(source.source_id)
  }
  return { valid: true, source_count: registry.sources.length }
}
