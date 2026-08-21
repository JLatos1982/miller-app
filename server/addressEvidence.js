import { normalizeIdentityText } from "./resourceIdentity.js"

export const ADDRESS_EVIDENCE_VERSION = "miller-address-evidence-v1.0.0"
export const SOURCE_PRIORITY = Object.freeze({ first_party: 1, health_authority: 2, government: 3, municipal: 4, established_directory: 5, existing_miller: 6, supporting_only: 7 })

const sensitive = /\b(residential|residence|recovery (?:house|home)|supportive housing|transitional (?:housing|living|recovery)|shelter|safe house|confidential|undisclosed|women'?s residence|youth residence|mobile|virtual|service[ -]area|outreach)\b/i
const directories = /(?:^|\.)(?:bc\.211\.ca|211\.ca|pathwaysbc\.ca)$/i
const health = /(?:^|\.)(?:fraserhealth\.ca|vch\.ca|providencehealthcare\.org|phsa\.ca|bcmhsus\.ca|fnha\.ca|interiorhealth\.ca|islandhealth\.ca|northernhealth\.ca)$/i
const government = /(?:^|\.)(?:gov\.bc\.ca|canada\.ca|gc\.ca)$/i
const municipal = /(?:^|\.)(?:vancouver\.ca|surrey\.ca|burnaby\.ca|newwestcity\.ca|richmond\.ca|delta\.ca|tol\.ca|langleycity\.ca|mapleridge\.ca|abbotsford\.ca|coquitlam\.ca|portcoquitlam\.ca|portmoody\.ca)$/i

export function classifySource(url, organization = "") {
  let host = ""
  try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase() } catch { return { type: "invalid", priority: 99, authoritative: false, domain: "" } }
  if (health.test(host)) return { type: "health_authority", priority: 2, authoritative: true, domain: host }
  if (government.test(host)) return { type: "government", priority: 3, authoritative: true, domain: host }
  if (municipal.test(host)) return { type: "municipal", priority: 4, authoritative: true, domain: host }
  if (directories.test(host)) return { type: "established_directory", priority: 5, authoritative: true, domain: host }
  const orgTokens = normalizeIdentityText(organization).split(" ").filter((x) => x.length > 3)
  const firstParty = orgTokens.some((token) => host.includes(token))
  return { type: firstParty ? "first_party" : "existing_miller", priority: firstParty ? 1 : 6, authoritative: firstParty, domain: host }
}

