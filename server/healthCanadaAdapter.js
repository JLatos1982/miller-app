import { createHash } from "node:crypto"

// The Open Canada package is metadata. This fixed JSON resource is the actual
// public recall feed. It is deliberately fetched only as a bounded byte range.
export const HEALTH_CANADA = Object.freeze({ id: "health_canada_drug_safety", host: "recalls-rappels.canada.ca", endpoint: "https://recalls-rappels.canada.ca/sites/default/files/opendata-donneesouvertes/HCRSAMOpenData.json", maxRequests: 1, maxBytes: 512 * 1024, maxRecords: 100, timeoutMs: 7000, mode: "live_ready", parserVersion: "hc-rsam-json-array-v1" })
const terms = { methadone: ["methadone"], buprenorphine: ["buprenorphine", "suboxone"], naloxone: ["naloxone", "narcan"], naltrexone: ["naltrexone"], slow_release_oral_morphine: ["slow release oral morphine", "kadian"], acamprosate: ["acamprosate"], disulfiram: ["disulfiram"] }
const clean = (v, max = 800) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max)

export function healthCanadaUrl(value) { const url = new URL(value); if (url.protocol !== "https:" || url.hostname !== HEALTH_CANADA.host || url.pathname !== "/sites/default/files/opendata-donneesouvertes/HCRSAMOpenData.json" || url.search || url.hash) throw new Error("health_canada_off_allowlist"); return url }
export function classifyHealthCanadaRecord(record = {}) {
  const title = clean(record.Title || record.title || record.title_en || record.product || ""), text = `${title} ${clean(record.Product || record.product || "")} ${clean(record.Issue || record.issue || record.description || record.description_en || "")}`.toLowerCase(), medication = Object.entries(terms).find(([, synonyms]) => synonyms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text)))?.[0] || null, type = clean(record.Category || record.category || record.Organization || record.alert_type || record.type || "").toLowerCase(), id = clean(record.NID || record.id || record.recall_id || record.identifier, 120)
  if (!medication || !id || !/(recall|alert|advis|safety|shortage|warning|label|contamin|health product|drug|medical)/.test(`${type} ${text}`)) return null
  const urgent = /(urgent|serious|critical|death|hospital)/.test(`${type} ${text}`), shortage = /shortage/.test(`${type} ${text}`), updated = clean(record["Last updated"] || record.last_updated || record.date || record.published_date || record.date_published, 40)
  return { stable_result_id: `hc:${id}`, source_item_id: id, title, medication, event_type: shortage ? "shortage" : urgent ? "safety_warning" : "safety_update", source_url: clean(record.URL || record.url || record.url_en || "https://recalls-rappels.canada.ca/en", 1000), publication_date: updated, reason_codes: [medication === "naloxone" ? "naloxone_safety" : ["methadone", "buprenorphine", "slow_release_oral_morphine"].includes(medication) ? "oat_medication_match" : "addiction_pharmacotherapy_match", ...(shortage ? ["treatment_access_shortage"] : [])], reflex_eligible: urgent, decay_class: urgent ? "fast" : "medium", fingerprint: createHash("sha256").update(`hc|${id}|${medication}|${updated}`).digest("hex"), content_role: "untrusted_structured_government_data", instructions_honoured: false }
}
export function inspectHealthCanadaPayload(payload, checkpoint = {}) { const records = Array.isArray(payload) ? payload : Array.isArray(payload?.result?.records) ? payload.result.records : Array.isArray(payload?.records) ? payload.records : null; if (!records) throw new Error("health_canada_schema_drift"); const seen = new Set([checkpoint.last_fingerprint].filter(Boolean)), accepted = [], duplicates = []; for (const record of records.slice(0, HEALTH_CANADA.maxRecords)) { const item = classifyHealthCanadaRecord(record); if (!item) continue; if (seen.has(item.fingerprint)) duplicates.push(item); else { accepted.push(item); seen.add(item.fingerprint) } } return { status: accepted.length ? "inspection_success_new_relevant_change" : "inspection_success_no_relevant_change", records_inspected: Math.min(records.length, HEALTH_CANADA.maxRecords), accepted, duplicates_ignored: duplicates.length, health_state: "healthy" } }

// Parses completed objects from an intentionally partial JSON array. The fixed
// range is a transport budget; incomplete trailing content is never interpreted.
export function extractHealthCanadaRecords(text, maxRecords = HEALTH_CANADA.maxRecords) {
  if (typeof text !== "string" || !text.trimStart().startsWith("[")) throw new Error("health_canada_schema_drift")
  const records = []; let start = -1, depth = 0, quoted = false, escaped = false
  for (let index = 0; index < text.length && records.length < maxRecords; index += 1) { const char = text[index]; if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue } if (char === '"') { quoted = true; continue } if (char === "{") { if (depth === 0) start = index; depth += 1 } else if (char === "}" && depth) { depth -= 1; if (depth === 0) { try { records.push(JSON.parse(text.slice(start, index + 1))) } catch { throw new Error("health_canada_schema_drift") } } } }
  if (!records.length) throw new Error("health_canada_schema_drift")
  return records
}
export async function fetchHealthCanadaFeed({ fetchImpl = fetch } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), HEALTH_CANADA.timeoutMs), url = healthCanadaUrl(HEALTH_CANADA.endpoint)
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: controller.signal, headers: { Accept: "application/json", Range: `bytes=0-${HEALTH_CANADA.maxBytes - 1}` } })
    if (![200, 206].includes(response.status)) throw new Error(`health_canada_http_${response.status}`)
    if (response.type === "opaqueredirect" || response.status >= 300 && response.status < 400) throw new Error("health_canada_redirect_rejected")
    const contentType = response.headers.get("content-type") || ""; if (!/^application\/json\b/i.test(contentType)) throw new Error("health_canada_content_type")
    const contentLength = Number(response.headers.get("content-length") || 0); if (contentLength > HEALTH_CANADA.maxBytes) throw new Error("health_canada_response_too_large")
    const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > HEALTH_CANADA.maxBytes) throw new Error("health_canada_response_too_large")
    return { records: extractHealthCanadaRecords(buffer.toString("utf8")), bytes: buffer.length, request_count: 1, source_url: url.toString() }
  } catch (error) { if (error?.name === "AbortError") throw new Error("health_canada_timeout"); throw error } finally { clearTimeout(timer) }
}
