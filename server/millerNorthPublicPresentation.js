import { createHash } from "node:crypto"

export const MILLER_NORTH_PUBLIC_GROUP_SCHEMA = "miller-north-public-evidence-groups-v1"
export const DUPLICATE_CLASSIFICATIONS = Object.freeze([
  "same_incident_duplicate",
  "same_incident_additional_source",
  "probable_duplicate_owner_review",
  "related_context_not_same_incident",
  "separate_incident",
  "cohort_or_systemic_record",
  "insufficient_identity",
])

const CONTEXT_STATUSES = new Set(["systemic_evidence", "official_investigation"])
const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 20)
const safeUrlKey = value => {
  try {
    const url = new URL(value)
    url.hash = ""
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key)
    return url.toString().replace(/\/$/, "")
  } catch { return clean(value) }
}
const exactIdentityKey = record => [record.province, record.evidence_status, record.year, record.care_setting, record.organization, normalized(record.summary)].join("\u001f")
const sameSourceDuplicateKey = record => [record.province, record.evidence_status, safeUrlKey(record.source?.url), normalized(record.summary)].join("\u001f")
const titleKey = record => [record.province, record.evidence_status, normalized(record.source?.title)].join("\u001f")
const summaryScore = summary => {
  const value = clean(summary)
  let score = Math.min(value.length, 500)
  if (/^the public source/i.test(value)) score -= 250
  if (/contains province-specific material|bounded source excerpt|remains authoritative for its scope/i.test(value)) score -= 180
  if (/https?:|!\[|\*\*/i.test(value)) score -= 120
  if (value.length > 900) score -= 200
  return score
}
const statusRank = Object.freeze({ formal_finding: 6, official_investigation: 5, procedural_adjudicative_context: 4, corroborated_account: 3, reported_account: 2, systemic_evidence: 1 })

class DisjointSet {
  constructor(size) { this.parent = Array.from({ length: size }, (_, index) => index) }
  find(index) { if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]); return this.parent[index] }
  union(left, right) { const a = this.find(left), b = this.find(right); if (a !== b) this.parent[b] = a }
}

function sourcesFor(records) {
  const byUrl = new Map()
  for (const record of records) {
    const source = record.source || {}
    const key = safeUrlKey(source.url)
    if (!key || byUrl.has(key)) continue
    byUrl.set(key, { title: clean(source.title) || "Public source", publisher: clean(source.publisher) || "Source organization not specified", source_type: source.source_type || null, publication_date: source.publication_date || null, url: source.url })
  }
  return [...byUrl.values()]
}

function preferredRecord(records) {
  return [...records].sort((left, right) => (statusRank[right.evidence_status] || 0) - (statusRank[left.evidence_status] || 0) || summaryScore(right.summary) - summaryScore(left.summary) || left.public_record_id.localeCompare(right.public_record_id))[0]
}

function groupClassification(records, mergeReason) {
  if (records.length === 1) return records[0].evidence_status === "systemic_evidence" ? "cohort_or_systemic_record" : "separate_incident"
  const urlCount = new Set(records.map(record => safeUrlKey(record.source?.url))).size
  if (mergeReason === "context_source") return "cohort_or_systemic_record"
  return urlCount > 1 ? "same_incident_additional_source" : "same_incident_duplicate"
}

