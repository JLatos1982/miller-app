import { createHash } from "node:crypto"

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)

export function normalizePalantirEvent(input = {}) {
  const title = clean(input.title, 180)
  if (!title) throw new Error("palantir_event_title_required")
  const sourceDocuments = (input.source_documents || []).map(item => ({
    document_id: clean(item.document_id, 180),
    source_url: /^https:\/\//.test(String(item.source_url || "")) ? clean(item.source_url, 500) : null,
    evidence_role: clean(item.evidence_role, 80),
  })).filter(item => item.document_id && item.source_url)
  const canonicalEventId = clean(input.canonical_event_id, 180) || `event:${hash({ title, date: clean(input.event_date, 40), institution_ids: input.institution_ids || [] })}`
  return Object.freeze({
    schema_version: "palantir-canonical-event-v1",
    canonical_event_id: canonicalEventId,
    title,
    event_date: clean(input.event_date, 40) || null,
    jurisdiction: clean(input.jurisdiction, 80) || null,
    aliases: [...new Set((input.aliases || []).map(item => clean(item, 180)).filter(Boolean))],
    institution_ids: [...new Set((input.institution_ids || []).map(item => clean(item, 180)).filter(Boolean))],
    source_documents: sourceDocuments,
    identity_confidence: ["exact", "strong", "ambiguous"].includes(input.identity_confidence) ? input.identity_confidence : "ambiguous",
    merge_status: ["canonical", "proposed", "rejected"].includes(input.merge_status) ? input.merge_status : "proposed",
    owner_review_required: input.owner_review_required !== false,
    event_identity_is_document_identity: false,
    automatic_merge: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function reconcilePalantirEvent(candidate, knownEvents = []) {
  const event = normalizePalantirEvent(candidate)
  const exactId = knownEvents.find(item => item.canonical_event_id === event.canonical_event_id)
  const exactDocument = knownEvents.find(item => item.source_documents?.some(document => event.source_documents.some(candidateDocument => candidateDocument.document_id === document.document_id)))
  const deterministic = exactId || exactDocument
  if (deterministic) return Object.freeze({ disposition: "existing_event_evidence_upgrade", canonical_event_id: deterministic.canonical_event_id, candidate: event, automatic_merge: false, owner_review_required: false })
  const sameTitleDate = knownEvents.filter(item => item.event_date && item.event_date === event.event_date && clean(item.title).toLowerCase() === event.title.toLowerCase())
  if (sameTitleDate.length === 1) return Object.freeze({ disposition: "possible_same_event", canonical_event_id: sameTitleDate[0].canonical_event_id, candidate: event, automatic_merge: false, owner_review_required: true })
  return Object.freeze({ disposition: "new_event_candidate", canonical_event_id: event.canonical_event_id, candidate: event, automatic_merge: false, owner_review_required: true })
}
