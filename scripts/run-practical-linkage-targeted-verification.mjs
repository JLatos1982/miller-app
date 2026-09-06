import fs from "node:fs/promises"
import { tavily } from "@tavily/core"
import { readFarmSource } from "/Users/admin/samwise-private/server/farmSourceReader.js"
import { extractNumberedAddresses } from "../server/addressEvidence.js"
import { evaluatePracticalLocationCandidates } from "../server/practicalPublicLocationPublication.js"

const ARTIFACT = new URL("../data/miller-practical-linkage-diagnostic-v1.json", import.meta.url)
if (!process.env.TAVILY_API_KEY) throw new Error("tavily_configuration_required")
const search = tavily({ apiKey: process.env.TAVILY_API_KEY })
const artifact = JSON.parse(await fs.readFile(ARTIFACT, "utf8"))
const normalized = (value) => String(value || "").toLowerCase().replace(/\b(?:unit|suite)\s*/g, "").replace(/\b(?:street|st)\b/g, "st").replace(/\b(?:avenue|ave)\b/g, "ave").replace(/[^a-z0-9]+/g, " ").trim()
const sameAddress = (left, right) => {
  const a = normalized(left), b = normalized(right)
  const civic = a.match(/\b\d{1,6}[a-z]?\b/)?.[0]
  return Boolean(civic && b.includes(civic) && (a.includes(b) || b.includes(a) || a.split(" ").filter((token) => token.length > 2).filter((token) => b.includes(token)).length >= 2))
}
const targets = []
for (const record of artifact.records) for (const source of record.sources) for (const candidate of source.candidates || []) {
  if (!["program_site_supported", "program_site_probable"].includes(candidate.local_light?.classification) || candidate.program_site_disposition === "program_site_supported") continue
  const key = `${record.resource_id}|${normalized(candidate.address)}`
  if (!targets.some((target) => target.key === key)) targets.push({ key, record, source, candidate })
}
let calls = 0, fetches = 0
for (const target of targets) {
  calls++
  const query = `"${target.record.name}" "${target.candidate.address}"`
  let results = []
  try { results = (await search.search(query, { searchDepth: "basic", maxResults: 5, includeAnswer: false })).results || [] } catch (error) { target.candidate.targeted_verification = { query, status: "search_unavailable", error: String(error?.message || error).slice(0, 200) }; continue }
  const confirmations = []
  for (const hit of results.slice(0, 3)) {
    if (hit.url.replace(/\/$/, "") === target.source.url.replace(/\/$/, "") || /\/agency-details\//.test(hit.url)) continue
    try {
      fetches++
      const farm = await readFarmSource({ url: hit.url })
      const sourceText = farm.segments.map((segment) => segment.text).join("\n")
      const extracted = [...new Set(extractNumberedAddresses([sourceText, ...(farm.structure || []).map((block) => `${block.heading || ""} ${block.text || ""}`)].join("\n")))]
      const matched = extracted.find((address) => sameAddress(address, target.candidate.address))
      if (!matched) continue
      const [evaluated] = evaluatePracticalLocationCandidates({ resource: { display_name: target.record.name, organization: target.record.organization }, sourceText, candidates: [matched], sourceUrl: farm.url, structure: farm.structure })
      confirmations.push({ url: farm.url, title: hit.title || "", matched_address: matched, disposition: evaluated.program_site_disposition, linkage_reason: evaluated.linkage_reason, source_quality: farm.source_quality, context: evaluated.context })
    } catch {}
  }
  const confirmed = confirmations.find((confirmation) => confirmation.disposition === "program_site_supported")
  target.candidate.targeted_verification = { query, status: confirmed ? "deterministically_confirmed" : "not_confirmed", confirmations }
  await fs.writeFile(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
}
const confirmed = artifact.records.flatMap((record) => record.sources.flatMap((source) => (source.candidates || []).filter((candidate) => candidate.targeted_verification?.status === "deterministically_confirmed").map((candidate) => ({ resource_id: record.resource_id, name: record.name, locality: record.locality, original_source: source.url, address: candidate.address, verification: candidate.targeted_verification }))))
artifact.targeted_verification_summary = { calls, trusted_fetch_attempts: fetches, deterministically_confirmed: confirmed.length }
await fs.writeFile(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...artifact.targeted_verification_summary, confirmed }, null, 2))
