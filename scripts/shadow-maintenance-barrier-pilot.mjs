import { createClient } from "@supabase/supabase-js"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { classifySource } from "../server/addressEvidence.js"
import { extractBarrierEvidence } from "../server/intelligence/research.js"
import { createShadowPersistence } from "../server/intelligence/shadowPersistence.js"

const requested = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 10), limit = Math.max(1, Math.min(20, requested))
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is unavailable")
if (new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== "wccagykzugrahwugefqt") throw new Error("Unexpected Supabase project")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }), persistence = createShadowPersistence({ supabase: db })
await persistence.assertObserveOnly()
const aliases = await db.from("resource_source_aliases").select("resource_id,source_native_id").eq("source_type", "tavily_resource").limit(2000)
if (aliases.error) throw aliases.error
const numeric = aliases.data.filter((item) => /^\d+$/.test(item.source_native_id)), tavily = await db.from("tavily_resources").select("id,name,website").in("id", numeric.map((item) => Number(item.source_native_id))).eq("approved", true).eq("hidden", false).not("website", "is", null).limit(2000)
if (tavily.error) throw tavily.error
const canonical = new Map(numeric.map((item) => [String(item.source_native_id), item.resource_id])), candidates = tavily.data.filter((item) => canonical.has(String(item.id)) && /^https:\/\//i.test(item.website)).slice(0, limit), results = []
for (const item of candidates) {
  const resourceId = canonical.get(String(item.id)), source = classifySource(item.website, item.name), retrievedAt = new Date().toISOString()
  let document = null
  try { document = await fetchSafeResearchDocument(item.website) } catch { /* bounded failure */ }
  const text = document?.ok ? document.text || "" : "", authority = { first_party: 95, health_authority: 95, government: 90, municipal: 85, established_directory: 60 }[source.type] || 40, evidenceBase = { sourceType: source.type === "first_party" ? "official_provider" : source.type, url: document?.url || item.website, retrievedAt, sourceAuthority: authority, independentKey: source.domain }
  const websiteCurrent = Boolean(document?.ok && text)
  await persistence.persistObservation({ resourceId, field: "website", category: "website", currentValue: item.website, proposedValue: websiteCurrent ? item.website : null, risk: "low", recommendation: websiteCurrent ? "auto_accept" : "human_review", confidence: websiteCurrent ? "high" : "unknown", reasonCodes: [websiteCurrent ? "official_website_available" : "official_source_unavailable"], engineVersion: "miller-maintenance-pilot-v1", summary: websiteCurrent ? "Miller opened the stored website successfully and recorded a current shadow observation." : "The stored website could not be safely opened during the bounded check.", evidence: websiteCurrent ? [{ ...evidenceBase, value: item.website, extractionMethod: "safe_https_document_fetch" }] : [] })
  const barriers = websiteCurrent ? extractBarrierEvidence({ url: document.url, text }, evidenceBase.sourceType, retrievedAt) : []
  for (const barrier of barriers) await persistence.persistObservation({ resourceId, field: barrier.field, category: "barrier_fact", currentValue: null, proposedValue: barrier.value, risk: "medium", recommendation: "accept_with_monitoring", confidence: "bounded", reasonCodes: ["explicit_authoritative_barrier_phrase"], engineVersion: "miller-barrier-pilot-v1", summary: `Miller found an explicit published ${barrier.field.replaceAll("_", " ")} statement.`, evidence: [{ ...barrier, sourceAuthority: authority, independentKey: source.domain }] })
  results.push({ resourceId, name: item.name, websiteCurrent, barrierFacts: barriers.map((barrier) => barrier.field) })
}
console.log(JSON.stringify({ mode: "production_durable_shadow_pilots", examined: results.length, websitesConfirmed: results.filter((item) => item.websiteCurrent).length, sourceUnavailable: results.filter((item) => !item.websiteCurrent).length, barrierFactsPersisted: results.reduce((sum, item) => sum + item.barrierFacts.length, 0), unsupportedTrustedFields: ["phone", "address", "hours"], unsupportedReason: "The canonical Tavily source rows used by this pilot do not contain these fields; Miller did not infer them.", trustedDataWrites: 0, publicationWrites: 0, results }, null, 2))
