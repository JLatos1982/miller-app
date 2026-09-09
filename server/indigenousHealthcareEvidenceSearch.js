import { readFileSync } from "node:fs"

import { evidenceDisplayTitle, incidentDisplayTitle } from "../src/site/millerNorthDisplayTitles.js"

export const MAX_EVIDENCE_SEARCH_QUERY_LENGTH = 500
export const MAX_EVIDENCE_SEARCH_RECORDS = 20
export const EVIDENCE_SEARCH_INSTRUCTIONS = "You are summarizing a bounded public Miller North corpus. Answer ONLY from the supplied public results. Do not infer prevalence, incidence, causation, wrongdoing, or truth beyond each result's evidence status. A reported account documents that an account was publicly reported; it is not equivalent to an adjudicated finding. Do not invent facts. Reference supplied result IDs for every factual claim. Say when the supplied evidence is limited. Keep the answer concise, approximately 2–5 paragraphs."

const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8"))
const evidence = read("indigenous-healthcare-evidence-groups-public-v1.json")
const listening = read("miller-north-live-listening-public-v1.json")
const watch = read("miller-north-accountability-watch-v1.json")
const emerging = read("miller-north-emerging-cases-public-v1.json")
const policy = read("miller-north-research-policy-public-v1.json")
const fnho = read("miller-north-fnho-public-v1.json")
const albertaPatientSafety = read("miller-north-alberta-patient-safety-public-v1.json")
const comparison = read("miller-north-accountability-comparison-public-v1.json")
const derivedCareSettings = read("miller-north-care-setting-derived-public-v1.json")
const seriousHarm = read("miller-north-serious-harm-public-v1.json")
const accessEquity = read("miller-north-access-equity-public-v1.json")

const ignoredTerms = new Set(["a", "about", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "the", "to", "what", "with"])
const SEARCH_RESULT_TYPES = new Set(["incident", "evidence", "listening", "accountability", "research_report", "access_equity"])
const TYPE_WEIGHT = { accountability: 1.12, incident: 1.1, evidence: 1, listening: .94, research_report: 1.04, access_equity: 1.03 }
const SYNONYM_GROUPS = [
  ["indigenous", "first nations", "first nation", "aboriginal", "metis", "métis", "inuit"],
  ["british columbia", "bc", "b.c."], ["alberta", "ab"], ["saskatchewan", "sk", "sask"],
  ["emergency department", "emergency room", "er", "ed"],
  ["hospital security", "security guard", "protective services"],
  ["ambulance", "paramedic", "ems", "emergency medical services"],
  ["coroner", "coroners service", "inquest", "fatality inquiry", "jury verdict"],
  ["patient transport", "interfacility transfer", "air ambulance", "medevac", "flight paramedic"],
  ["critical incident", "adverse event", "serious harm", "patient safety event"],
  ["regulator finding", "discipline decision", "consent agreement", "public notice"],
  ["resuscitation", "resuscitative measures", "unresponsive", "pulseless"],
  ["sent home", "discharged", "unsafe discharge", "discharge"],
  ["racism", "racial discrimination", "indigenous-specific racism", "anti-indigenous racism"],
  ["complaint", "concern", "grievance"],
  ["implementation", "implemented", "progress", "follow-up"],
  ["maternity", "pregnancy", "childbirth", "reproductive"],
]

const normalized = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
const stem = term => term.length > 5 ? term.replace(/(izations?|ations?|ments?|ingly|edly|ing|ed|ies|s)$/i, match => match === "ies" ? "y" : "") : term
const tokensFor = value => [...new Set(normalized(value).split(" ").filter(term => term.length > 1 && !ignoredTerms.has(term)).map(stem))]
const compact = value => Array.isArray(value) ? value.flatMap(compact) : value && typeof value === "object" ? Object.values(value).flatMap(compact) : String(value || "")
const dateOf = value => String(value || "").match(/^\d{4}(?:-\d\d(?:-\d\d)?)?/)?.[0] || null
const province = value => ({ "British Columbia": "british_columbia", Alberta: "alberta", Saskatchewan: "saskatchewan", Canada: "canada" }[value] || value || null)
const routeForCase = slug => `/indigenous-healthcare-evidence/research-policy?case=${encodeURIComponent(slug)}`

