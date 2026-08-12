import { createHash } from "node:crypto"

export const normalizeIdentityText = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()
export const normalizePhone = (value) => String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")

export function normalizePublicUrl(value) {
  try {
    const url = new URL(String(value || ""))
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    const path = url.pathname.replace(/\/+$/, "") || "/"
    return `${host}${path}`.toLowerCase()
  } catch { return "" }
}

export function canonicalSeedId(sourceType, sourceNativeId) {
  const hex = createHash("sha256").update(`miller-resource-registry:v1:${sourceType}:${sourceNativeId}`).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16)
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`
}

const tokens = (value) => new Set(normalizeIdentityText(value).split(" ").filter((token) => token.length > 2))
function overlap(left, right) {
  const a = tokens(left); const b = tokens(right)
  if (!a.size || !b.size) return 0
  const common = [...a].filter((token) => b.has(token)).length
  return common / new Set([...a, ...b]).size
}

export function comparePublicResources(left, right) {
  const evidence = {
    exact_url: Boolean(normalizePublicUrl(left.website) && normalizePublicUrl(left.website) === normalizePublicUrl(right.website)),
    same_domain: Boolean(normalizePublicUrl(left.website) && normalizePublicUrl(left.website).split("/")[0] === normalizePublicUrl(right.website).split("/")[0]),
    exact_phone: Boolean(normalizePhone(left.phone) && normalizePhone(left.phone) === normalizePhone(right.phone)),
    exact_city: Boolean(normalizeIdentityText(left.city) && normalizeIdentityText(left.city) === normalizeIdentityText(right.city)),
    name_similarity: Number(overlap(left.name, right.name).toFixed(3)),
    organization_similarity: Number(overlap(left.organization, right.organization).toFixed(3)),
    exact_address: Boolean(normalizeIdentityText(left.address) && normalizeIdentityText(left.address) === normalizeIdentityText(right.address)),
  }
  let classification = "likely_distinct"
  if (evidence.exact_url && (evidence.name_similarity >= 0.35 || evidence.organization_similarity >= 0.5)) classification = "high_confidence"
  else if ((evidence.exact_phone && evidence.exact_city) || (evidence.same_domain && evidence.name_similarity >= 0.5) || (evidence.exact_address && evidence.name_similarity >= 0.35)) classification = "possible"
  else if (!left.website && !right.website && !left.phone && !right.phone) classification = "insufficient"
  const score = (evidence.exact_url ? 50 : 0) + (evidence.exact_phone ? 25 : 0) + (evidence.exact_city ? 5 : 0) + evidence.name_similarity * 20 + evidence.organization_similarity * 10
  return { classification, score: Number(score.toFixed(2)), evidence }
}

export function proposeMatches(curated, external) {
  return external.map((right) => {
    const ranked = curated.map((left) => ({ left, ...comparePublicResources(left, right) })).sort((a, b) => b.score - a.score || String(a.left.id).localeCompare(String(b.left.id)))
    const best = ranked[0]
    return { left_source_type: "curated_bundle", left_source_native_id: String(best.left.id), left_name: best.left.name, right_source_type: "tavily_resource", right_source_native_id: String(right.id), right_name: right.name, classification: best.classification, score: best.score, evidence: best.evidence, decision: "pending" }
  })
}

export function resolveConfirmedAlias(sourceType, sourceNativeId, aliases) {
  return aliases.find((alias) => alias.source_type === sourceType && String(alias.source_native_id) === String(sourceNativeId))?.resource_id || null
}

export function proposedCanonicalIdForSource(sourceType, sourceNativeId, decisions = []) {
  if (sourceType === "tavily_resource") {
    const confirmed = decisions.find((item) => item.decision === "same_resource" && item.right_source_type === sourceType && String(item.right_source_native_id) === String(sourceNativeId))
    if (confirmed) return canonicalSeedId(confirmed.left_source_type, confirmed.left_source_native_id)
  }
  return canonicalSeedId(sourceType, sourceNativeId)
}
