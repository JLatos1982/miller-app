import fs from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { prepareShelterCandidate } from "../server/shelterDiscovery.js"

const APPLY = process.argv.includes("--apply"), INPUT = new URL("../data/shelter-candidate-pilot.json", import.meta.url)
const source = JSON.parse(await fs.readFile(INPUT, "utf8")), candidates = source.candidates.map(prepareShelterCandidate)
const unique = new Set(candidates.map((item) => item.source_fingerprint)); if (unique.size !== candidates.length) throw new Error("Duplicate pilot fingerprints")
const summary = { mode: APPLY ? "apply" : "dry_run", candidates: candidates.length, public_addresses: candidates.filter((x) => x.location_disclosure_status === "public").length, confidential_or_undisclosed: candidates.filter((x) => x.location_disclosure_status !== "public").length, coordinates: 0, public_pins: 0 }
if (!APPLY) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is required")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { error } = await db.from("resource_discovery_candidates").upsert(candidates.map((item) => ({ ...item, possible_matches: [] })), { onConflict: "source_fingerprint", ignoreDuplicates: true })
if (error) throw new Error(`Shelter candidate import failed: ${error.code || error.message}`)
const { count, error: countError } = await db.from("resource_discovery_candidates").select("id", { count: "exact", head: true })
if (countError) throw countError
console.log(JSON.stringify({ ...summary, table_count_after_import: count }, null, 2))
