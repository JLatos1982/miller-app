import fs from "node:fs/promises"
import { tavily } from "@tavily/core"
import { readFarmSource } from "/Users/admin/samwise-private/server/farmSourceReader.js"
import { extractNumberedAddresses } from "../server/addressEvidence.js"
import { evaluatePracticalLocationCandidates } from "../server/practicalPublicLocationPublication.js"

const artifactPath = new URL("../data/miller-practical-multi-site-recovery-v1.json", import.meta.url)
if (!process.env.TAVILY_API_KEY) throw new Error("tavily_configuration_required")
const search = tavily({ apiKey: process.env.TAVILY_API_KEY })
const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"))
if (artifact.version !== "miller-practical-multi-site-recovery-v1" || artifact.relationships?.length !== 24) throw new Error("multi_site_recovery_artifact_required")
const normalized = (value) => String(value || "").toLowerCase().replace(/\b(?:unit|suite|room|floor|basement)\s*/g, "").replace(/\b(?:street|st)\b/g, "st").replace(/\b(?:avenue|ave)\b/g, "ave").replace(/[^a-z0-9]+/g, " ").trim()
const sameAddress = (left, right) => {
  const a = normalized(left), b = normalized(right), civic = a.match(/\b\d{1,6}[a-z]?\b/)?.[0]
  const meaningful = a.split(" ").filter((token) => token.length > 2 && !/^(?:unit|room)$/.test(token))
  return Boolean(civic && b.includes(civic) && meaningful.filter((token) => b.includes(token)).length >= Math.min(2, meaningful.length))
}
const sourceEvaluation = async (relationship, url, title = "") => {
  const farm = await readFarmSource({ url })
  const sourceText = farm.segments.map((segment) => segment.text).join("\n")
  const addresses = [...new Set(extractNumberedAddresses([sourceText, ...(farm.structure || []).map((block) => `${block.heading || ""} ${block.text || ""}`)].join("\n")))]
  const address = addresses.find((item) => sameAddress(item, relationship.candidate_address))
  if (!address) return { url: farm.url, title, status: "address_not_found", source_quality: farm.source_quality }
  const [candidate] = evaluatePracticalLocationCandidates({ resource: { display_name: relationship.resource_name, organization: relationship.organization }, sourceText, candidates: [address], sourceUrl: farm.url, structure: farm.structure })
  return { url: farm.url, title, status: candidate.program_site_disposition === "program_site_supported" ? "program_site_confirmed" : "address_found_linkage_insufficient", source_quality: farm.source_quality, matched_address: address, linkage_reason: candidate.linkage_reason, context: candidate.context, fingerprint: farm.fingerprint }
}
let tavilyCalls = 0, trustedFetches = 0
const sourceCache = new Map()
const evaluate = async (relationship, url, title = "") => {
  const key = `${relationship.resource_id}|${relationship.candidate_address}|${url}`
  if (sourceCache.has(key)) return sourceCache.get(key)
  trustedFetches++
  try { const value = await sourceEvaluation(relationship, url, title); sourceCache.set(key, value); return value }
  catch (error) { const value = { url, title, status: /not_approved/.test(String(error?.message)) ? "source_prohibited" : "source_unavailable", error: String(error?.message || error).slice(0, 240) }; sourceCache.set(key, value); return value }
}
for (const relationship of artifact.relationships) {
  if (relationship.state !== "pending") continue
  if (relationship.source_type === "official_provider_page") {
    const original = await evaluate(relationship, relationship.source_url, "captured official provider page")
    relationship.verification_attempts.push({ query: null, result: original })
    if (original.status === "program_site_confirmed") { relationship.state = "program_site_confirmed"; relationship.confirmation = original; await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 }); continue }
  }
  const queries = [
    `"${relationship.resource_name}" "${relationship.candidate_address}"`,
    `"${relationship.resource_name}" "${relationship.candidate_locality}" "${relationship.organization || relationship.site_branch_label}"`,
    `"${relationship.organization || relationship.resource_name}" "${relationship.resource_name}" "${relationship.candidate_address}"`,
  ]
  let sawAddressOnly = false, sawProhibited = false
  for (const query of [...new Set(queries)]) {
    tavilyCalls++
    let hits = []
    try { hits = (await search.search(query, { searchDepth: "basic", maxResults: 5, includeAnswer: false })).results || [] }
    catch (error) { relationship.verification_attempts.push({ query, status: "search_unavailable", error: String(error?.message || error).slice(0, 200) }); continue }
    const attempt = { query, candidate_urls: hits.map((hit) => ({ url: hit.url, title: hit.title || "" })), trusted_results: [] }
    for (const hit of hits.slice(0, 3)) {
      if (/\/agency-details\//.test(hit.url) || hit.url.replace(/\/$/, "") === relationship.source_url.replace(/\/$/, "")) continue
      const checked = await evaluate(relationship, hit.url, hit.title || "")
      attempt.trusted_results.push(checked)
      if (checked.status === "source_prohibited") sawProhibited = true
      if (checked.status === "address_found_linkage_insufficient") sawAddressOnly = true
      if (checked.status === "program_site_confirmed") { relationship.state = "program_site_confirmed"; relationship.confirmation = checked; break }
    }
    relationship.verification_attempts.push(attempt)
    if (relationship.state === "program_site_confirmed") break
  }
  if (relationship.state === "pending") {
    const genericUmbrella = /^(?:Housing, Healthcare & Harm Reduction|Mental Health Support Services)\b/i.test(relationship.resource_name)
    const clearWrongBranch = relationship.resource_name.includes("SFU Surrey") && relationship.candidate_locality && relationship.candidate_locality !== "Surrey"
    relationship.state = clearWrongBranch ? "unrelated_site" : sawAddressOnly || genericUmbrella ? "organization_site_only" : sawProhibited ? "site_not_confirmed" : "site_not_confirmed"
  }
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
}
artifact.completed_at = new Date().toISOString()
artifact.summary = {
  relationships: artifact.relationships.length,
  resources: new Set(artifact.relationships.map((item) => item.resource_id)).size,
  tavily_calls: tavilyCalls,
  trusted_confirmation_fetches: trustedFetches,
  dispositions: Object.entries(artifact.relationships.reduce((counts, item) => ({ ...counts, [item.state]: (counts[item.state] || 0) + 1 }), {})).map(([state, count]) => ({ state, count })).sort((a, b) => a.state.localeCompare(b.state)),
  prohibited_sources_retrusted: 0,
}
await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify(artifact.summary, null, 2))
