import { createClient } from "@supabase/supabase-js"
import curatedRows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import decisionsFile from "../data/resource-match-decisions.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { canonicalSeedId, proposedCanonicalIdForSource } from "../server/resourceIdentity.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const EXPECTED_PROJECT = "wccagykzugrahwugefqt"
const EXPECTED = { curatedRows: 333, curatedAliases: 327, tavilyAliases: 105, canonical: 430, aliases: 432 }
const apply = process.argv.includes("--apply")
const url = process.env.SUPABASE_URL || ""
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
if (new URL(url).hostname.split(".")[0] !== EXPECTED_PROJECT) throw new Error("Refusing to seed an unexpected Supabase project")
const db = createClient(new URL(url).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: tavily = [], error: tavilyError } = await db.from("tavily_resources").select("id,name,website").eq("approved", true).eq("hidden", false).limit(1000)
if (tavilyError) throw tavilyError

const curated = normalizedResourceRows(curatedRows).map((row) => ({ id: stableCuratedResourceId(row), name: row.name, website: row.website }))
const registries = new Map(), aliases = new Map()
for (const item of curated) {
  const id = canonicalSeedId("curated_bundle", item.id)
  if (!registries.has(id)) registries.set(id, { id, display_name: item.name, editorial_status: "pending" })
  aliases.set(`curated_bundle:${item.id}`, { resource_id: id, source_type: "curated_bundle", source_native_id: item.id, source_url: item.website || null, provenance: { seed: "phase_1f" } })
}
for (const item of tavily) {
  const id = proposedCanonicalIdForSource("tavily_resource", item.id, decisionsFile.decisions)
  if (!registries.has(id)) registries.set(id, { id, display_name: item.name, editorial_status: "pending" })
  aliases.set(`tavily_resource:${item.id}`, { resource_id: id, source_type: "tavily_resource", source_native_id: String(item.id), source_url: item.website || null, provenance: { seed: "phase_1f" } })
}
const plan = { curatedRows: curated.length, curatedAliases: new Set(curated.map((x) => x.id)).size, tavilyAliases: tavily.length, canonical: registries.size, aliases: aliases.size }
for (const [key, expected] of Object.entries(EXPECTED)) if (plan[key] !== expected) throw new Error(`Count mismatch for ${key}: expected ${expected}, found ${plan[key]}`)
const aliasRows = [...aliases.values()], registryRows = [...registries.values()]
const { data: existingAliases, error: aliasReadError } = await db.from("resource_source_aliases").select("resource_id,source_type,source_native_id")
if (aliasReadError) throw aliasReadError
for (const old of existingAliases || []) {
  const wanted = aliases.get(`${old.source_type}:${old.source_native_id}`)
  if (wanted && wanted.resource_id !== old.resource_id) throw new Error(`Alias ownership conflict: ${old.source_type}:${old.source_native_id}`)
}
console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", project: EXPECTED_PROJECT, expected: EXPECTED, plan }, null, 2))
if (!apply) process.exit(0)

const chunks = (rows, size = 100) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size))
for (const batch of chunks(registryRows)) { const { error } = await db.from("resource_registry").upsert(batch, { onConflict: "id" }); if (error) throw error }
for (const batch of chunks(aliasRows)) { const { error } = await db.from("resource_source_aliases").upsert(batch, { onConflict: "source_type,source_native_id" }); if (error) throw error }
for (const decision of decisionsFile.decisions) {
  const row = { left_source_type: decision.left_source_type, left_source_native_id: decision.left_source_native_id, right_source_type: decision.right_source_type, right_source_native_id: String(decision.right_source_native_id), classification: decision.decision === "same_resource" ? "high_confidence" : "possible", evidence: { scope: "source_identity_only", seed: "phase_1f" }, decision: decision.decision, decided_at: new Date().toISOString() }
  const { error } = await db.from("resource_match_candidates").upsert(row, { onConflict: "left_source_type,left_source_native_id,right_source_type,right_source_native_id" }); if (error) throw error
}
const [registryCount, aliasCount, locationCount] = await Promise.all([
  db.from("resource_registry").select("id", { count: "exact", head: true }),
  db.from("resource_source_aliases").select("resource_id", { count: "exact", head: true }),
  db.from("resource_locations").select("id", { count: "exact", head: true }),
])
if (registryCount.error || aliasCount.error || locationCount.error) throw registryCount.error || aliasCount.error || locationCount.error
if (registryCount.count !== EXPECTED.canonical || aliasCount.count !== EXPECTED.aliases) throw new Error(`Post-seed count mismatch: ${registryCount.count}/${aliasCount.count}`)
console.log(JSON.stringify({ written: { canonical: registryCount.count, aliases: aliasCount.count, locations: locationCount.count }, status: "verified" }, null, 2))
