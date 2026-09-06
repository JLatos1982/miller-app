import { readFileSync } from "node:fs"
import { saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"

const path = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2-lead-queue.json"
const queue = JSON.parse(readFileSync(path, "utf8"))
const decisions = {
  "863b04a7c193b3979c5f46d1": ["existing_incident_support", "Pearl Gambler supporting reporting; attached previously as context, with Global News now independently corroborating."],
  "91a1832472df42c992b2392b": ["existing_incident_support", "FSIN release supports the existing Thomas Favel proposal."],
  "1193f907922e81686c320360": ["individual_incident", "Janette Sanderson at Victoria Hospital is a distinct reported incident; staged and synced privately."],
  "2050cdae8151d9360e3c5a02": ["existing_incident_support", "Re-reporting of the existing Brydon Lafavour Prince Albert hospital case."],
  "23d994ea59dde3fac038a5af": ["multi_incident_source", "National Observer investigation contains several accounts; Pearl is reconciled, while other out-of-scope or insufficiently recoverable accounts remain unstaged."],
  "3a07a24bed0826021af3056a": ["existing_incident_support", "Pearl Gambler supporting reporting."],
  "42194de9a0487c05c0a23276": ["existing_incident_support", "Existing Brydon Lafavour reporting."],
  "4525868a1704530341887870": ["existing_incident_support", "Supporting reporting of the existing Leo Manson proposal."],
  "46d00dffefc1703c95ccd69e": ["existing_incident_support", "Pearl Gambler supporting reporting."],
  "471b1380e0992d2cdcf475b1": ["existing_incident_support", "Existing Brydon Lafavour reporting."],
  "5a4df2b49c1c6ac28d163cef": ["existing_incident_support", "Existing Brydon Lafavour reporting."],
  "9aaec74e33d228454a5452b9": ["existing_incident_support", "Pearl Gambler supporting reporting."],
  "b11ded265cf4871ece9f95d2": ["existing_incident_support", "Existing Brydon Lafavour reporting."],
  "c469d5be6a69af73ffb47a3d": ["systemic_context", "Commentary/investigation context without a newly separable in-scope incident in the bounded material."],
  "e67bf72b1c800e7b374d661b": ["existing_incident_support", "Existing Brydon Lafavour reporting."],
  "ff82550e45dba1814145d6d1": ["existing_incident_support", "Existing Brydon Lafavour re-publication."],
  "137873fda50ba24cd9e39b89": ["systemic_context", "In Plain Sight review; systemic/public-inquiry context, not one incident."],
  "1f5ee702c150add3434e1804": ["insufficient_detail", "Headline indicates an apology but bounded material does not establish a separable patient incident."],
  "88324ee1e0500ac40a6ca0c0": ["systemic_context", "Study/prevalence material, not an individual incident."],
  "8dbefcc1115274655ef59422": ["existing_incident_support", "Pearl Gambler supporting reporting."],
  "9bbfda582c697eaaf70d468d": ["insufficient_detail", "Individual administrative letter but no supported patient-care incident in bounded material."],
  "ab77511ca4a205b34cc63c75": ["existing_incident_support", "Existing Myra Crow Chief complaint reporting."],
  "b211873dafef5f5570144cdb": ["systemic_context", "Emergency-care research, not an individual incident."],
  "b8609e34549f340023d87ebc": ["systemic_context", "Systemic review/report, not an individual incident."],
  "f911eeb8e356fc02da35118e": ["systemic_context", "Study reporting, not an individual incident."],
  "44cfc19245dda927ac80c92f": ["systemic_context", "Professional-apology context, not an individual incident."],
  "4aff9928d1fc1f21e7770e16": ["systemic_context", "Institutional response to systemic reporting; no separable incident established."],
  "67ae7eb90bc8f2efd513925f": ["existing_incident_support", "Existing Kitimat/Terrace pregnancy-care proposal reporting."],
  "6b416850fdf2d450237ad3ad": ["existing_incident_support", "Existing Dexter Adams reporting."],
  "e1bb31098467183ac68e3f9e": ["existing_incident_support", "Existing Leo Manson reporting."],
}
let applied = 0
for (const lead of queue.leads) {
  const decision = decisions[lead.lead_id]
  if (!decision) continue
  lead.status = "reviewed"
  lead.manual_classification = decision[0]
  lead.manual_note = decision[1]
  lead.reviewed_at = new Date().toISOString()
  applied += 1
}
for (const source of queue.possible_multi_incident_sources || []) if (source.url.includes("SMA-CPSS-Racism-in-Medicine-Physician-Survey-Findings")) {
  source.manual_classification = "systemic_context"
  source.manual_note = "Physician survey aggregates reported experiences; it does not document separable patient incidents."
  source.reviewed_at = new Date().toISOString()
}
queue.manual_review_summary = { reviewed_this_pass: applied, possible_multi_incident_sources_reviewed: 1, generated_at: new Date().toISOString() }
saveManifest(path, queue)
console.log(JSON.stringify({ applied, reviewed: queue.leads.filter(lead => lead.status === "reviewed").length, pending: queue.leads.filter(lead => lead.status === "pending").length }, null, 2))
