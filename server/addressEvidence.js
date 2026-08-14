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

export function normalizeAddress(value) { return String(value || "").replace(/\s+/g, " ").replace(/^#(\d+)-/, "Unit $1, ").trim() }
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
