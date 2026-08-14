import fs from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { collectCandidateMatches, prepareShelterCandidate } from "../server/shelterDiscovery.js"

const APPLY = process.argv.includes("--apply")
const inputArgument = process.argv.find((item) => item.startsWith("--input="))?.slice("--input=".length)
const INPUT = inputArgument ? new URL(inputArgument, `file://${process.cwd()}/`) : new URL("../data/shelter-candidate-pilot.json", import.meta.url)
const source = JSON.parse(await fs.readFile(INPUT, "utf8")), candidates = source.candidates.map(prepareShelterCandidate)
const unique = new Set(candidates.map((item) => item.source_fingerprint)); if (unique.size !== candidates.length) throw new Error("Duplicate candidate fingerprints; distinct co-located programs need distinct identities before import")
const summary = { mode: APPLY ? "apply" : "dry_run", candidates: candidates.length, public_addresses: candidates.filter((x) => x.location_disclosure_status === "public").length, confidential_or_undisclosed: candidates.filter((x) => x.location_disclosure_status !== "public").length, coordinates: 0, public_pins: 0 }
if (!APPLY) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is required")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [resourceResult, aliasResult, registryResult] = await Promise.all([
  db.from("tavily_resources").select("id,name,organization,website,city,approved,hidden").limit(5000),
  db.from("resource_source_aliases").select("resource_id,source_type,source_native_id,source_url,source_fingerprint"),
  db.from("resource_registry").select("id,display_name"),
])
if (resourceResult.error || aliasResult.error || registryResult.error) throw new Error("Shelter duplicate and alias inventory could not be loaded")
const canonicalBySource = new Map((aliasResult.data || []).filter((item) => item.source_type === "tavily_resource").map((item) => [String(item.source_native_id), item.resource_id]))
const resourcePool = (resourceResult.data || []).map((item) => ({ ...item, canonical_resource_id: canonicalBySource.get(String(item.id)) || null }))
const existingCandidates = await db.from("resource_discovery_candidates").select("id,name,operator,website,phone,community,public_address,source_fingerprint")
if (existingCandidates.error) throw new Error("Existing discovery candidates could not be checked")
resourcePool.push(...(existingCandidates.data || []).map((item) => ({ id: `candidate:${item.id}`, discovery_candidate_id: item.id, name: item.name, organization: item.operator, website: item.website, phone: item.phone, city: item.community, address: item.public_address })))
const rows = candidates.map((item) => {
  const possible_matches = collectCandidateMatches(item, { resources: resourcePool, aliases: aliasResult.data || [], registry: registryResult.data || [] })
  resourcePool.push({ id: `incoming:${item.source_fingerprint}`, discovery_candidate_id: `incoming:${item.source_fingerprint}`, name: item.name, organization: item.operator, website: item.website, phone: item.phone, city: item.community, address: item.public_address })
  return { ...item, possible_matches }
})
const { error } = await db.from("resource_discovery_candidates").upsert(rows, { onConflict: "source_fingerprint", ignoreDuplicates: true })
if (error) throw new Error(`Shelter candidate import failed: ${error.code || error.message}`)
const { count, error: countError } = await db.from("resource_discovery_candidates").select("id", { count: "exact", head: true })
if (countError) throw countError
console.log(JSON.stringify({ ...summary, table_count_after_import: count }, null, 2))
