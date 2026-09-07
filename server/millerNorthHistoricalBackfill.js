const INDIGENOUS_PATTERNS = [
  ["indigenous", /\bindigenous\b/i],
  ["first_nations", /\bfirst nations?\b/i],
  ["metis", /\bm[ée]tis\b/i],
  ["inuit", /\binuit\b/i],
  ["aboriginal", /\baboriginal\b/i],
]

const MECHANISM_PATTERNS = [
  ["emergency_care", /\bemergency (?:department|room|care)\b|\bER\b/i],
  ["discharge", /\bdischarg(?:e|ed|ing)\b|\bsent home\b/i],
  ["ambulance_transport", /\bambulance\b|\bparamedic\b|\bEMS\b|\bmedevac\b|\bair ambulance\b|\bpatient transfer\b/i],
  ["mental_health", /\bmental health\b|\bpsychiatr|\bsuicid|\bseclusion\b/i],
  ["security_police", /\bsecurity\b|\bpolice\b|\bRCMP\b|\brestraint\b|\buse of force\b/i],
  ["diagnosis_assessment", /\bmissed diagnosis\b|\bdelay(?:ed)? diagnosis\b|\bfailure to assess\b|\bresuscitat/i],
  ["consent_reproductive", /\bconsent\b|\breproductive\b|\bsterili[sz]/i],
  ["rural_remote", /\brural\b|\bremote\b|\bnursing station\b/i],
  ["substance_assumption", /\bintoxicat|\bdrug[- ]seeking\b|\bnon[- ]compliant\b/i],
]

export function historicalDateBand(year) {
  if (year >= 2018 && year <= 2023) return "2018_2023"
  if (year >= 2014 && year <= 2017) return "2014_2017"
  if (year >= 2010 && year <= 2013) return "2010_2013"
  return "outside_scope"
}

export function analyzeHistoricalOfficialRecord(record, text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (!normalized) return { ...record, date_band: historicalDateBand(record.year), extraction_status: "text_unavailable_ocr_required", indigenous_terms: [], mechanism_tags: [], disposition: "manual_extraction_review" }
  const indigenous_terms = INDIGENOUS_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label)
  const mechanism_tags = MECHANISM_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label)
  const firstMatch = INDIGENOUS_PATTERNS.map(([, pattern]) => normalized.search(pattern)).filter(index => index >= 0).sort((a, b) => a - b)[0]
  const excerptStart = Math.max(0, (firstMatch ?? 0) - 240)
  const evidence_excerpt = indigenous_terms.length ? normalized.slice(excerptStart, excerptStart + 720) : null
  return {
    ...record,
    date_band: historicalDateBand(record.year),
    extraction_status: "text_extracted",
    indigenous_terms,
    mechanism_tags,
    evidence_excerpt,
    disposition: indigenous_terms.length && mechanism_tags.length ? "owner_review" : "not_selected_by_deterministic_triage",
  }
}

export function summarizeHistoricalBackfill(records = []) {
  const countBy = key => Object.fromEntries([...new Set(records.map(item => item[key]))].sort().map(value => [value, records.filter(item => item[key] === value).length]))
  return {
    documents_reviewed: records.length,
    owner_review: records.filter(item => item.disposition === "owner_review").length,
    ocr_required: records.filter(item => item.extraction_status === "text_unavailable_ocr_required").length,
    rejected_by_deterministic_triage: records.filter(item => item.disposition === "not_selected_by_deterministic_triage").length,
    by_date_band: countBy("date_band"),
  }
}
