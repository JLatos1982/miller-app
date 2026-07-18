import { callStructuredReview } from "./review/model.js"

const REQUEST_FIELDS = ["sourceTitle", "sourceUrl", "name", "organization", "description", "website", "city", "category", "serviceType"]
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

export async function generateHandoutCardDraft(input, { openai }) {
  const resource = validateHandoutDraftRequest(input)
  return callStructuredReview({
    openai,
    name: "miller_temporary_handout_card",
    schema,
    instructions: "Turn one public community-resource search result into a concise editable handout card. Use only the supplied public source text. Never infer eligibility, availability, cost, accessibility, languages, or clinical suitability. Leave unsupported fields empty. Preserve uncertainty. This is a temporary unverified card, not a Miller-approved resource.",
    input: JSON.stringify(resource),
  })
}
