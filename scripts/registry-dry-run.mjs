import { createClient } from "@supabase/supabase-js"
import curatedRows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { canonicalSeedId, proposeMatches, proposedCanonicalIdForSource } from "../server/resourceIdentity.js"
import decisionsFile from "../data/resource-match-decisions.json" with { type: "json" }
import { normalizedResourceRows } from "../src/resourceData.js"

const field = (row, key) => String(row[key] || "").trim()
const curated = normalizedResourceRows(curatedRows).map((row) => {
  const resource = { name: field(row, "name"), organization: field(row, "organization"), website: field(row, "website"), phone: field(row, "phone"), address: field(row, "address"), city: field(row, "city"), service_type: field(row, "serviceType") }
  return { ...resource, id: stableCuratedResourceId(resource), source_type: "curated_bundle" }
})

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Read-only Supabase configuration is required for this report")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: tavily = [], error } = await db.from("tavily_resources").select("id,name,organization,website,city,category,service_type,approved,hidden").eq("approved", true).eq("hidden", false).limit(1000)
if (error) throw new Error(`Could not read approved resources: ${error.message}`)

const matches = proposeMatches(curated, tavily)
const decisionKey = (leftType, leftId, rightType, rightId) => `${leftType}:${leftId}|${rightType}:${rightId}`
const decisions = new Map(decisionsFile.decisions.map((item) => [decisionKey(item.left_source_type, item.left_source_native_id, item.right_source_type, item.right_source_native_id), item]))
const confirmedTavilyToCurated = new Map(decisionsFile.decisions.filter((item) => item.decision === "same_resource").map((item) => [String(item.right_source_native_id), String(item.left_source_native_id)]))
const registry = new Map()
const aliasMap = new Map()
for (const item of curated) {
  const id = canonicalSeedId("curated_bundle", item.id)
  registry.set(id, { id, display_name: item.name, editorial_status: "pending" })
  aliasMap.set(`curated_bundle:${item.id}`, { resource_id: id, source_type: "curated_bundle", source_native_id: item.id, source_url: item.website || null })
}
for (const item of tavily) {
  const confirmedCuratedAlias = confirmedTavilyToCurated.get(String(item.id))
  const id = proposedCanonicalIdForSource("tavily_resource", item.id, decisionsFile.decisions)
  if (!registry.has(id)) registry.set(id, { id, display_name: item.name, editorial_status: "pending" })
  aliasMap.set(`tavily_resource:${item.id}`, { resource_id: id, source_type: "tavily_resource", source_native_id: String(item.id), source_url: item.website || null })
}
const canonicalRecords = [...registry.values()]
const aliases = [...aliasMap.values()]
const reviewedMatches = matches.map((item) => ({ ...item, decision: decisions.get(decisionKey(item.left_source_type, item.left_source_native_id, item.right_source_type, item.right_source_native_id))?.decision || "pending", decision_scope: decisions.get(decisionKey(item.left_source_type, item.left_source_native_id, item.right_source_type, item.right_source_native_id))?.scope || null }))
const classifications = Object.fromEntries(["high_confidence", "possible", "likely_distinct", "insufficient"].map((name) => [name, matches.filter((item) => item.classification === name).length]))
const report = { mode: "dry_run_no_writes", generated_at: new Date().toISOString(), summary: { bundled_rows: curated.length, unique_curated_aliases: new Set(curated.map((item) => item.id)).size, repeated_bundled_alias_rows: curated.length - new Set(curated.map((item) => item.id)).size, approved_tavily: tavily.length, proposed_canonical_records: canonicalRecords.length, proposed_aliases: aliases.length, confirmed_source_pairs: confirmedTavilyToCurated.size, deferred_source_pairs: decisionsFile.decisions.filter((item) => item.decision === "defer").length, ...classifications }, matches: reviewedMatches, proposed_registry: canonicalRecords, proposed_aliases: aliases, decisions: decisionsFile.decisions, decisions_template: reviewedMatches.filter((item) => ["high_confidence", "possible"].includes(item.classification)).map((item) => ({ ...item, allowed_decisions: ["same_resource", "keep_separate", "defer"] })) }
console.log(JSON.stringify(process.argv.includes("--summary") ? { summary: report.summary, review_candidates: report.decisions_template } : report, null, 2))