export function buildMillerNorthPublicIncidentPresentation(records = []) {
  const set = new DisjointSet(records.length)
  const reasons = new Map()
  const sameSourceGroups = new Map()
  records.forEach((record, index) => {
    const key = sameSourceDuplicateKey(record)
    const current = sameSourceGroups.get(key) || []
    current.push(index)
    sameSourceGroups.set(key, current)
  })
  for (const indexes of sameSourceGroups.values()) if (indexes.length > 1) for (const index of indexes.slice(1)) { set.union(indexes[0], index); reasons.set(indexes[0], "same_source_duplicate") }
  const exactGroups = new Map()
  records.forEach((record, index) => {
    const key = exactIdentityKey(record)
    const current = exactGroups.get(key) || []
    current.push(index)
    exactGroups.set(key, current)
  })
  for (const indexes of exactGroups.values()) if (indexes.length > 1) for (const index of indexes.slice(1)) { set.union(indexes[0], index); reasons.set(indexes[0], "exact_identity") }

  const contextualSources = new Map()
  records.forEach((record, index) => {
    if (!CONTEXT_STATUSES.has(record.evidence_status)) return
    const key = `${record.province}\u001f${safeUrlKey(record.source?.url)}`
    const current = contextualSources.get(key) || []
    current.push(index)
    contextualSources.set(key, current)
  })
  for (const indexes of contextualSources.values()) {
    if (indexes.length < 2 || !indexes.every(index => CONTEXT_STATUSES.has(records[index].evidence_status))) continue
    for (const index of indexes.slice(1)) set.union(indexes[0], index)
    reasons.set(indexes[0], "context_source")
  }

  const membersByRoot = new Map()
  records.forEach((record, index) => {
    const root = set.find(index)
    membersByRoot.set(root, [...(membersByRoot.get(root) || []), record])
  })
  const groups = [...membersByRoot.entries()].map(([root, members]) => {
    const preferred = preferredRecord(members)
    const sources = sourcesFor(members)
    const reason = reasons.get(root) || (members.length > 1 ? "exact_identity" : "singleton")
    const classification = groupClassification(members, reason)
    const identity = reason === "context_source" ? `${preferred.province}|${safeUrlKey(preferred.source?.url)}|context` : exactIdentityKey(preferred)
    return {
      public_record_id: `iheg_${hash(identity)}`,
      member_public_record_ids: members.map(record => record.public_record_id).sort(),
      source_record_count: members.length,
      source_count: sources.length,
      presentation_classification: classification,
      evidence_status: preferred.evidence_status,
      evidence_type: preferred.evidence_type,
      province: preferred.province,
      year: members.every(record => record.year === preferred.year) ? preferred.year : null,
      care_setting: members.every(record => record.care_setting === preferred.care_setting) ? preferred.care_setting : "Multiple settings",
      organization: members.every(record => record.organization === preferred.organization) ? preferred.organization : null,
      summary: clean(preferred.summary).slice(0, 1200),
      recommendation_action: preferred.recommendation_action || null,
      methodology: "Presentation grouping preserves the underlying approved source-derived records and suppresses only deterministic duplication.",
      ...(preferred.caution ? { caution: preferred.caution } : {}),
      source: sources[0],
      sources,
    }
  }).sort((left, right) => left.public_record_id.localeCompare(right.public_record_id))

  const groupForMember = new Map(groups.flatMap(group => group.member_public_record_ids.map(id => [id, group.public_record_id])))
  const repeatedSourceReview = new Map()
  records.forEach(record => {
    const key = `${record.province}\u001f${safeUrlKey(record.source?.url)}`
    const current = repeatedSourceReview.get(key) || { source_url: record.source?.url, province: record.province, group_ids: new Set(), record_ids: [] }
    current.group_ids.add(groupForMember.get(record.public_record_id))
    current.record_ids.push(record.public_record_id)
    repeatedSourceReview.set(key, current)
  })
  const relatedContext = [...repeatedSourceReview.values()].filter(item => item.group_ids.size > 1 && item.record_ids.length > 1).map(item => ({ classification: "related_context_not_same_incident", source_url: item.source_url, province: item.province, public_group_ids: [...item.group_ids].sort(), source_record_count: item.record_ids.length, confidence: "bounded", owner_review: false, reason: "One public source contains multiple distinct excerpts or reported experiences; these were not merged." }))

  const titleReview = new Map()
  groups.forEach(group => {
    const key = titleKey(group)
    const current = titleReview.get(key) || []
    current.push(group)
    titleReview.set(key, current)
  })
  const probable = [...titleReview.values()].filter(items => items.length > 1 && new Set(items.map(item => safeUrlKey(item.source.url))).size > 1).map(items => ({ classification: "probable_duplicate_owner_review", public_group_ids: items.map(item => item.public_record_id), source_titles: [...new Set(items.map(item => item.source.title))], sources: items.flatMap(item => item.sources).map(source => source.url), supporting_facts: ["matching normalized source title", "matching province", "matching evidence status"], timing_location_overlap: "not sufficient for automatic merge", confidence: "limited", owner_review: true, reason: "Similar source titles across different URLs require identity review; presentation remains separate." }))

  let exactDuplicateRows = 0, additionalSourceRows = 0, contextualRows = 0
  for (const members of membersByRoot.values()) {
    const identities = new Map(), duplicates = new Map()
    for (const record of members) identities.set(exactIdentityKey(record), [...(identities.get(exactIdentityKey(record)) || []), record])
    for (const record of members) duplicates.set(sameSourceDuplicateKey(record), (duplicates.get(sameSourceDuplicateKey(record)) || 0) + 1)
    let exactInGroup = [...duplicates.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0), additionalInGroup = 0
    for (const identityMembers of identities.values()) {
      const byUrl = new Map()
      for (const record of identityMembers) byUrl.set(safeUrlKey(record.source?.url), (byUrl.get(safeUrlKey(record.source?.url)) || 0) + 1)
      additionalInGroup += Math.max(0, byUrl.size - 1)
    }
    exactDuplicateRows += exactInGroup
    additionalSourceRows += additionalInGroup
    contextualRows += Math.max(0, members.length - 1 - exactInGroup - additionalInGroup)
  }
  const metrics = {
    raw_source_records: records.length,
    public_evidence_groups: groups.length,
    incident_like_groups: groups.filter(group => !["cohort_or_systemic_record", "related_context_not_same_incident"].includes(group.presentation_classification)).length,
    exact_duplicate_rows_suppressed: exactDuplicateRows,
    additional_source_rows_consolidated: additionalSourceRows,
    contextual_rows_consolidated: contextualRows,
    cohort_or_systemic_groups: groups.filter(group => group.presentation_classification === "cohort_or_systemic_record").length,
    related_not_duplicate_source_clusters: relatedContext.length,
    probable_duplicate_owner_reviews: probable.length,
    unresolved_duplicate_reviews: probable.length,
  }
  return { schema_version: MILLER_NORTH_PUBLIC_GROUP_SCHEMA, generated_at: new Date().toISOString(), mode: "non_destructive_public_presentation", metrics, groups, duplicate_review: [...relatedContext, ...probable] }
}

