import { createHash } from "node:crypto"

export const LEGAL_PROCESS_ROLES = Object.freeze([
  "complaint_allegation",
  "procedural_decision",
  "merits_decision",
  "settlement",
  "regulator_agreement",
  "judicial_review",
  "appeal",
  "final_judgment",
  "implementation_follow_up",
])

export const LEGAL_PROJECT_DESTINATIONS = Object.freeze([
  "miller",
  "miller_north",
  "both",
  "private_review",
])

const PROCESS_ROLE_SET = new Set(LEGAL_PROCESS_ROLES)
const DESTINATION_SET = new Set(LEGAL_PROJECT_DESTINATIONS)
const PRIVATE_KEY = /^(?:owner|private|internal|patient|complainant|review_note|raw_narrative)/i

const clean = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim()

export function canonicalLegalUrl(value) {
  try {
    const url = new URL(clean(value))
    url.hash = ""
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key)
    }
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/"
    return url.toString()
  } catch {
    return ""
  }
}

export function normalizeLegalCitation(value) {
  return clean(value)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase()
}

export function legalDocumentFingerprint(record) {
  const parts = [
    normalizeLegalCitation(record.citation),
    clean(record.court_or_tribunal).toLowerCase(),
    clean(record.decision_date),
    canonicalLegalUrl(record.source_url),
    clean(record.process_role).toLowerCase(),
    clean(record.public_summary).toLowerCase(),
  ]
  return createHash("sha256").update(parts.join("\u001f")).digest("hex")
}

export function legalEventFingerprint(record) {
  const eventKey = clean(record.related_event_id || record.case_name || record.anonymized_title)
    .toLowerCase()
    .replace(/\b(?:v|vs|versus)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  const parts = [eventKey, clean(record.jurisdiction).toLowerCase(), clean(record.accountable_organization).toLowerCase()]
  return createHash("sha256").update(parts.join("\u001f")).digest("hex")
}

function hasPrivateKey(value) {
  return Boolean(value && typeof value === "object" && Object.entries(value).some(([key, nested]) => PRIVATE_KEY.test(key) || hasPrivateKey(nested)))
}

export function validateLegalRecord(record, { publicProjection = false } = {}) {
  if (!record || typeof record !== "object") throw new Error("invalid_legal_record")
  if (!clean(record.legal_record_id) || !clean(record.case_name) || !normalizeLegalCitation(record.citation)) throw new Error("missing_legal_identity")
  if (!clean(record.court_or_tribunal) || !/^\d{4}-\d{2}-\d{2}$/.test(clean(record.decision_date))) throw new Error("invalid_legal_source_metadata")
  if (!PROCESS_ROLE_SET.has(record.process_role)) throw new Error("invalid_legal_process_role")
  if (!DESTINATION_SET.has(record.project_destination)) throw new Error("invalid_legal_project_destination")
  if (!/^https:\/\//.test(canonicalLegalUrl(record.source_url))) throw new Error("invalid_legal_source_url")
  if (!Array.isArray(record.findings) || !Array.isArray(record.allegations)) throw new Error("invalid_legal_findings_shape")
  if (["complaint_allegation", "procedural_decision"].includes(record.process_role) && record.findings.some(finding => /discriminat|negligen|liab|racis/i.test(finding))) {
    throw new Error("procedural_record_contains_merits_finding")
  }
  if (record.process_role === "settlement" && record.admission_of_liability === true && !record.source_explicitly_states_admission) {
    throw new Error("unsupported_settlement_admission")
  }
  if (publicProjection && (record.public_disposition !== "publication_safe" || hasPrivateKey(record))) throw new Error("private_legal_record_exposed")
  return true
}

export function validateLegalSourceRegistry(registry) {
  if (registry?.schema_version !== "miller-legal-source-registry-v1" || !Array.isArray(registry.sources)) throw new Error("invalid_legal_source_registry")
  const ids = new Set()
  for (const source of registry.sources) {
    if (!source.source_id || ids.has(source.source_id)) throw new Error("duplicate_legal_source_id")
    if (!/^https:\/\//.test(canonicalLegalUrl(source.public_url)) || !/^https:\/\//.test(canonicalLegalUrl(source.index_url))) throw new Error("invalid_legal_registry_url")
    if (!Array.isArray(source.document_types) || !source.document_types.length) throw new Error("missing_legal_document_types")
    if (!Array.isArray(source.project_relevance) || !source.project_relevance.every(project => ["miller", "miller_north"].includes(project))) throw new Error("invalid_legal_project_relevance")
    ids.add(source.source_id)
  }
  return { valid: true, total: registry.sources.length, by_project: {
    miller: registry.sources.filter(source => source.project_relevance.includes("miller")).length,
    miller_north: registry.sources.filter(source => source.project_relevance.includes("miller_north")).length,
  } }
}

export function reconcileLegalRecords(records = []) {
  const byCitation = new Map()
  const byEvent = new Map()
  const results = []
  for (const record of records) {
    validateLegalRecord(record)
    const citation = normalizeLegalCitation(record.citation)
    const documentFingerprint = legalDocumentFingerprint(record)
    const eventFingerprint = legalEventFingerprint(record)
    let reconciliation = "new_legal_matter"
    if (byCitation.has(citation)) reconciliation = "duplicate_decision"
    else if (byEvent.has(eventFingerprint)) reconciliation = "new_legal_evidence_for_existing_matter"
    byCitation.set(citation, documentFingerprint)
    byEvent.set(eventFingerprint, record.legal_record_id)
    results.push({ ...record, canonical_source_url: canonicalLegalUrl(record.source_url), document_fingerprint: documentFingerprint, event_fingerprint: eventFingerprint, reconciliation })
  }
  return results
}

export function compareLegalListenerCycle(currentRecords = [], previousState = { documents: [] }) {
  const previousById = new Map((previousState.documents || []).map(document => [document.legal_record_id, document]))
  const documents = reconcileLegalRecords(currentRecords).map(record => {
    const prior = previousById.get(record.legal_record_id)
    const change = !prior ? "new_document" : prior.document_fingerprint === record.document_fingerprint ? "unchanged" : "updated_document"
    return { legal_record_id: record.legal_record_id, citation: record.citation, document_fingerprint: record.document_fingerprint, event_fingerprint: record.event_fingerprint, change, process_role: record.process_role, source_url: record.canonical_source_url }
  })
  return {
    schema_version: "miller-legal-listener-cycle-v1",
    documents,
    summary: {
      checked: documents.length,
      new_documents: documents.filter(document => document.change === "new_document").length,
      updated_documents: documents.filter(document => document.change === "updated_document").length,
      unchanged_documents: documents.filter(document => document.change === "unchanged").length,
    },
  }
}
