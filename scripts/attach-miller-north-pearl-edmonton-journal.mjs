import "dotenv/config"
import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_refuses_unproven_target")
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: incidents, error: incidentError } = await supabase.from("miller_north_incidents").select("id,event_date,evidence_status").eq("facility", "Misericordia Hospital, Edmonton")
if (incidentError || incidents?.length !== 1) throw incidentError || new Error("miller_north_expected_one_misericordia_incident")
const sourceUrl = "https://edmontonjournal.com/news/local-news/indigenous-woman-suing-covenant-health-after-horrific-treatment-at-misericordia-hospital"
const relevantEvidence = "Pearl Gambler detailed the birth and death of her daughter at Misericordia Community Hospital; the report says her lawyer alleged discrimination because Gambler is Indigenous and that a lawsuit was filed against Covenant Health. The source states June 12, 2020, which conflicts by one day with the existing stored event date and is retained only as source evidence."
const { data, error } = await supabase.from("miller_north_incident_sources").upsert({
  incident_id: incidents[0].id,
  source_organization: "Edmonton Journal",
  source_title: "Indigenous woman suing Covenant Health after 'horrific' treatment at Misericordia Hospital",
  source_url: sourceUrl,
  source_type: "reputable journalism",
  publication_date: null,
  source_role: "corroborating_report",
  relevant_evidence: relevantEvidence,
  evidence_confidence: "supporting_source",
  retrieval_fingerprint: createHash("sha256").update(sourceUrl + "\u001f" + relevantEvidence).digest("hex"),
  retrieval_state: "current",
  is_independent: true,
  provenance: { campaign: "miller-north-autonomous-pilot-3", normalization_version: "miller-north-source-text-normalization-v1", timing_note: "Source states June 12, 2020; existing incident date remains unchanged." },
}, { onConflict: "incident_id,source_url" }).select("id,incident_id,source_url")
if (error || data?.length !== 1) throw error || new Error("miller_north_pearl_source_attach_incomplete")
console.log(JSON.stringify({ attached: true, incident_event_date_unchanged: incidents[0].event_date, evidence_status_unchanged: incidents[0].evidence_status, source_id: data[0].id }, null, 2))
