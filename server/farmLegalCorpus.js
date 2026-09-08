const CITATION = /^((?:19|20)\d{2})\s+[A-Z][A-Z0-9]{1,11}\s+\d{1,6}$/
const ROLES = new Set(["complaint_allegation", "procedural_decision", "interested_party_order", "merits_decision", "settlement", "settlement_approval_reasons", "regulator_agreement", "judicial_review", "appeal", "appeal_judgment", "final_judgment", "final_judgment_on_public_interest_standing", "compliance_order", "implementation_follow_up"])
const REVIEW_LEVELS = new Set(["index_discovered", "official_digest_reviewed", "full_decision_reviewed"])

export function validateFarmLegalRecord(record = {}) {
  const errors = []
  if (!CITATION.test(String(record.citation || ""))) errors.push("citation_invalid")
  if (!ROLES.has(record.process_role)) errors.push("process_role_invalid")
  if (!/^https:\/\//.test(String(record.source_url || ""))) errors.push("source_url_invalid")
  if (!record.finding_boundary) errors.push("finding_boundary_required")
  if (!record.project_route) errors.push("project_route_required")
  return { valid: errors.length === 0, errors }
}

export function validateFarmLegalCorpusV3Record(record = {}) {
  const result = validateFarmLegalRecord(record)
  const errors = [...result.errors]
  if (!REVIEW_LEVELS.has(record.review_level)) errors.push("review_level_invalid")
  if (!record.source_authority) errors.push("source_authority_required")
  if (!record.disposition) errors.push("disposition_required")
  if (record.publication_candidate === true && record.review_level !== "full_decision_reviewed") errors.push("publication_requires_full_decision_review")
  if (record.process_role === "procedural_decision" && /found discrimination|proved discrimination/i.test(String(record.summary || ""))) errors.push("procedural_summary_overstates_finding")
  return { valid: errors.length === 0, errors }
}

export function buildLegalCitationChain(records = []) {
  const sorted = [...records].sort((a, b) => String(a.decision_date || a.citation?.slice(0, 4)).localeCompare(String(b.decision_date || b.citation?.slice(0, 4))))
  return {
    records: sorted.map(record => ({ legal_record_id: record.legal_record_id, citation: record.citation, process_role: record.process_role })),
    edges: sorted.slice(1).map((record, index) => ({ from: sorted[index].legal_record_id, to: record.legal_record_id, type: "later_formal_step", owner_review: true })),
    implementation_proved: false,
    publication_authority: false,
  }
}

export function summarizeLegalCorpus(corpus = {}) {
  const records = corpus.new_records || []
  const invalid = records.map(record => ({ id: record.legal_record_id, ...validateFarmLegalRecord(record) })).filter(item => !item.valid)
  return {
    checked: Number(corpus.scope?.index_entries_compared || 0),
    decision_records: Number(corpus.scope?.existing_decision_records_reconciled || 0) + records.length,
    valid_new_records: records.length - invalid.length,
    invalid,
    public_records_added: 0,
    production_mutations: 0,
  }
}

export function summarizeLegalCorpusV3(corpus = {}) {
  const records = corpus.new_records || []
  const invalid = records.map(record => ({ id: record.legal_record_id, ...validateFarmLegalCorpusV3Record(record) })).filter(item => !item.valid)
  const byReviewLevel = Object.fromEntries([...REVIEW_LEVELS].map(level => [level, records.filter(record => record.review_level === level).length]))
  const byJurisdiction = records.reduce((counts, record) => {
    const key = record.jurisdiction_key || "unknown"
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  return {
    index_entries_checked: Number(corpus.scope?.index_entries_checked || 0),
    cumulative_decision_records: Number(corpus.scope?.prior_decision_records || 0) + records.length,
    new_records: records.length,
    by_review_level: byReviewLevel,
    by_jurisdiction: byJurisdiction,
    valid_new_records: records.length - invalid.length,
    invalid,
    publication_candidates: records.filter(record => record.publication_candidate === true).length,
    public_records_added: Number(corpus.publication?.public_records_added || 0),
    production_mutations: Number(corpus.publication?.production_mutations || 0),
  }
}