export function validateMillerNorthPublicIncidentPresentation(projection, rawRecords = []) {
  if (projection?.schema_version !== MILLER_NORTH_PUBLIC_GROUP_SCHEMA || projection?.mode !== "non_destructive_public_presentation" || !Array.isArray(projection.groups)) throw new Error("miller_north_public_group_projection_invalid")
  const groupIds = new Set(), memberIds = new Set(), rawIds = new Set(rawRecords.map(record => record.public_record_id))
  const forbidden = /owner_review_reason|private_note|patient_name|complainant_name|social_lead_id|candidate_id|incident_fingerprint/i
  if (forbidden.test(JSON.stringify(projection.groups))) throw new Error("miller_north_public_group_private_field")
  for (const group of projection.groups) {
    if (!/^iheg_[a-f0-9]{20}$/.test(group.public_record_id) || groupIds.has(group.public_record_id) || !DUPLICATE_CLASSIFICATIONS.includes(group.presentation_classification)) throw new Error("miller_north_public_group_identity_invalid")
    groupIds.add(group.public_record_id)
    if (!group.member_public_record_ids?.length || group.source_record_count !== group.member_public_record_ids.length || group.source_count !== group.sources?.length) throw new Error("miller_north_public_group_members_invalid")
    if (!group.sources.every(source => /^https:\/\//.test(source.url))) throw new Error("miller_north_public_group_source_invalid")
    for (const id of group.member_public_record_ids) { if (memberIds.has(id) || (rawIds.size && !rawIds.has(id))) throw new Error("miller_north_public_group_member_duplicate"); memberIds.add(id) }
  }
  if (rawIds.size && memberIds.size !== rawIds.size) throw new Error("miller_north_public_group_coverage_incomplete")
  return { valid: true, ...projection.metrics, evidence_group_count: projection.groups.length }
}
