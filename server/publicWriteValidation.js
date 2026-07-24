export class PublicPayloadValidationError extends Error {}

const ANALYTICS_SCHEMA = {
  event_type: { required: true, type: "string", enum: ["page_view", "search", "resource_click"] },
  city: { type: "string", max: 100, nullable: true },
  resource_name: { type: "string", max: 200, nullable: true },
  miller_theme: { type: "string", max: 80, nullable: true },
  session_id: { type: "string", max: 36, pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, nullable: true },
}

const SUBMISSION_SCHEMA = {
  resource_name: { type: "string", max: 200, nullable: true },
  city: { type: "string", max: 100, nullable: true },
  note: { required: true, type: "string", min: 10, max: 2000 },
  website: { type: "string", max: 1200, format: "http-url", nullable: true },
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function validateWithSchema(payload, schema) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PublicPayloadValidationError("Payload must be an object.")
  }

  const unknown = Object.keys(payload).filter((field) => !Object.hasOwn(schema, field))
  if (unknown.length) throw new PublicPayloadValidationError("Payload contains unknown fields.")

  const result = {}
  for (const [field, rules] of Object.entries(schema)) {
    const original = payload[field]
    if (original === undefined || original === null || original === "") {
      if (rules.required) throw new PublicPayloadValidationError(`${field} is required.`)
      result[field] = null
      continue
    }
    if (typeof original !== rules.type) throw new PublicPayloadValidationError(`${field} has an invalid type.`)

    const value = original.trim()
    if (value.includes("\0")) throw new PublicPayloadValidationError(`${field} contains invalid characters.`)
    if (rules.required && !value) throw new PublicPayloadValidationError(`${field} is required.`)
    if (rules.min && value.length < rules.min) throw new PublicPayloadValidationError(`${field} is too short.`)
    if (rules.max && value.length > rules.max) throw new PublicPayloadValidationError(`${field} is too long.`)
    if (rules.enum && !rules.enum.includes(value)) throw new PublicPayloadValidationError(`${field} is invalid.`)
    if (rules.pattern && !rules.pattern.test(value)) throw new PublicPayloadValidationError(`${field} is invalid.`)
    if (rules.format === "http-url") {
      const normalized = safeHttpUrl(value)
      if (!normalized) throw new PublicPayloadValidationError(`${field} must be an HTTP(S) URL.`)
      result[field] = normalized
      continue
    }
    result[field] = value || (rules.nullable ? null : "")
  }
  return result
}

export function validateAnalyticsEvent(payload) {
  const event = validateWithSchema(payload, ANALYTICS_SCHEMA)
  if (event.event_type === "resource_click" && !event.resource_name) {
    throw new PublicPayloadValidationError("resource_name is required for resource_click.")
  }
  if (event.event_type !== "resource_click" && event.resource_name) {
    throw new PublicPayloadValidationError("resource_name is only valid for resource_click.")
  }

  return {
    event_type: event.event_type,
    city: event.city,
    resource_name: event.resource_name,
    miller_theme: event.miller_theme,
    session_id: event.session_id,
    query: null,
  }
}

export function validateResourceSubmission(payload) {
  const submission = validateWithSchema(payload, SUBMISSION_SCHEMA)
  return {
    name: submission.resource_name,
    city: submission.city,
    category: submission.note,
    website: submission.website,
  }
}
