import fs from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { curatedMapResources } from "../server/mapResources.js"
import { buildDirectoryCoverageReport } from "../server/directoryAddressCoverage.js"

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is absent")
if (new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== "wccagykzugrahwugefqt") throw new Error("Refusing to inspect an unexpected Supabase project")
if (process.argv.some((item) => /apply|write-shadow|publish/i.test(item))) throw new Error("This coverage command is read-only")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const query = async (builder) => { const result = await builder; if (result.error) throw result.error; return result.data || [] }
const [registry, aliases, tavilyResources, locations, claims, evidence, qcReviews] = await Promise.all([
  query(db.from("resource_registry").select("*").eq("lifecycle_state", "active")),
  query(db.from("resource_source_aliases").select("*")),
  query(db.from("tavily_resources").select("*")),
  query(db.from("resource_locations").select("*")),
  query(db.from("resource_fact_claims").select("*")),
  query(db.from("resource_fact_evidence").select("*")),
  query(db.from("location_qc_reviews").select("*")),
])
const inventory = JSON.parse(await fs.readFile(new URL("../data/address-evidence-inventory.json", import.meta.url), "utf8"))
const geocoded = JSON.parse(await fs.readFile(new URL("../data/location-automation-v1.2.1-review.json", import.meta.url), "utf8"))
const report = buildDirectoryCoverageReport({ registry, aliases, tavilyResources, curatedResources: curatedMapResources, locations, claims, evidence, qcReviews, inventory, geocoded })
const output = new URL("../data/directory-address-coverage-current.json", import.meta.url), temporary = new URL(`${output.pathname}.tmp`, output)
await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); await fs.rename(temporary, output)
console.log(JSON.stringify({ version: report.version, total_active: report.total_active, reconciliation: report.reconciliation, counts: report.counts, meaningfully_evaluated: report.meaningfully_evaluated, coverage_percentage: report.coverage_percentage, realistically_mappable_if_approved: report.realistically_mappable_if_approved, ranked_queue_count: report.ranked_queue.length, seven_candidate_reevaluation_count: report.seven_candidate_reevaluation.length, shadow_writes: report.shadow_writes, public_location_changes: report.public_location_changes }, null, 2))
