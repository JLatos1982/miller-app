export const MILLER_NORTH_CARE_SETTING_VERSION = "miller-north-care-setting-enrichment-v1"
export const MILLER_NORTH_CARE_SETTINGS = Object.freeze(["emergency_department", "inpatient_hospital", "primary_care", "maternity_reproductive", "mental_health", "substance_use", "ambulance_paramedic", "hospital_security", "specialist_care", "long_term_care", "rural_remote", "public_health", "other", "unclear"])

const RULES = Object.freeze([
  ["hospital_security", /\b(hospital security|security guards?|protective services?|security personnel)\b/i, .98],
  ["ambulance_paramedic", /\b(ambulance|paramedics?|emergency medical services?|ems crew|medevac)\b/i, .98],
  ["maternity_reproductive", /\b(pregnan\w*|childbirth|giving birth|labou?r and delivery|matern\w*|obstetric\w*|steriliz\w*|tubal[ -]ligation|midwi\w*)\b/i, .98],
  ["emergency_department", /\b(emergency department|emergency room|hospital er|hospital ed|er visit|ed visit)\b/i, .98],
  ["primary_care", /\b(primary (?:health )?care|family (?:doctor|physician|practice)|community health cent(?:re|er)|walk[ -]in clinic)\b/i, .97],
  ["substance_use", /\b(substance[ -]use (?:care|treatment|service)|addiction (?:care|treatment|service)|detox(?:ification)?|withdrawal management|opioid agonist treatment)\b/i, .97],
  ["mental_health", /\b(mental health (?:care|service|treatment|unit)|psychiatric (?:care|service|unit)|psychiatry)\b/i, .97],
  ["long_term_care", /\b(long[ -]term care|nursing home|residential care facilit(?:y|ies))\b/i, .98],
  ["public_health", /\b(public health (?:care|service|unit|program)|vaccination clinic|immunization clinic)\b/i, .96],
  ["specialist_care", /\b(dental care|oncology|cancer care|cardiology|specialist care|surgical care|surgery clinic)\b/i, .95],
  ["inpatient_hospital", /\b(inpatient (?:care|unit|ward)|admitted to (?:the )?hospital|hospital ward|intensive care unit|icu)\b/i, .96],
  ["rural_remote", /\b(rural (?:care|health(?: care)?|hospital)|remote (?:care|health(?: care)?|community)|northern (?:health care|hospital|community care))\b/i, .94],
])

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const settingFromExisting = value => {
  const current = clean(value).toLowerCase()
  if (!current) return null
  if (/emergency/.test(current)) return "emergency_department"
  if (/primary/.test(current)) return "primary_care"
  if (/pregnan|childbirth|matern|reproduct/.test(current)) return "maternity_reproductive"
  if (/institutional response|not applicable/.test(current)) return "other"
  if (/multiple|health system/.test(current)) return "other"
  return null
}

export function classifyMillerNorthCareSetting(record, { modelSuggestion = null } = {}) {
  const text = clean([record.summary, record.recommendation_action, record.source?.title, record.evidence_type].filter(Boolean).join(" "))
  const existing = settingFromExisting(record.care_setting)
  if (existing) return { public_record_id: record.public_record_id, setting: existing, confidence: 1, evidence: clean(record.care_setting), route: "existing_structured_field", review_status: "auto_accepted", version: MILLER_NORTH_CARE_SETTING_VERSION }
  const matches = RULES.flatMap(([setting, pattern, confidence]) => { const match = text.match(pattern); return match ? [{ setting, confidence, evidence: match[0] }] : [] })
  if (matches.length === 1) return { public_record_id: record.public_record_id, ...matches[0], route: "deterministic_explicit_phrase", review_status: "auto_accepted", version: MILLER_NORTH_CARE_SETTING_VERSION }
  if (matches.length > 1) return { public_record_id: record.public_record_id, setting: matches[0].setting, confidence: Math.min(...matches.map(item => item.confidence), .9), evidence: matches.map(item => item.evidence).join("; "), alternatives: matches.slice(1).map(item => item.setting), route: "deterministic_conflict", review_status: "owner_review", version: MILLER_NORTH_CARE_SETTING_VERSION }
  if (modelSuggestion && MILLER_NORTH_CARE_SETTINGS.includes(modelSuggestion.setting)) {
    const phrase = clean(modelSuggestion.evidence)
    const supported = phrase.length >= 4 && text.toLowerCase().includes(phrase.toLowerCase())
    const confidence = Math.max(0, Math.min(1, Number(modelSuggestion.confidence) || 0))
    return { public_record_id: record.public_record_id, setting: modelSuggestion.setting, confidence, evidence: supported ? phrase : null, reason: clean(modelSuggestion.reason).slice(0, 400) || null, model: clean(modelSuggestion.model).slice(0, 80) || "local_model", route: "local_model_suggestion", review_status: supported && confidence >= .97 ? "auto_accepted" : "owner_review", version: MILLER_NORTH_CARE_SETTING_VERSION }
  }
  return { public_record_id: record.public_record_id, setting: "unclear", confidence: 0, evidence: null, route: "no_supported_classification", review_status: "unclassified", version: MILLER_NORTH_CARE_SETTING_VERSION }
}

