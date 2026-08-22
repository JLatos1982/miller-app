const text = (value) => String(value ?? "").trim()
const protectedText = /safe home|transition house|domestic violence|trafficking|confidential|undisclosed|supportive recovery|recovery home/i
const nonphysicalText = /virtual|telephone|regional service|service area|intake line|access line/i
const healthText = /fraser|coastal|providence|health|oat|opioid|withdrawal|detox|substance use|mental health|raac/i

export function canonicalResearchReason({ resource = {}, address = "", hasUsableOccupancy = false, hasConflict = false, programSiteConfirmed = false }) {
  const name = text(resource.display_name)
  if (resource.lifecycle_state !== "active" || resource.editorial_status === "hidden") return "excluded_inactive_or_hidden"
  if (protectedText.test(`${name} ${address}`)) return "sensitive_or_protected"
  if (nonphysicalText.test(`${name} ${address}`)) return "nonphysical_or_virtual"
  if (hasConflict) return "current_address_conflict"
  if (!address) return "no_address"
  if (!/^\s*(?:(?:unit|suite)\s+\d+[a-z]?\s*,\s*)?(?:\d+[a-z]?\s*(?:[-–—]\s*)?)?\d+[a-z]?\s+.+/i.test(address)) return "incomplete_address"
  if (!programSiteConfirmed && /\bprogram\b|nexup/i.test(name)) return "program_site_not_confirmed"
  if (!hasUsableOccupancy) return "missing_authoritative_occupancy"
  return "downstream_follow_through"
}

export function buildCanonicalResearchQueue(records = [], limit = 50) {
  const priority = (item) => healthText.test(item.resource?.display_name || "") ? 0 : item.reason === "missing_authoritative_occupancy" ? 1 : 2
  return records.map((item) => ({ ...item, reason: canonicalResearchReason(item) }))
    .filter((item) => !["excluded_inactive_or_hidden", "sensitive_or_protected", "nonphysical_or_virtual", "downstream_follow_through"].includes(item.reason))
    .sort((a, b) => priority(a) - priority(b) || text(a.resource?.display_name).localeCompare(text(b.resource?.display_name)))
    .slice(0, Math.max(1, Math.min(50, limit)))
}
