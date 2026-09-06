import "dotenv/config"
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { buildMillerNorthIncidentSyncBatch, syncMillerNorthIncidentBatch } from "../server/millerNorthIncidentStore.js"

if (!process.argv.includes("--apply")) throw new Error("miller_north_sync_requires_apply")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_sync_refuses_unproven_target")

const sourceUrl = "https://www.ckom.com/2026/01/26/call-for-independent-inquiry-into-first-nations-health-care-in-wake-of-trevor-dubois-death"
const stable = (prefix, value) => `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`
const candidate = {
  candidate_id: "mnc_trevor-dubois-royal-university-hospital-2026",
  stable_proposal_id: stable("mni", sourceUrl),
  province: "saskatchewan",
  municipality: "Saskatoon",
  approximate_location_or_facility: "Royal University Hospital, Saskatoon",
  care_setting: "hospital patient room / protective-services response",
  event_date: "2026-01-09",
  event_year: 2026,
  publication_date: "2026-01-26",
  source_organization: "650 CKOM",
  source_type: "credible_local_journalism",
  source_url: sourceUrl,
  source_title: "Call for independent inquiry into First Nations health care in wake of Trevor Dubois death",
  evidence_status: "reported_with_institutional_response_and_pending_review",
  evidence_excerpt: "650 CKOM reports Trevor Dubois, a First Nations man receiving treatment at Royal University Hospital, died after an altercation with security in his patient room on Jan. 9, 2026. The report says he had previously filed a serious health-care complaint with Saskatchewan's First Nations Health Ombudsperson and records calls by the ombudsperson and FSIN for an independent inquiry. Reporting states SHA classified the death as a Critical Incident and initiated review processes. This private proposal records reported events, family/community concerns, and announced reviews; it is not a finding about cause, care, or individual intent.",
  reported_issue: "Reported death following a hospital-security altercation, with a prior patient complaint and calls for an independent inquiry.",
  duplicate_reconciliation_state: "new_incident_candidate",
  source_fingerprint: createHash("sha256").update(sourceUrl).digest("hex"),
  supporting_sources: [
    { role: "corroborating_journalism", organization: "APTN News", title: "Family left with questions after death of First Nations cancer patient at Saskatoon hospital", url: "https://www.aptnnews.ca/national-news/family-left-with-questions-after-death-of-first-nations-cancer-patient-at-saskatoon-hospital", source_type: "indigenous_journalism", is_independent: true },
    { role: "corroborating_journalism", organization: "Global News", title: "Sask. man who died after clash with hospital security had filed complaint, group says", url: "https://globalnews.ca/news/11638733/sask-man-killed-by-hospital-security-filed-complaint", source_type: "credible_journalism", is_independent: false },
  ],
}
const incident = {
  proposed_incident_id: candidate.stable_proposal_id,
  created_from_candidate_id: candidate.candidate_id,
  corpus_id: "miller-north-reconstructed-corpus-v2",
  province: candidate.province,
  facility_or_location: candidate.approximate_location_or_facility,
  timing: { event_date: candidate.event_date, event_year: candidate.event_year, publication_date: candidate.publication_date },
  summary: candidate.evidence_excerpt,
  evidence_status: candidate.evidence_status,
  incident_fingerprint: createHash("sha256").update("trevor dubois|royal university hospital|saskatoon|2026-01-09").digest("hex"),
  reconciliation_confidence: "strong",
  source_evidence_record_ids: [],
}
const artifact = { schema_version: "miller-north-recent-verified-cases-v1", candidates: [candidate], incidents: [incident], generated_at: new Date().toISOString() }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync("artifacts/miller-north/miller-north-recent-verified-cases-v1.json", `${JSON.stringify(artifact, null, 2)}\n`)
const batch = buildMillerNorthIncidentSyncBatch({ incidents: artifact.incidents, candidates: artifact.candidates, expectedCount: 1 })
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const result = await syncMillerNorthIncidentBatch({ supabase, batch })
console.log(JSON.stringify({ staged_incident: candidate.stable_proposal_id, ...result }, null, 2))