export function buildMillerNorthCareSettingEnrichment(records, { modelSuggestions = new Map() } = {}) {
  const classifications = records.map(record => classifyMillerNorthCareSetting(record, { modelSuggestion: modelSuggestions.get(record.public_record_id) }))
  const count = predicate => classifications.filter(predicate).length
  return { schema_version: MILLER_NORTH_CARE_SETTING_VERSION, source_rows: records.length, raw_evidence_changed: 0, auto_accepted: count(item => item.review_status === "auto_accepted"), deterministic_enriched: count(item => item.route === "deterministic_explicit_phrase" && item.review_status === "auto_accepted"), existing_structured: count(item => item.route === "existing_structured_field"), model_enriched: count(item => item.route === "local_model_suggestion" && item.review_status === "auto_accepted"), owner_review: count(item => item.review_status === "owner_review"), unclassified: count(item => item.review_status === "unclassified"), classifications }
}

export function validateMillerNorthCareSettingEnrichment(value, recordIds = []) {
  if (value?.schema_version !== MILLER_NORTH_CARE_SETTING_VERSION || !Array.isArray(value.classifications) || value.source_rows !== value.classifications.length || value.raw_evidence_changed !== 0) throw new Error("miller_north_care_setting_projection_invalid")
  const allowed = new Set(recordIds), ids = new Set()
  for (const item of value.classifications) {
    if (!item.public_record_id || ids.has(item.public_record_id) || (allowed.size && !allowed.has(item.public_record_id)) || !MILLER_NORTH_CARE_SETTINGS.includes(item.setting) || !["auto_accepted", "owner_review", "unclassified"].includes(item.review_status)) throw new Error("miller_north_care_setting_record_invalid")
    if (item.route === "local_model_suggestion" && item.review_status === "auto_accepted" && (!item.evidence || item.confidence < .97)) throw new Error("miller_north_care_setting_unsafe_model_acceptance")
    ids.add(item.public_record_id)
  }
  return { valid: true, rows: ids.size }
}

export function validateMillerNorthCareSettingPublicProjection(value, recordIds = []) {
  if (value?.schema_version !== "miller-north-care-setting-derived-public-v1" || value?.publication_scope !== "publication_safe_derived_classifications" || !Array.isArray(value.records)) throw new Error("miller_north_care_setting_public_projection_invalid")
  const allowed = new Set(recordIds), ids = new Set()
  for (const item of value.records) {
    if (!item.public_record_id || ids.has(item.public_record_id) || (allowed.size && !allowed.has(item.public_record_id)) || !MILLER_NORTH_CARE_SETTINGS.includes(item.care_setting) || item.care_setting === "unclear" || !["existing_structured_field", "deterministic_explicit_phrase", "local_model_suggestion"].includes(item.classification_route) || item.classification_route === "local_model_suggestion") throw new Error("miller_north_care_setting_public_record_invalid")
    if (Object.keys(item).some(key => /evidence|reason|model|owner|private/i.test(key))) throw new Error("miller_north_care_setting_public_private_field")
    ids.add(item.public_record_id)
  }
  return { valid: true, records: ids.size }
}
