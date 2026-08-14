import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import rows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { normalizedResourceRows } from "../src/resourceData.js"
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { ADDRESS_EVIDENCE_VERSION, classifyAddressEvidence, classifySource, extractNumberedAddresses, groupSharedAddresses, isCompleteNumberedAddress, isSensitiveOrNonFixed, normalizeAddress, pageSupportsProgram } from "../server/addressEvidence.js"

const PROJECT = "wccagykzugrahwugefqt", MAX = 150, SAVE = process.argv.includes("--save")
const CACHE_DIR = path.resolve(".cache/address-evidence-pages"), OUTPUT = path.resolve("data/address-evidence-inventory.json")
const priorityPattern = /clinic|hospital|raac|opioid|oat|pharmacy|health|counselling|counseling|community cent|employment|food|clothing|basic needs|withdrawal|mental health/i
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const hash = (value) => createHash("sha256").update(value).digest("hex")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function stripHtml(html) { return clean(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/&quot;/gi, '"')) }
function titleOf(html) { return clean(String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 240) }
function excerpt(text, address) { const words = clean(text).split(" "), number = normalizeAddress(address).match(/\b\d+[A-Za-z]?\b/)?.[0]?.toLowerCase(), at = Math.max(0, words.findIndex((word) => word.toLowerCase().replace(/\W/g, "") === number)); return words.slice(Math.max(0, at - 8), Math.max(0, at - 8) + 25).join(" ") }
function addressParts(address) { const value = normalizeAddress(address), unit = value.match(/(?:Unit|Suite|#)\s*([A-Za-z0-9-]+)/i)?.[1] || "", postal = value.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i)?.[0]?.toUpperCase() || ""; return { unit, street: value.replace(/^(?:Unit|Suite)\s*[A-Za-z0-9-]+,?\s*/i, ""), postal_code: postal } }

if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT) throw new Error("Wrong or missing Supabase project")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const [{ data: aliases, error: aliasError }, { data: locations, error: locationError }] = await Promise.all([
  db.from("resource_source_aliases").select("resource_id,source_type,source_native_id,source_url"),
  db.from("resource_locations").select("resource_id,review_status,public_map"),
])
if (aliasError || locationError) throw new Error("Registry inventory could not be read")
const mapped = new Set(locations.map((item) => item.resource_id)), byAlias = new Map(aliases.map((item) => [`${item.source_type}:${item.source_native_id}`, item]))
const candidates = normalizedResourceRows(rows).map((resource) => {
  const sourceAlias = stableCuratedResourceId(resource), alias = byAlias.get(`curated_bundle:${sourceAlias}`)
  return alias ? { ...resource, canonical_uuid: alias.resource_id, source_aliases: aliases.filter((item) => item.resource_id === alias.resource_id).map((item) => `${item.source_type}:${item.source_native_id}`), source_alias: sourceAlias } : null
}).filter(Boolean).filter((item) => !mapped.has(item.canonical_uuid)).sort((a, b) => {
  const score = (item) => Number(priorityPattern.test(`${item.name} ${item.serviceType} ${item.category}`)) * 4 + Number(isCompleteNumberedAddress(item.address)) * 3 + Number(/^https?:\/\//.test(item.website)) * 2 + Number(Boolean(item.city))
  return score(b) - score(a) || a.name.localeCompare(b.name) || a.canonical_uuid.localeCompare(b.canonical_uuid)
}).slice(0, MAX)

await fs.mkdir(CACHE_DIR, { recursive: true }); if (SAVE) await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
const lastDomain = new Map(), records = []; let cacheHits = 0, requests = 0, failures = 0
for (const resource of candidates) {
  let source = classifySource(resource.website, resource.organization || resource.name); const hardExcluded = isSensitiveOrNonFixed({ ...resource, service_type: resource.serviceType })
  let page = { text: "", title: "", retrieved_at: new Date().toISOString(), status: hardExcluded ? "skipped_sensitive_or_non_fixed" : "not_retrieved" }
  if (!hardExcluded && source.domain && /^https?:\/\//.test(resource.website)) {
    const cacheFile = path.join(CACHE_DIR, `${hash(resource.website)}.json`)
    try { page = JSON.parse(await fs.readFile(cacheFile, "utf8")); cacheHits++ } catch {
      const wait = Math.max(0, 800 - (Date.now() - (lastDomain.get(source.domain) || 0))); if (wait) await sleep(wait)
      try {
        const response = await fetch(resource.website, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Miller-Address-Evidence/1.0 (read-only public-page verification)", Accept: "text/html,application/xhtml+xml" } })
        requests++; lastDomain.set(source.domain, Date.now()); const html = response.ok ? await response.text() : ""
        page = { text: stripHtml(html).slice(0, 250000), title: titleOf(html), retrieved_at: new Date().toISOString(), status: response.ok ? "retrieved" : `http_${response.status}`, final_url: response.url }
        await fs.writeFile(cacheFile, JSON.stringify(page))
        if (!response.ok) failures++
      } catch (error) { requests++; failures++; page = { text: "", title: "", retrieved_at: new Date().toISOString(), status: error?.name === "TimeoutError" ? "timeout" : "network_error" } }
      if (requests >= 30 && failures / requests > 0.6) break
    }
  }
  const discovered = extractNumberedAddresses(page.text), existingComplete = isCompleteNumberedAddress(resource.address), proposedAddress = existingComplete ? resource.address : discovered.length === 1 ? discovered[0] : resource.address
  const sourcePath = source.domain ? new URL(resource.website).pathname : ""
  const conflicts = discovered.length > 1 && !existingComplete ? ["multiple_numbered_addresses_on_source_page"] : !existingComplete && discovered.length === 1 && /^\/?$/.test(sourcePath) ? ["parent_or_head_office_address_requires_confirmation"] : []
  const evidenceResource = { ...resource, address: proposedAddress, service_type: resource.serviceType }
  const promotableDirectPage = source.type === "existing_miller" && !/opportunities\.exchangeced\.com|organization-database|directory/i.test(`${source.domain}${new URL(resource.website || "https://invalid.local").pathname}`)
  if (!source.authoritative && promotableDirectPage && pageSupportsProgram({ resource: evidenceResource, pageText: page.text, address: proposedAddress })) source = { ...source, type: "first_party", priority: 1, authoritative: true }
  const decision = classifyAddressEvidence({ resource: evidenceResource, source, page, conflicts })
  const parts = addressParts(proposedAddress)
  records.push({ evidence_version: ADDRESS_EVIDENCE_VERSION, canonical_uuid: resource.canonical_uuid, source_aliases: resource.source_aliases, resource_name: resource.name, specific_program_name: resource.name, submitted_address: normalizeAddress(resource.address), proposed_address: normalizeAddress(proposedAddress), unit_or_suite: parts.unit, street_number_and_name: parts.street, municipality: resource.city, province: "BC", postal_code: parts.postal_code, facility_type: resource.serviceType || resource.category, service_location_classification: hardExcluded ? "sensitive_or_non_fixed" : "proposed_fixed", source_url: resource.website, source_title: page.title, source_owner: source.domain, source_type: source.type, source_priority: source.priority, retrieval_date: page.retrieved_at.slice(0, 10), retrieval_status: page.status, address_evidence_excerpt: page.text ? excerpt(page.text, proposedAddress) : "", authoritative: source.authoritative, second_source: null, conflicts, public_client_facing_rationale: decision.program_relationship_verified ? "The authoritative page names the program or organization and contains the proposed numbered address." : "Not established from the retrieved page.", sensitivity_flags: decision.reasons.filter((item) => item === "sensitive_or_non_fixed"), ...decision, evidence_review_status: "unreviewed", coordinates: null, public_map: false })
}
const counts = Object.fromEntries(["E1", "E2", "E3"].map((tier) => [tier, records.filter((item) => item.tier === tier).length]))
const output = { version: ADDRESS_EVIDENCE_VERSION, mode: SAVE ? "saved_read_only_evidence" : "dry_run", generated_at: new Date().toISOString(), canonical_total: 430, mapped_skipped: mapped.size, examined: records.length, counts, requests, cache_hits: cacheHits, failures, shared_buildings: groupSharedAddresses(records), records }
if (SAVE) await fs.writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ ...output, records: records.map(({ address_evidence_excerpt: _excerpt, ...item }) => item) }, null, 2))