const provincePattern = /\b(?:british columbia|b\.?\s*c\.?)\b/ig
const postalPattern = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ])[ -]?(\d[ABCEGHJ-NPRSTVWXYZ]\d)\b/i
const unitPrefix = /\b(?:unit|suite|ste|office|apt|apartment|#)\s*#?\s*([A-Za-z0-9-]+)\b/i

export function addressComponents(value, fallback = {}) {
  const original = String(value || "").replace(/[\u2012-\u2015]/g, "-").replace(/\s+/g, " ").trim()
  let text = original.replace(provincePattern, "BC").replace(/\s*,\s*/g, ", ").replace(/,+/g, ",")
  const postal = text.match(postalPattern)
  const fallbackPostal = String(fallback.postal_code || "").replace(/\s/g, "").toUpperCase()
  const postalCode = postal ? `${postal[1].toUpperCase()} ${postal[2].toUpperCase()}` : fallbackPostal.length === 6 ? `${fallbackPostal.slice(0, 3)} ${fallbackPostal.slice(3)}` : fallbackPostal
  if (postal) text = text.replace(postal[0], " ")
  let unit = text.match(unitPrefix)?.[1] || ""
  const leading = text.match(/^\s*([A-Za-z0-9-]+)\s*-\s*(\d+[A-Za-z]?)\s+(.+)$/)
  if (!unit && leading && /^\d{1,4}[A-Za-z]?$/.test(leading[1])) { unit = leading[1]; text = `${leading[2]} ${leading[3]}` }
  const trailing = text.match(/,?\s*(?:unit|suite|ste|office|apt|apartment|#)\s*#?\s*([A-Za-z0-9-]+)\s*$/i)
  if (trailing) { unit ||= trailing[1]; text = text.slice(0, trailing.index) }
  text = text.replace(unitPrefix, " ").replace(/^\s*[-,]+|[-,]+\s*$/g, "").replace(/\s+/g, " ").trim()
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean)
  const civicIndex = parts.findIndex((part) => /\b\d+[A-Za-z]?\s+[A-Za-z]/.test(part))
  const streetAddress = civicIndex >= 0 ? parts[civicIndex] : text
  const municipality = String(fallback.city || parts[civicIndex + 1] || "").replace(provincePattern, "").trim()
  return Object.freeze({ original, unit, street_address: streetAddress, municipality, province: "BC", postal_code: postalCode })
}

export function normalizeAddress(value) {
  const parsed = addressComponents(value)
  return [parsed.unit ? `Unit ${parsed.unit}, ${parsed.street_address}` : parsed.street_address, parsed.municipality, parsed.postal_code].filter(Boolean).join(", ")
}

export function normalizedGeocodingQuery(value, fallback = {}) {
  const parsed = addressComponents(value, fallback)
  return [parsed.unit ? `Unit ${parsed.unit} -- ${parsed.street_address}` : parsed.street_address, parsed.municipality, "BC", parsed.postal_code].filter(Boolean).join(", ")
}
export function isCompleteNumberedAddress(value) { return /\b\d+[A-Za-z]?\s+[A-Za-z]/.test(normalizeAddress(value)) && !/\bP\.?\s*O\.?\s*Box\b/i.test(value) }
export function isSensitiveOrNonFixed(resource = {}) { return resource.virtual_service === true || resource.mobile_service === true || /\b(directory|online database|virtual|mobile|service area)\b/i.test(`${resource.service_type || resource.serviceType || ""} ${resource.accessType || ""}`) || sensitive.test(`${resource.name || ""} ${resource.service_type || resource.serviceType || ""} ${resource.address || ""}`) }

export function extractNumberedAddresses(pageText = "") {
  const pattern = /\b(?:Unit|Suite|#)?\s*[A-Za-z0-9-]*,?\s*\d{1,6}(?:-\d{1,6})?\s+(?:[A-Za-z][A-Za-z'.-]*\s+){0,5}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Highway|Hwy|Lane|Ln|Crescent|Cres|Kingsway)\b/gi
  return [...new Set((String(pageText).match(pattern) || []).map(normalizeAddress))]
}

export function pageSupportsProgram({ resource, pageText, address }) {
  const text = normalizeIdentityText(pageText)
  const number = normalizeAddress(address).match(/\b(\d+[A-Za-z]?)\b/)?.[1]?.toLowerCase()
  const identityTokens = normalizeIdentityText(`${resource.name || ""} ${resource.organization || ""}`).split(" ").filter((x) => x.length > 4)
  const numberAt = number ? text.search(new RegExp(`\\b${number}\\b`)) : -1
  return Boolean(numberAt >= 0 && identityTokens.some((token) => { const at = text.indexOf(token); return at >= 0 && Math.abs(at - numberAt) <= 900 }))
}

export function classifyAddressEvidence({ resource, source, page = {}, conflicts = [] }) {
  const address = normalizeAddress(resource.address)
  const hardExcluded = isSensitiveOrNonFixed(resource)
  const complete = isCompleteNumberedAddress(address)
  const supports = pageSupportsProgram({ resource, pageText: page.text || "", address })
  let tier = "E3", recommendation = "insufficient evidence", reasons = []
  if (hardExcluded) reasons.push("sensitive_or_non_fixed")
  else if (!complete) reasons.push("no_complete_numbered_public_address")
  else if (!supports) reasons.push("program_address_relationship_not_verified")
  else if (!source.authoritative || source.priority > 4) { tier = "E2"; recommendation = "needs address review"; reasons.push("supporting_source_requires_authoritative_confirmation") }
  else if (conflicts.length) { tier = "E2"; recommendation = "needs address review"; reasons.push("source_conflict") }
  else { tier = "E1"; recommendation = "ready for geocoding" }
  return { tier, recommendation, reasons, program_relationship_verified: supports, fixed_public_facility: !hardExcluded && complete }
}

export function groupSharedAddresses(items = []) {
  const groups = new Map()
  for (const item of items) {
    const key = `${normalizeIdentityText(item.proposed_address)}|${normalizeIdentityText(item.municipality)}`
    if (!key.startsWith("|")) groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()].filter(([, members]) => members.length > 1).map(([normalized_address, members]) => ({ normalized_address, resources: members.map((item) => ({ canonical_uuid: item.canonical_uuid, resource_name: item.resource_name })) }))
}

export function approveEvidenceForGeocoding(record) {
  if (record.tier !== "E1") throw new Error("Only E1 evidence may be approved for future geocoding")
  return { ...record, evidence_review_status: "approved_for_future_geocoding", public_map: false, coordinates: null }
}