function result(value) {
  if (!SEARCH_RESULT_TYPES.has(value.result_type) || !value.result_id || !value.title || !value.destination_route) throw new Error("miller_north_search_result_invalid")
  return Object.freeze({ result_id: value.result_id, result_type: value.result_type, title: value.title, description: value.description || "", province: province(value.province), date: dateOf(value.date), organization: value.organization || null, setting: value.setting || null, status: value.status || null, confidence: value.confidence || null, destination_route: value.destination_route, underlying_record_id: value.underlying_record_id || value.result_id, search_text: normalized(value.search_text || "") })
}

const researchCases = [...policy.cases, fnho, albertaPatientSafety]
export function buildMillerNorthPublicSearchIndex() {
  const values = []
  const settingById = new Map(derivedCareSettings.records.map(item => [item.public_record_id, item.care_setting]))
  for (const item of evidence.groups) {
    const memberSettings = [...new Set(item.member_public_record_ids.map(id => settingById.get(id)).filter(Boolean))]
    const setting = item.care_setting || (memberSettings.length === 1 ? memberSettings[0] : null)
    values.push(result({ result_id: `evidence:${item.public_record_id}`, result_type: item.evidence_status === "reported_account" ? "incident" : "evidence", title: evidenceDisplayTitle(item), description: item.summary, province: item.province, date: item.source?.publication_date || item.year, organization: item.organization || item.source?.publisher, setting, status: item.evidence_status, confidence: item.evidence_status === "formal_finding" ? "high" : null, destination_route: `/indigenous-healthcare-evidence?group=${item.public_record_id}`, underlying_record_id: item.public_record_id, search_text: compact([item, item.sources, setting]).join(" ") }))
  }
  for (const item of listening.items) values.push(result({ result_id: `listening:${item.listening_item_id}`, result_type: "listening", title: item.title, description: item.summary, province: item.province, date: item.event_date || item.source_publication_date, organization: item.sources?.[0]?.organization, setting: item.facility, status: item.evidence_state, confidence: item.corroboration_located ? "corroborated" : "provisional", destination_route: `/indigenous-healthcare-evidence/live-listening#${item.listening_item_id}`, underlying_record_id: item.listening_item_id, search_text: compact(item).join(" ") }))
  for (const item of seriousHarm.incidents) values.push(result({ result_id: `serious-harm:${item.public_incident_id}`, result_type: "incident", title: incidentDisplayTitle(item), description: item.summary, province: item.province, date: item.event_date, organization: item.sources?.[0]?.title, setting: item.care_setting, status: item.evidence_strength?.key, confidence: ["formal_process_evidence", "final_formal_outcome"].includes(item.evidence_strength?.key) ? "high" : "reviewed", destination_route: `/indigenous-healthcare-evidence/serious-harm#${item.public_incident_id}`, underlying_record_id: item.public_incident_id, search_text: compact(item).join(" ") }))
  for (const item of watch.chains) values.push(result({ result_id: `accountability:${item.chain_id}`, result_type: "accountability", title: item.title, description: `${item.originating_concern} ${item.implementation_evidence}`, province: item.province, date: item.last_reviewed, organization: item.responsible_organizations?.[0], status: item.current_status, confidence: item.confidence, destination_route: `/indigenous-healthcare-evidence/accountability-watch#${item.chain_id}`, underlying_record_id: item.chain_id, search_text: compact(item).join(" ") }))
  for (const item of emerging.items) values.push(result({ result_id: `emerging:${item.emerging_case_id}`, result_type: "accountability", title: item.title, description: item.description, province: item.province, date: item.latest_update_date, organization: item.sources?.[0]?.organization, status: item.display_state, confidence: "developing", destination_route: item.related_href || "/indigenous-healthcare-evidence/watching-now", underlying_record_id: item.emerging_case_id, search_text: compact(item).join(" ") }))
  for (const item of researchCases) {
    values.push(result({ result_id: `research:${item.slug}`, result_type: "research_report", title: item.title, description: item.what_happened || item.focus, province: item.province, date: item.review_date || item.timeline?.at(-1)?.date, organization: item.sources?.[0]?.organization, status: item.maturity || "mature_research_policy_case", confidence: item.maturity === "dossier_ready_with_gaps" ? "bounded" : "reviewed", destination_route: routeForCase(item.slug), underlying_record_id: item.slug, search_text: compact(item).join(" ") }))
    for (const recommendation of item.recommendations || []) values.push(result({ result_id: `recommendation:${item.slug}:${recommendation.number}`, result_type: "accountability", title: `${item.title} — recommendation ${recommendation.number}`, description: recommendation.summary, province: item.province, date: recommendation.latest_evidence_date, organization: recommendation.responsible_organizations?.join(", "), status: recommendation.status, confidence: "reviewed_public_evidence", destination_route: routeForCase(item.slug), underlying_record_id: `${item.slug}:${recommendation.number}`, search_text: compact([item.title, recommendation]).join(" ") }))
  }
  for (const item of comparison.mechanisms) values.push(result({ result_id: `comparison:${normalized(item.province).replaceAll(" ", "_")}`, result_type: "accountability", title: `${item.province}: ${item.mechanism}`, description: "A sourced comparison of complaint access, authority, reporting and public transparency.", province: item.province, date: comparison.generated_at, organization: item.mechanism, status: "documented_comparison", confidence: "reviewed", destination_route: "/indigenous-healthcare-evidence/accountability-snapshot", search_text: compact([item, item.fields?.map(field => [field.label, field.value])]).join(" ") }))
  for (const item of accessEquity.findings) values.push(result({ result_id: `access-equity:${item.public_id}`, result_type: "access_equity", title: item.title, description: item.public_summary, province: item.jurisdiction, date: item.source?.date || item.period, organization: item.source?.organization, status: item.role, confidence: "reviewed", destination_route: `/indigenous-healthcare-evidence/access-equity#${item.public_id}`, underlying_record_id: item.public_id, search_text: compact([item.title, item.public_summary, item.what_was_measured, item.compared_with, item.documented_context, item.source, item.additional_sources]).join(" ") }))
  for (const item of accessEquity.suggested_follow_ups) values.push(result({ result_id: `access-equity:${item.public_id}`, result_type: "access_equity", title: item.title, description: item.research_question, province: item.jurisdiction, date: item.last_reviewed, organization: item.sources?.[0]?.organization, status: "suggested_follow_up", confidence: "reviewed", destination_route: `/indigenous-healthcare-evidence/access-equity#${item.public_id}`, underlying_record_id: item.public_id, search_text: compact([item.title, item.research_question, item.why_it_matters, item.what_we_currently_know, item.what_is_missing, item.evidence_needed, item.sources]).join(" ") }))
  return Object.freeze(values)
}

