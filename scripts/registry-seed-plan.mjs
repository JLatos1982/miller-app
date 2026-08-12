import { createClient } from "@supabase/supabase-js"
import curatedRows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import decisionsFile from "../data/resource-match-decisions.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { canonicalSeedId, proposedCanonicalIdForSource } from "../server/resourceIdentity.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const sql = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`
const field = (row, key) => String(row[key] || "").trim()
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Read-only Supabase configuration is required to prepare the seed plan")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: tavily = [], error } = await db.from("tavily_resources").select("id,name,website,approved,hidden").eq("approved", true).eq("hidden", false).limit(1000)
if (error) throw new Error(`Could not read approved resources: ${error.message}`)
const curated = normalizedResourceRows(curatedRows).map((row) => { const name = field(row, "name"); const city = field(row, "city"); const organization = field(row, "organization"); return { id: stableCuratedResourceId({ name, city, organization }), name, website: field(row, "website") } })
const registries = new Map()
const aliasMap = new Map()
for (const item of curated) { const id = canonicalSeedId("curated_bundle", item.id); registries.set(id, item.name); aliasMap.set(`curated_bundle:${item.id}`, { id, type: "curated_bundle", native: item.id, url: item.website }) }
for (const item of tavily) { const id = proposedCanonicalIdForSource("tavily_resource", item.id, decisionsFile.decisions); if (!registries.has(id)) registries.set(id, item.name); aliasMap.set(`tavily_resource:${item.id}`, { id, type: "tavily_resource", native: String(item.id), url: item.website }) }
const aliases = [...aliasMap.values()]

const lines = ["begin;", "-- Generated dry-run seed plan. Review before execution."]
for (const [id, name] of registries) lines.push(`insert into public.resource_registry (id, display_name, editorial_status) values (${sql(id)}::uuid, ${sql(name)}, 'pending') on conflict (id) do update set display_name = excluded.display_name, updated_at = now();`)
for (const alias of aliases) lines.push(`insert into public.resource_source_aliases (resource_id, source_type, source_native_id, source_url, provenance) values (${sql(alias.id)}::uuid, ${sql(alias.type)}, ${sql(alias.native)}, ${sql(alias.url || null)}, '{"seed":"phase_1f"}'::jsonb) on conflict (source_type, source_native_id) do nothing;`)
lines.push("-- Fail closed if an existing alias belongs to a different canonical resource.")
for (const alias of aliases) lines.push(`do $$ begin if not exists (select 1 from public.resource_source_aliases where source_type=${sql(alias.type)} and source_native_id=${sql(alias.native)} and resource_id=${sql(alias.id)}::uuid) then raise exception 'Alias ownership conflict: ${alias.type}:${alias.native}'; end if; end $$;`)
for (const decision of decisionsFile.decisions) lines.push(`insert into public.resource_match_candidates (left_source_type,left_source_native_id,right_source_type,right_source_native_id,classification,evidence,decision,decided_at) values (${sql(decision.left_source_type)},${sql(decision.left_source_native_id)},${sql(decision.right_source_type)},${sql(decision.right_source_native_id)},'${decision.decision === "same_resource" ? "high_confidence" : "possible"}','{"scope":"source_identity_only","seed":"phase_1f"}'::jsonb,${sql(decision.decision === "same_resource" ? "same_resource" : "defer")},now()) on conflict (left_source_type,left_source_native_id,right_source_type,right_source_native_id) do nothing;`)
lines.push("commit;")
console.log(lines.join("\n"))
