const allowedKeys = ["public_support_id", "name", "organization", "governance_type", "province", "community", "service_area", "delivery_modes", "categories", "population_served", "scope", "eligibility", "referral_requirements", "cost", "hours", "phone", "email", "website", "access_pathway", "last_verified_date", "fraser_north"]
const forbiddenPattern = /owner_review|private_notes|patient_name|complainant|witness|personal_address|internal_id|confidence/i

export function validateMillerNorthFirstNationsSupportsPublic(projection) {
  if (projection?.schema_version !== "miller-north-first-nations-supports-public-v1") throw new Error("invalid_support_projection_version")
  if (!Array.isArray(projection.records) || projection.records.length !== 19) throw new Error("invalid_support_projection_count")
  if (forbiddenPattern.test(JSON.stringify(projection))) throw new Error("private_support_field_exposed")
  const ids = new Set()
  for (const record of projection.records) {
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...allowedKeys].sort())) throw new Error("invalid_support_public_shape")
    if (!/^fns_(?:bc|ab|sk)_[a-z0-9_]+$/.test(record.public_support_id) || ids.has(record.public_support_id)) throw new Error("invalid_support_public_id")
    ids.add(record.public_support_id)
    if (!/^https:\/\//.test(record.website) || !/^\d{4}-\d{2}-\d{2}$/.test(record.last_verified_date)) throw new Error("invalid_support_source")
    if (!["British Columbia", "Alberta", "Saskatchewan"].includes(record.province)) throw new Error("invalid_support_province")
    if (!Array.isArray(record.delivery_modes) || !record.delivery_modes.length || !Array.isArray(record.categories) || !record.categories.length) throw new Error("invalid_support_taxonomy")
  }
  const byProvince = Object.fromEntries(["British Columbia", "Alberta", "Saskatchewan"].map(province => [province, projection.records.filter(record => record.province === province).length]))
  return { valid: true, records: projection.records.length, by_province: byProvince, fraser_north: projection.records.filter(record => record.fraser_north).length }
}