export const MILLER_NORTH_PUBLIC_SEARCH_INDEX = buildMillerNorthPublicSearchIndex()

export function publicEvidenceSearchRecord(record) {
  return Object.freeze({ public_record_id: record.public_record_id, summary: record.summary, source_title: record.source?.title || "", province: record.province || "", care_setting: record.care_setting || "", evidence_status: record.evidence_status || "", source_organization: record.source?.publisher || "", source_type: record.source?.source_type || "" })
}

const distance = (left, right) => {
  if (Math.abs(left.length - right.length) > 1) return 2
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j += 1) { const saved = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = saved } }
  return row[right.length]
}

export function expandMillerNorthQuery(query, modelConcepts = []) {
  const base = normalized(query)
  const concepts = new Set(tokensFor(base))
  for (const group of SYNONYM_GROUPS) if (group.some(alias => base.includes(normalized(alias)))) for (const alias of group) tokensFor(alias).forEach(term => concepts.add(term))
  for (const concept of modelConcepts || []) tokensFor(concept).forEach(term => concepts.add(term))
  return [...concepts].slice(0, 30)
}

function fieldScore(query, tokens, value, weight) {
  const haystack = normalized(value), hayTokens = tokensFor(haystack)
  let score = query.length > 3 && haystack.includes(query) ? weight * 5 : 0
  for (const token of tokens) {
    if (hayTokens.includes(token)) score += weight
    else if (token.length >= 5 && hayTokens.some(candidate => candidate.length >= 5 && distance(token, candidate) <= 1)) score += weight * .55
    else if (haystack.includes(token)) score += weight * .7
  }
  return score
}

