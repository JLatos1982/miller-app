import { createClient } from "@supabase/supabase-js"
import { requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"
import { processPublicationFeedItem, rankPublicationFeedCandidates } from "../server/publicationFeed.js"

const apply = process.argv.includes("--apply"), limit = Math.max(1, Math.min(10, Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 10)))
if (!process.env.SUPABASE_URL?.includes("wccagykzugrahwugefqt") || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Unexpected production target or missing server credentials")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const query = async (builder) => { const result = await builder; if (result.error) throw result.error; return result.data || [] }
const [resources, claims, evidence, qc, locations] = await Promise.all([query(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("lifecycle_state", "active")), query(db.from("resource_fact_claims").select("*").eq("decision_category", "location_occupancy")), query(db.from("resource_fact_evidence").select("*")), query(db.from("location_qc_reviews").select("*")), query(db.from("resource_locations").select("*"))])
const evidenceByClaim = new Map(); for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
const contexts = resources.map((resource) => { const linkedClaims = claims.filter((item) => item.resource_id === resource.id); return { resource, claims: linkedClaims, evidence: linkedClaims.flatMap((item) => evidenceByClaim.get(item.id) || []), qc: qc.find((item) => item.canonical_resource_id === resource.id) || null, locations: locations.filter((item) => item.resource_id === resource.id), community: "" } })
const selected = rankPublicationFeedCandidates(contexts, limit)
if (!apply) { console.log(JSON.stringify({ mode: "dry_run", selected: selected.map(({ context, assessment }, index) => ({ rank: index + 1, id: context.resource.id, name: context.resource.display_name, distance: assessment.distance, blockers: assessment.reasons })) }, null, 2)); process.exit(0) }
const users = await db.auth.admin.listUsers({ perPage: 1000 }), actor = users.data.users.find((item) => item.email); if (!actor) throw new Error("No administrator audit actor is available")
const run = await db.from("publication_feed_runs").insert({ requested_limit: limit }).select().single(); if (run.error) throw run.error
const rows = selected.map(({ context }, index) => ({ run_id: run.data.id, resource_id: context.resource.id, selection_rank: index + 1, stage: "selected" })); const inserted = await db.from("publication_feed_run_items").insert(rows); if (inserted.error) throw inserted.error
const results = []
for (const { context } of selected) results.push({ id: context.resource.id, name: context.resource.display_name, result: await processPublicationFeedItem({ runId: run.data.id, context, db, geocode: requestBcAddressGeocode, actorId: actor.id }) })
await db.from("publication_feed_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.data.id)
console.log(JSON.stringify({ mode: "production_private_publication_feed", run_id: run.data.id, processed: results.length, results, human_qc_created: 0, locations_created: 0, pins_published: 0 }, null, 2))
