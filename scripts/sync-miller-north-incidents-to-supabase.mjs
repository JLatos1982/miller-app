import "dotenv/config"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { buildMillerNorthIncidentSyncBatch, syncMillerNorthIncidentBatch } from "../server/millerNorthIncidentStore.js"

if (!process.argv.includes("--apply")) throw new Error("miller_north_sync_requires_apply")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_sync_refuses_unproven_target")
const incidents = JSON.parse(readFileSync("artifacts/miller-north/reconstructed-corpus-v2-incident-proposals.json", "utf8")).incidents || []
const candidates = JSON.parse(readFileSync("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json", "utf8")).candidates || []
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const expectedCount = Number(process.argv.find(argument => argument.startsWith("--expected-count="))?.split("=")[1] || 0) || null
const expectedMultiSourceCount = Number(process.argv.find(argument => argument.startsWith("--expected-multi-source="))?.split("=")[1] || 0) || null
const batch = buildMillerNorthIncidentSyncBatch({ incidents, candidates, expectedCount, expectedMultiSourceCount })
const result = await syncMillerNorthIncidentBatch({ supabase, batch })
console.log(JSON.stringify({ proposal_count: batch.length, multi_source_incidents: batch.filter(item => item.sources.length > 1).length, ...result }, null, 2))