export function retrieveMillerNorthResults(query, { index = MILLER_NORTH_PUBLIC_SEARCH_INDEX, limit = MAX_EVIDENCE_SEARCH_RECORDS, resultTypes = [], provinces = [], modelConcepts = [] } = {}) {
  const phrase = normalized(String(query || "").slice(0, MAX_EVIDENCE_SEARCH_QUERY_LENGTH)), originalTokens = tokensFor(phrase), tokens = expandMillerNorthQuery(phrase, modelConcepts)
  if (!tokens.length) return []
  const typeSet = new Set(resultTypes), provinceSet = new Set(provinces)
  const scored = index.filter(item => (!typeSet.size || typeSet.has(item.result_type)) && (!provinceSet.size || provinceSet.has(item.province))).map(item => {
    const allText = normalized([item.title, item.description, item.organization, item.setting, item.province, item.status, item.search_text].filter(Boolean).join(" "))
    const allTokens = tokensFor(allText)
    const matchedOriginal = originalTokens.filter(token => allText.includes(token) || (token.length >= 5 && allTokens.some(candidate => candidate.length >= 5 && distance(token, candidate) <= 1))).length
    const coverage = originalTokens.length ? matchedOriginal / originalTokens.length : 0
    const coverageMultiplier = .25 + .75 * coverage * coverage
    const allTermsBonus = coverage === 1 && originalTokens.length > 1 ? 30 : 0
    const score = ((fieldScore(phrase, tokens, item.title, 9) + fieldScore(phrase, tokens, item.description, 5) + fieldScore(phrase, tokens, item.organization, 4) + fieldScore(phrase, tokens, item.setting, 4) + fieldScore(phrase, tokens, item.province, 3) + fieldScore(phrase, tokens, item.status, 2) + fieldScore(phrase, tokens, item.search_text, 1)) * coverageMultiplier + allTermsBonus) * (TYPE_WEIGHT[item.result_type] || 1) * (["formal_finding", "corroborated", "high", "reviewed"].includes(item.confidence) ? 1.05 : 1)
    return { item, score }
  }).filter(({ score }) => score > 2.5).sort((a, b) => b.score - a.score || a.item.result_id.localeCompare(b.item.result_id))
  const seen = new Set(), output = []
  for (const { item, score } of scored) { const key = `${item.result_type}:${item.underlying_record_id}`; if (seen.has(key)) continue; seen.add(key); const { search_text: _searchText, ...safe } = item; output.push({ ...safe, relevance_score: Number(score.toFixed(2)) }); if (output.length >= Math.min(50, Math.max(1, limit))) break }
  return output
}

