import crypto from "node:crypto"

const REVIEW_RELEVANT_FIELDS = [
  "name",
  "organization",
  "description",
  "website",
  "city",
  "category",
  "service_type",
  "source",
  "quality_score",
]

function canonicalValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "boolean") return value
  return String(value).replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim()
}

export function canonicalReviewResource(resource) {
  return Object.fromEntries(
    REVIEW_RELEVANT_FIELDS.map((field) => [field, canonicalValue(resource?.[field])])
  )
}

export function createReviewFingerprint(resource) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalReviewResource(resource)))
    .digest("hex")
}

export { REVIEW_RELEVANT_FIELDS }

