export class MillerRequestValidationError extends Error {}

const TOP_LEVEL_FIELDS = new Set([
  "query", "city", "matches", "conversationMemory", "conversationSummary",
  "inferredCategories", "communicationMode", "session_id",
])
const RESOURCE_FIELDS = new Set([
  "name", "organization", "serviceType", "service_type", "category", "population",
  "eligibility", "description", "accessType", "hours", "phone", "altPhone", "email",
  "website", "address", "city", "region", "notes", "source", "approved", "hidden",
  "qualityScore", "quality_score", "id", "tags",
])
const MODES = new Set(["default", "worker", "crisis", "companion"])

function text(value, field, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new MillerRequestValidationError(`${field} is required.`)
    return ""
  }
  if (typeof value !== "string" || value.includes("\0")) throw new MillerRequestValidationError(`${field} is invalid.`)
  const clean = value.trim()
  if (required && !clean) throw new MillerRequestValidationError(`${field} is required.`)
  if (clean.length > max) throw new MillerRequestValidationError(`${field} is too long.`)
  return clean
}

function resource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MillerRequestValidationError("Invalid resource match.")
  if (Object.keys(value).some((key) => !RESOURCE_FIELDS.has(key))) throw new MillerRequestValidationError("Resource match contains unsupported fields.")
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === "approved" || key === "hidden") {
      if (typeof item !== "boolean") throw new MillerRequestValidationError("Invalid resource match.")
      result[key] = item
    } else if (key === "id" || key === "qualityScore" || key === "quality_score") {
      if (typeof item !== "number" && typeof item !== "string") throw new MillerRequestValidationError("Invalid resource match.")
      result[key] = item
    } else if (key === "tags") {
      if (!Array.isArray(item) || item.length > 20) throw new MillerRequestValidationError("Invalid resource tags.")
      result.tags = item.map((tag) => text(tag, "resource tag", 100))
    } else {
      result[key] = text(item, `resource ${key}`, key === "description" ? 3000 : 1200)
    }
  }
  return result
}

export function validateMillerRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new MillerRequestValidationError("Request must be an object.")
  if (Object.keys(payload).some((key) => !TOP_LEVEL_FIELDS.has(key))) throw new MillerRequestValidationError("Request contains unsupported fields.")
  const query = text(payload.query, "Query", 500, { required: true })
  const city = text(payload.city, "City", 100)
  const conversationSummary = text(payload.conversationSummary, "Conversation summary", 4000)
  const matches = payload.matches ?? []
  if (!Array.isArray(matches) || matches.length > 30) throw new MillerRequestValidationError("Invalid resource matches.")
  const conversationMemory = payload.conversationMemory ?? []
  if (!Array.isArray(conversationMemory) || conversationMemory.length > 24) throw new MillerRequestValidationError("Invalid conversation history.")
  const safeMemory = conversationMemory.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["role", "content"].includes(key))) throw new MillerRequestValidationError("Invalid conversation history.")
    if (!["user", "assistant"].includes(item.role)) throw new MillerRequestValidationError("Invalid conversation role.")
    return { role: item.role, content: text(item.content, "Conversation content", 1200, { required: true }) }
  })
  const inferredCategories = payload.inferredCategories ?? []
  if (!Array.isArray(inferredCategories) || inferredCategories.length > 10) throw new MillerRequestValidationError("Invalid inferred categories.")
  const communicationMode = text(payload.communicationMode, "Communication mode", 30)
  if (communicationMode && !MODES.has(communicationMode)) throw new MillerRequestValidationError("Invalid communication mode.")
  const sessionId = text(payload.session_id, "Session ID", 36)
  if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) throw new MillerRequestValidationError("Invalid session ID.")
  return {
    query, city, matches: matches.map(resource), conversationMemory: safeMemory,
    conversationSummary, inferredCategories: inferredCategories.map((item) => text(item, "Category", 100, { required: true })),
    communicationMode, session_id: sessionId,
  }
}
