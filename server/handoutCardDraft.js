import { callStructuredReview } from "./review/model.js"

const REQUEST_FIELDS = ["sourceTitle", "sourceUrl", "sourceDomain", "name", "organization", "description", "website", "city", "category", "serviceType", "searchCity"]
const OUTPUT_FIELDS = ["name", "organization", "category", "city", "serviceArea", "description", "address", "phone", "email", "website", "hours", "eligibility", "referralProcess", "cost", "accessibility", "languages", "limitations", "callBeforeNote"]

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""))
    return ["http:", "https:"].includes(url.protocol)
  } catch {
    return false
  }
}

export function validateHandoutDraftRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A public resource result is required.")
  const unexpected = Object.keys(value).filter((key) => !REQUEST_FIELDS.includes(key))
  if (unexpected.length) throw new Error("The request contains unsupported fields.")
  const result = Object.fromEntries(REQUEST_FIELDS.map((field) => [field, String(value[field] || "").trim()]))
  if (!result.name || result.name.length > 500) throw new Error("A valid resource name is required.")
  if (!safeUrl(result.sourceUrl) || !safeUrl(result.website)) throw new Error("A valid public website is required.")
  for (const [field, fieldValue] of Object.entries(result)) {
    if (fieldValue.length > (field === "description" ? 1600 : 1200)) throw new Error(`${field} is too long.`)
  }
  return result
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: OUTPUT_FIELDS,
  properties: Object.fromEntries(OUTPUT_FIELDS.map((field) => [field, { type: "string" }])),
}

export function sanitizeGeneratedHandoutDraft(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The generator returned malformed structured output.")
  const fallback = {
    name: source.name, organization: source.organization, category: source.category || source.serviceType,
    city: source.city || source.searchCity, serviceArea: source.city || source.searchCity,
    description: source.description, website: source.website,
  }
  return Object.fromEntries(OUTPUT_FIELDS.map((field) => {
    const limit = field === "description" ? 1600 : field === "website" ? 1200 : 500
    let fieldValue = typeof value[field] === "string" ? value[field].trim().slice(0, limit) : ""
    if (!fieldValue) fieldValue = String(fallback[field] || "").slice(0, limit)
    if (field === "website" && !safeUrl(fieldValue)) fieldValue = source.website
    return [field, fieldValue]
  }))
}

export async function generateHandoutCardDraft(input, { openai }) {
  const resource = validateHandoutDraftRequest(input)
  const generated = await callStructuredReview({
    openai,
    name: "miller_temporary_handout_card",
    schema,
    instructions: "Turn one public community-resource search result into a concise editable handout card. Use only the supplied public source text. Never infer eligibility, availability, cost, accessibility, languages, or clinical suitability. Leave unsupported fields empty. Preserve uncertainty. This is a temporary unverified card, not a Miller-approved resource.",
    input: JSON.stringify(resource),
  })
  return sanitizeGeneratedHandoutDraft(generated, resource)
}

export function getHandoutDraftFailureReason(error) {
  const message = String(error?.message || "").toLowerCase()
  if (message.includes("rate") || message.includes("temporar") || message.includes("timeout")) return "generator_unavailable"
  if (message.includes("malformed") || message.includes("structured output")) return "details_unconfirmed"
  return "details_unconfirmed"
}
