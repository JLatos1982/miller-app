import { MAX_DUPLICATE_CANDIDATES } from "./constants.js"

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"])

export function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim())
    if (!["http:", "https:"].includes(url.protocol)) return ""

    url.hash = ""
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    url.pathname = url.pathname.replace(/\/+$/, "") || "/"
    return `${url.hostname}${url.pathname}${url.search}`.toLowerCase()
  } catch {
    return ""
  }
}

export function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|society|association|organization|organisation)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeName(left).split(" ").filter(Boolean))
  const b = new Set(normalizeName(right).split(" ").filter(Boolean))
  if (!a.size || !b.size) return 0
  const intersection = [...a].filter((token) => b.has(token)).length
  return intersection / new Set([...a, ...b]).size
}

export function classifyDeterministicDuplicate(resource, candidate) {
  const resourceUrl = normalizeUrl(resource.website)
  const candidateUrl = normalizeUrl(candidate.website)
  const resourceName = normalizeName(resource.name)
  const candidateName = normalizeName(candidate.name)
  const resourceOrg = normalizeName(resource.organization)
  const candidateOrg = normalizeName(candidate.organization)
  const fields = []

  if (resourceUrl && resourceUrl === candidateUrl) fields.push("website")
  if (resourceName && resourceName === candidateName) fields.push("name")
  if (resourceOrg && resourceOrg === candidateOrg) fields.push("organization")
  if (normalizeName(resource.city) && normalizeName(resource.city) === normalizeName(candidate.city)) fields.push("city")

  if (fields.includes("website")) {
    return { candidate_resource_id: candidate.id, match_type: "exact_duplicate", confidence: 1, explanation: "The normalized website URL is identical.", fields_matched: fields, suggested_action: "Compare both records and retain the more complete one." }
  }

  if (resourceOrg && resourceOrg === candidateOrg && resourceName !== candidateName) {
    return { candidate_resource_id: candidate.id, match_type: "same_organization_different_program", confidence: 0.88, explanation: "The organization matches, but the program names differ.", fields_matched: fields, suggested_action: "Keep separate unless a human confirms both pages describe the same program." }
  }

  const similarity = tokenSimilarity(resource.name, candidate.name)
  if (similarity >= 0.8) {
    return { candidate_resource_id: candidate.id, match_type: "likely_duplicate", confidence: similarity, explanation: "The normalized titles are highly similar.", fields_matched: ["name"], suggested_action: "Compare the service details and website before deciding." }
  }

  if (similarity >= 0.45 || (resourceOrg && resourceOrg === candidateOrg)) {
    return { candidate_resource_id: candidate.id, match_type: "uncertain", confidence: Math.max(0.45, similarity), explanation: "Some identifying text overlaps, but deterministic evidence is inconclusive.", fields_matched: fields.length ? fields : ["name"], suggested_action: "Use semantic review and human comparison." }
  }

  return null
}

export function findDeterministicCandidates(resource, existingResources) {
  return (existingResources || [])
    .filter((candidate) => String(candidate.id) !== String(resource.id))
    .map((candidate) => classifyDeterministicDuplicate(resource, candidate))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_DUPLICATE_CANDIDATES)
}

