import fs from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { publishPracticalPublicLocations, semanticResourceIdentityOverlap } from "../server/practicalPublicLocationPublication.js"

const mode = process.argv.includes("--publish") ? "publish" : "preflight"
const project = "wccagykzugrahwugefqt"
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== project || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("production_configuration_required")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const actor = (await db.auth.admin.listUsers({ perPage: 1 })).data?.users?.[0]?.id
if (!actor) throw new Error("trusted_actor_unavailable")
const targets = [
  { resourceId: "5a38b5c7-bd0e-5b9e-8e8c-acf612b93d85", name: "The CORE (VCH)", source: { url: "https://bc.211.ca/result/the-core-community-outpatient-recovery-experience-63201516", locality: "Vancouver", title: "The CORE - BC 211" } },
  { resourceId: "c7458796-9b74-59d3-be05-5e00ed112065", name: "Tri-Cities Opioid Agonist Treatment (OAT) Clinic - Result - 211 British Columbia", source: { url: "https://bc.211.ca/result/tri-cities-opioid-agonist-treatment-oat-clinic-59980630", locality: "Port Coquitlam", title: "Tri-Cities OAT Clinic - BC 211" } },
  { resourceId: "6aea60bf-ec24-5ddc-a997-621c58becf47", name: "Vancouver Addictions Matrix Program - HelpStartsHere", source: { url: "https://bc.211.ca/result/vamp-vancouver-addictions-matrix-program-9508833", locality: "Vancouver", title: "VAMP - BC 211" } },
]
const results = []
for (const target of targets) {
  const base = target.source.url.replace(/\/$/, "")
  const { data: locations, error } = await db.from("resource_locations").select("id,resource_id,street_address,public_map,review_status").in("public_location_source_url", [base, `${base}/`]).eq("public_map", true).neq("resource_id", target.resourceId)
  if (error) throw error
  let duplicate = null
  if (locations?.length) {
    const { data: resources, error: resourceError } = await db.from("resource_registry").select("id,display_name").in("id", [...new Set(locations.map((location) => location.resource_id))])
    if (resourceError) throw resourceError
    duplicate = (resources || []).map((resource) => ({ ...resource, overlap: semanticResourceIdentityOverlap(target.name, resource.display_name) })).sort((left, right) => right.overlap - left.overlap)[0]
    if (duplicate?.overlap < 0.6) duplicate = null
  }
  if (duplicate) { results.push({ ...target, outcome: "probable_existing_match", existing_resource: duplicate, publication_attempted: false }); continue }
  const guardedDb = mode === "publish" ? db : new Proxy(db, { get(value, property) { if (property !== "rpc") return Reflect.get(value, property, value); return async (name, args) => name === "publish_practical_public_location_v1" ? { data: { status: "preflight_only_publish_suppressed" }, error: null } : value.rpc(name, args) } })
  const output = await publishPracticalPublicLocations({ db: guardedDb, resourceId: target.resourceId, source: target.source, actorId: actor })
  results.push({ ...target, outcome: output.outcome, publication_attempted: mode === "publish" && output.publication_attempted, candidates: output.candidates?.map((candidate) => ({ address: candidate.address, disposition: candidate.program_site_disposition, linkage_reason: candidate.linkage_reason })), publications: output.publications?.map((publication) => ({ outcome: publication.outcome, preflight: publication.preflight, publication: publication.publication, geocoder: publication.package?.geocoder, canonical_address: publication.package?.canonical_address })) })
}
const diagnosticPath = new URL("../data/miller-practical-linkage-diagnostic-v1.json", import.meta.url)
const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, "utf8"))
diagnostic.production_validation = { mode, completed_at: new Date().toISOString(), results }
await fs.writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ mode, results }, null, 2))
