import "dotenv/config"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { buildMillerNorthSocialLeadBatch, syncMillerNorthSocialLeadBatch } from "../server/millerNorthSocialLeadStore.js"

if (!process.argv.includes("--apply")) throw new Error("miller_north_social_lead_sync_requires_apply")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_social_lead_sync_refuses_unproven_target")
const leads = JSON.parse(readFileSync("artifacts/miller-north/miller-north-social-leads-v1.json", "utf8")).leads || []
const batch = buildMillerNorthSocialLeadBatch({ leads })
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
console.log(JSON.stringify(await syncMillerNorthSocialLeadBatch({ supabase, batch }), null, 2))
