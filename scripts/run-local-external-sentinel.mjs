import { createClient } from "@supabase/supabase-js"
import { runLocalExternalSentinel } from "../server/externalSentinel.js"
const url = process.env.MILLER_EXTERNAL_SENTINEL_URL || ""
const observerKey = process.env.MILLER_EXTERNAL_SENTINEL_OBSERVER_KEY || ""
const accessToken = process.env.MILLER_EXTERNAL_SENTINEL_ACCESS_TOKEN || ""
if (!accessToken) throw new Error("external_sentinel_access_token_required")
const supabase = createClient(process.env.SUPABASE_URL || "", accessToken, { auth: { persistSession: false } })
const request = async ({ method, path, headers = {} }) => { const started = Date.now(), response = await fetch(`${url}${path}`, { method, headers, redirect: "manual", signal: AbortSignal.timeout(2500) }); return { status: response.status, headers: Object.fromEntries(response.headers.entries()), elapsed_ms: Date.now() - started } }
const result = await runLocalExternalSentinel({ url, observerKey, request, submit: async (observation) => { const saved = await supabase.rpc("record_external_security_observation", { p_observer_key: observation.observer_key, p_observation_key: observation.observation_key, p_observation_type: observation.observation_type, p_observed_at: observation.observed_at, p_status: observation.status, p_evidence_summary: observation.evidence_summary }); if (saved.error) throw saved.error } })
console.log(JSON.stringify({ target: result.target, observer_key: result.observer_key, observations: result.observations.map(({ observation_type, status }) => ({ observation_type, status })) }))
