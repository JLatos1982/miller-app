export const MILLER_CONTRACT_VERSION = "1.0"

const MATCH_FIELDS = ["name", "organization", "serviceType", "service_type", "category", "population", "eligibility", "description", "accessType", "hours", "phone", "altPhone", "email", "website", "address", "city", "region", "notes", "source", "approved", "hidden", "qualityScore", "quality_score", "id", "tags"]

export function toMillerResourceMatch(resource = {}) {
  return Object.fromEntries(MATCH_FIELDS.filter((key) => resource[key] !== undefined && resource[key] !== null).map((key) => [key, resource[key]]))
}

export function buildMillerRequest({ mode = "main", query, city = "All Cities", matches = [], conversationMemory = [], conversationSummary = "", inferredCategories = [], communicationMode = "", sessionId = "" }) {
  return { interface: mode, query: String(query || "").trim(), city: city === "All cities" ? "All Cities" : city, matches: matches.slice(0, 30).map(toMillerResourceMatch), conversationMemory, conversationSummary, inferredCategories, ...(communicationMode ? { communicationMode } : {}), ...(sessionId ? { session_id: sessionId } : {}) }
}

export class MillerApiError extends Error {
  constructor(message, { code = "search_failed", status = 0 } = {}) { super(message); this.name = "MillerApiError"; this.code = code; this.status = status }
}

export async function askMiller(payload, { fetchImpl = fetch, timeoutMs = 25_000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl("/api/miller", { method: "POST", credentials: "include", signal: controller.signal, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new MillerApiError(response.status === 429 ? "Miller has had several requests. Please wait a moment and try again." : "Miller couldn’t complete that search. Please try again.", { code: data?.code || (response.status === 429 ? "rate_limited" : "search_failed"), status: response.status })
    if (!data || data.contractVersion !== MILLER_CONTRACT_VERSION || data.mode !== payload.interface || typeof data.message !== "string" || !data.results) throw new MillerApiError("Miller received an unexpected response. Please try again.", { code: "malformed_response", status: response.status })
    return data
  } catch (error) {
    if (error.name === "AbortError") throw new MillerApiError("Miller’s search took too long. Please try again.", { code: "timeout" })
    if (error instanceof MillerApiError) throw error
    throw new MillerApiError("Miller couldn’t connect. Please try again.", { code: "network_error" })
  } finally { clearTimeout(timer) }
}
