const clean = (value) => String(value ?? "").trim()

function stripCodeFences(text) {
  return clean(text).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
}

function stringArray(value, maximum) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === "string" && clean(item))
}

function booleanMap(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key))
    && Object.values(value).every((item) => typeof item === "boolean")
}

function validSearchIntent(value) {
  const keys = ["supportNeeds", "substances", "locationText", "city", "transport", "barriers", "timing", "practicalConstraints", "uncertain"]
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) return false
  if (!["supportNeeds", "substances", "timing", "practicalConstraints", "uncertain"].every((key) => value[key] == null || stringArray(value[key], 8))) return false
  if (value.locationText != null && (typeof value.locationText !== "string" || !clean(value.locationText) || value.locationText.length > 120)) return false
  if (value.city != null && (typeof value.city !== "string" || !clean(value.city) || value.city.length > 120)) return false
  return booleanMap(value.transport || {}, ["noCar", "transitRelevant", "walkingRelevant"])
    && booleanMap(value.barriers || {}, ["noId", "noPhone", "walkInNeeded", "wheelchair", "cannotPay"])
}

// The model is asked for this shape in the current /api/miller prompt. This
// validator deliberately does not infer or repair a partial response: the
// caller must fall back to deterministic search intent instead.
export function parseMillerAssistantResponse(text) {
  if (!clean(text)) return Object.freeze({ valid: false, reason: "empty_model_response", value: null })
  let value
  try { value = JSON.parse(stripCodeFences(text)) } catch { return Object.freeze({ valid: false, reason: "malformed_json", value: null }) }
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({ valid: false, reason: "response_not_object", value: null })
  const rootKeys = ["answer", "searchHints", "searchIntent", "clarification"]
  if (Object.keys(value).some((key) => !rootKeys.includes(key))) return Object.freeze({ valid: false, reason: "unexpected_response_field", value: null })
  if (typeof value.answer !== "string" || !clean(value.answer)) return Object.freeze({ valid: false, reason: "answer_required", value: null })
  const hints = value.searchHints
  if (!hints || typeof hints !== "object" || Array.isArray(hints) || Object.keys(hints).some((key) => !["categories", "keywords", "recommendedResourceNames"].includes(key))) return Object.freeze({ valid: false, reason: "search_hints_invalid", value: null })
  if (!stringArray(hints.categories, 4) || !stringArray(hints.keywords, 8) || !stringArray(hints.recommendedResourceNames, 6)) return Object.freeze({ valid: false, reason: "search_hints_values_invalid", value: null })
  if (!validSearchIntent(value.searchIntent)) return Object.freeze({ valid: false, reason: "search_intent_invalid", value: null })
  if (value.clarification != null && (typeof value.clarification !== "string" || value.clarification.length > 500)) return Object.freeze({ valid: false, reason: "clarification_invalid", value: null })
  return Object.freeze({ valid: true, reason: null, value })
}

export function deterministicMillerAssistantFallback() {
  return "Miller used a safe basic interpretation and pulled together the closest verified resources below. You can edit the request if any important detail is missing."
}
