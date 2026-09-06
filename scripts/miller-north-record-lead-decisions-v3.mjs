import { readFileSync } from "node:fs"
import { saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"

const path = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2-lead-queue.json"
const queue = JSON.parse(readFileSync(path, "utf8"))
// These are manual, evidence-bounded outcomes for the re-ranked new-incident
// lane.  A record is saved after each decision so an interruption cannot lose
// the tranche already reviewed.
const decisions = {
  b21022fb2c0e93ecfa9325e5: ["systemic_context", "Emergency-department anti-racism resource, not a separable patient event."],
  "076125daae0853c5395f9434": ["existing_incident_support", "Reports the existing Kitimat/Terrace pregnancy-care case; retain as corroborating lead, not a new incident."],
  "0fec9583aeccc188f6912c24": ["existing_incident_support", "Supports the existing Penny Kerrigan / Mills Memorial case."],
  "30f2d5bf2c448d77a7a6640f": ["systemic_context", "Human-rights commission material is systemic/educational rather than a separable patient incident."],
  "337198089780345656d60973": ["existing_incident_support", "Video reporting of the existing Kitimat/Terrace pregnancy-care case."],
  "3e3094801274cedc8dbe0978": ["systemic_context", "Peer-reviewed emergency-care research, not an individual incident source."],
  "409d759d07a3c50176c5ef46": ["multi_incident_source", "Source presents several unseparated Northern B.C. accounts and institutional context; bounded material does not support distinct, identified proposals."],
  "548b360b0be8f0716cbe95da": ["systemic_context", "National policy/prevalence material, not a separable in-scope incident."],
  "60870a9a75c87f04c8cc4dd7": ["new_individual_incident", "Rene Whitstone is a distinct reported Lloydminster hospital case; staged privately as indexed-excerpt evidence after bounded targeted follow-up."],
  "6aae63a35cfa697ee78010dc": ["systemic_context", "CMA apology reporting without a separable patient event."],
  "90afed0e9baee1beeb126a2f": ["systemic_context", "In Plain Sight reporting is systemic review context, not one incident."],
  "98cc354053b41feee40fbfcf": ["insufficient_detail", "Named individual account is outside the BC/Alberta/Saskatchewan scope."],
  "6baec92ea94d62b428b224fe": ["systemic_context", "Community-level racism material without a sufficiently separable patient event."],
  "9c3508cdc65bdfa668af6241": ["insufficient_detail", "Out-of-scope incident and insufficient in-scope relevance."],
  a324b52ca1b97b150615d4fa: ["systemic_context", "Alberta research findings, not a separable patient incident."],
  a8eee942e508c66d153b8aea: ["insufficient_detail", "Manitoba lawsuit commentary, outside the three-province research scope."],
  e4d9bb6da42a26939c9fde5d: ["systemic_context", "Navigator and investigation follow-up; no separable patient incident is established."],
  fb9676c5ae983a7d14548cb0: ["systemic_context", "Investigation into alleged racist game; no identified, separable patient event in bounded material."],
  f6147170997b40c82394d3d0: ["existing_incident_support", "Supporting report for the existing Dexter Adams proposal."],
  "4ffce6261c3e1154ffbdd2a2": ["systemic_context", "Recent Island Health service/support reporting, not a documented individual encounter."],
  c636849164c7a386047d2d80: ["systemic_context", "Research study, not an individual incident source."],
  c7de17a310cc89a85d93f6fc: ["systemic_context", "National medical-journal commentary, not an individual incident."],
  ec070dfb3dae539cf6dcb62b: ["systemic_context", "CMA apology commentary without a separable patient event."],
  e79b04e7656f9d8764044879: ["systemic_context", "Paramedic-care research, not an individual incident source."],
  "0108bf04dde2c0591178ae54": ["existing_incident_support", "Video coverage of the existing Marissa Smoke / Cardston case."],
  "15557d128376220821be8c7d": ["existing_incident_support", "Times Colonist material identifies the military member as the existing Connor Sutton case."],
  "69e1c5fd0fb5211977fb7134": ["systemic_context", "Fraser Health institutional statement on systemic allegations, not a distinct patient event."],
  "7105e3f357ee0470bafe022b": ["systemic_context", "Island Health anti-racism strategy response, not an individual incident."],
  "8589346b6202a2a8b18db584": ["new_individual_incident", "Leonard (Lenny) Sylvester is a distinct reported Island Health case; staged privately with independent CBC and CHEK reporting."],
  "85d470838d3f45219d82f310": ["insufficient_detail", "Anonymous Kingston-area accounts are outside scope and not separable in the bounded material."],
  "8b3615c41665ebcc4fa0c414": ["existing_incident_support", "Supporting coverage of the existing Leo Manson / Nanaimo case."],
  "92327d8939fc8461aec1c681": ["systemic_context", "Watchdog index/context page, not a separable patient incident."],
  "9d64ceee7cb2b6c2ecb44721": ["existing_incident_support", "Supporting coverage of the existing Myra Crow Chief human-rights complaint."],
  a7ae50b57e3c6052e719e326: ["systemic_context", "Watchdog index/context page, not a separable patient incident."],
  "3ebb5a6d91b7ec6d145d2e10": ["insufficient_detail", "Catherine Head's reported wait and care concerns are specific, but the source does not support a reported racism/discrimination allegation for incident staging."],
  "9fd4d9f3aa6a97b0cd607980": ["new_individual_incident", "Nathan Cushman is a distinct reported South Health Campus case; staged privately with the contemporaneous AHS review response in the report."],
  "8d461fafa9d54e5253fa2707": ["systemic_context", "Aggregate complaint statistics, not a separable incident."],
}

let applied = 0
for (const lead of queue.leads) {
  const decision = decisions[lead.lead_id]
  if (!decision || lead.status === "reviewed") continue
  lead.status = "reviewed"
  lead.manual_classification = decision[0]
  lead.manual_note = decision[1]
  lead.manual_retrieval = { at: new Date().toISOString(), source_fetch: ["60870a9a75c87f04c8cc4dd7", "8589346b6202a2a8b18db584", "9fd4d9f3aa6a97b0cd607980"].includes(lead.lead_id) ? "bounded_source_and_targeted_followup" : "stored_bounded_source_material", advisory_model_used: false }
  lead.reviewed_at = new Date().toISOString()
  applied += 1
  saveManifest(path, queue)
}
queue.manual_review_summary_v3 = { reviewed_this_pass: applied, total_reviewed: queue.leads.filter(lead => lead.status === "reviewed").length, remaining: queue.leads.filter(lead => lead.status !== "reviewed").length, generated_at: new Date().toISOString() }
saveManifest(path, queue)
console.log(JSON.stringify({ applied, reviewed: queue.manual_review_summary_v3.total_reviewed, remaining: queue.manual_review_summary_v3.remaining, classifications: Object.fromEntries(["new_individual_incident", "existing_incident_support", "probable_duplicate", "multi_incident_source", "systemic_context", "insufficient_detail"].map(kind => [kind, queue.leads.filter(lead => lead.manual_classification === kind).length])) }, null, 2))
