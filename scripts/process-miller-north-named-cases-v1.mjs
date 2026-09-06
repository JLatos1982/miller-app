import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { acquireManifestLock, loadManifest, releaseManifestLock, saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"
import { extractMillerNorthNamedCases } from "../server/millerNorthNamedCaseExtraction.js"

const path = "artifacts/miller-north/miller-north-autonomous-research-controller-v1.json"
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_named_case_refuses_unproven_target")
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: incidents, error } = await supabase.from("miller_north_incidents").select("id,working_title,facility,province,event_date,event_year,approximate_event_year")
if (error) throw error
const lock = acquireManifestLock(path)
try {
  const manifest = loadManifest(path)
  manifest.named_case_extraction ||= { version: "miller-north-named-case-extraction-v1", local_light: { attempted: true, available: false, reason: "local_ollama_endpoint_unreachable", calls: 0 }, results: {} }
  const reprocess = process.argv.includes("--reprocess")
  const held = Object.entries(manifest.sources || {}).filter(([, source]) => source.needs_evidence_review && (reprocess || !source.named_case_terminal))
  let processed = 0
  for (const [sourceUrl, source] of held) {
    const work = manifest.work_items?.[source.work_ids?.[0]] || {}
    const rows = extractMillerNorthNamedCases({ title: source.tavily_title, excerpt: source.bounded_excerpt || source.tavily_excerpt, sourceUrl, sourceOrganization: new URL(sourceUrl).hostname.replace(/^www\./, ""), province: work.province || null, existingIncidents: incidents || [] })
    const ranked = [...rows].sort((a, b) => b.expected_value_score - a.expected_value_score)
    const primary = ranked[0]
    const targetable = ranked.filter((item) => item.classification === "named_case_strong" && !item.likely_existing_incident_id && item.expected_value_score >= 18)
    manifest.named_case_extraction.results[sourceUrl] = { processed_at: new Date().toISOString(), local_light_used: false, candidates: ranked, followup_candidates: targetable }
    manifest.sources[sourceUrl] = { ...source, named_case_terminal: true, named_case_classification: primary.classification, named_case_followup_eligible: targetable.length > 0 }
    processed += 1
    saveManifest(path, manifest)
  }
  const results = Object.values(manifest.named_case_extraction.results)
  const rows = results.flatMap((result) => result.candidates || [])
  const count = (kind) => rows.filter((item) => item.classification === kind).length
  manifest.named_case_extraction.summary = { processed_sources: results.length, candidate_rows: rows.length, named_case_strong: count("named_case_strong"), named_case_partial: count("named_case_partial"), existing_case_likely: count("existing_case_likely"), context_name_only: count("context_name_only"), organization_or_official_name: count("organization_or_official_name"), insufficient: count("insufficient"), followup_eligible: rows.filter((item) => item.classification === "named_case_strong" && !item.likely_existing_incident_id && item.expected_value_score >= 18).length, completed_at: new Date().toISOString() }
  saveManifest(path, manifest)
  console.log(JSON.stringify({ processed_this_run: processed, ...manifest.named_case_extraction.summary }, null, 2))
} finally { releaseManifestLock(lock) }