export function retrieveEvidenceRecords(query, records = null, limit = MAX_EVIDENCE_SEARCH_RECORDS) {
  if (records) {
    const index = records.map(record => result({ result_id: `evidence:${record.public_record_id}`, result_type: record.evidence_status === "reported_account" ? "incident" : "evidence", title: record.source?.title || record.evidence_type || "Evidence", description: record.summary, province: record.province, organization: record.source?.publisher, setting: record.care_setting, status: record.evidence_status, destination_route: `/indigenous-healthcare-evidence?group=${record.public_record_id}`, underlying_record_id: record.public_record_id, search_text: compact(record).join(" ") }))
    return retrieveMillerNorthResults(query, { index, limit }).map(item => publicEvidenceSearchRecord(records.find(record => record.public_record_id === item.underlying_record_id)))
  }
  return retrieveMillerNorthResults(query, { limit, resultTypes: ["evidence", "incident"] }).map(item => ({ public_record_id: item.underlying_record_id, summary: item.description, source_title: item.title, province: item.province || "", care_setting: item.setting || "", evidence_status: item.status || "", source_organization: item.organization || "", source_type: item.result_type }))
}

export function evidenceSearchFallback(matches, message) {
  return { answer: message, record_ids: matches.filter(item => ["evidence", "incident"].includes(item.result_type)).map(item => item.underlying_record_id), results: matches, match_count: matches.length, summary_available: false }
}

export function validateEvidenceSearchAnswer(value, matches) {
  if (!value || typeof value.answer !== "string") return null
  const answer = value.answer.trim().slice(0, 6000)
  if (!answer) return null
  const allowedIds = new Set(matches.map(record => record.result_id))
  const resultIds = Array.isArray(value.result_ids) ? [...new Set(value.result_ids.filter(id => typeof id === "string" && allowedIds.has(id)))].slice(0, MAX_EVIDENCE_SEARCH_RECORDS) : []
  const chosen = resultIds.length ? matches.filter(item => resultIds.includes(item.result_id)) : matches
  return { answer, record_ids: chosen.filter(item => ["evidence", "incident"].includes(item.result_type)).map(item => item.underlying_record_id), results: chosen, match_count: matches.length, summary_available: true }
}

export async function searchIndigenousHealthcareEvidence({ query, openai, apiKeyPresent, queryExpansionProvider = null, resultTypes = [], provinces = [] }) {
  let modelConcepts = []
  if (queryExpansionProvider) { try { const value = await queryExpansionProvider(query); if (Array.isArray(value)) modelConcepts = value.slice(0, 12) } catch { /* deterministic search remains available */ } }
  const matches = retrieveMillerNorthResults(query, { resultTypes, provinces, modelConcepts })
  if (!matches.length) return evidenceSearchFallback([], "No meaningful matches were found in the approved public Miller North material. Try a province, care setting, organization, report title, or accountability topic.")
  if (!apiKeyPresent || !openai) return evidenceSearchFallback(matches, `${matches.length} relevant result${matches.length === 1 ? "" : "s"} found across approved public Miller North material.`)
  try {
    const response = await openai.responses.create({ model: process.env.OPENAI_EVIDENCE_SEARCH_MODEL || "gpt-5.4-mini", instructions: EVIDENCE_SEARCH_INSTRUCTIONS, input: JSON.stringify({ query: String(query).trim().slice(0, MAX_EVIDENCE_SEARCH_QUERY_LENGTH), results: matches }), max_output_tokens: 700, text: { format: { type: "json_schema", name: "miller_north_search_answer", strict: true, schema: { type: "object", properties: { answer: { type: "string" }, result_ids: { type: "array", items: { type: "string" } } }, required: ["answer", "result_ids"], additionalProperties: false } } } })
    return validateEvidenceSearchAnswer(JSON.parse(response.output_text), matches) || evidenceSearchFallback(matches, `${matches.length} relevant public result${matches.length === 1 ? "" : "s"} found.`)
  } catch { return evidenceSearchFallback(matches, `${matches.length} relevant public result${matches.length === 1 ? "" : "s"} found. Search remains available without an AI summary.`) }
}
