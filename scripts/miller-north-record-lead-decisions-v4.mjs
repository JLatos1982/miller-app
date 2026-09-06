import { readFileSync } from "node:fs"
import { saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"

const path = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2-lead-queue.json"
const queue = JSON.parse(readFileSync(path, "utf8"))

// Final manual conversion tranche. These decisions use the already persisted,
// bounded source material; they do not rerun Tavily or promote systemic reports
// to incidents. Saving each row makes this final tranche interruption-safe.
const decisions = {
  bd4372c2d68acf81b1c5d1d1: ["systemic_context", "Saskatchewan Health Authority engagement page, not an incident account."],
  c08569d4a02aecc178a664ad: ["systemic_context", "CBC player summarizes systemic emergency-care reporting without a separable patient event in the bounded material."],
  cc6c95795ef58d9cbae7cd0e: ["systemic_context", "Video duplicate of systemic emergency-care reporting, not a distinct incident source."],
  e49456e976b39d0d71472c69: ["insufficient_detail", "Patient-rights resource is not an incident account."],
  "6ad43e586a990d91385e26f3": ["systemic_context", "Research reporting on emergency-department departure patterns, not an identified individual event."],
  "9f83999959312d6768e431a4": ["systemic_context", "Professional college reconciliation page, not an incident source."],
  "062abf3214be48f32fd60e72": ["existing_incident_support", "Reports the existing Kitimat/Terrace pregnancy-care case; not a new incident."],
  b4efb61c3e7f1befbbae8406: ["systemic_context", "Aggregate B.C. emergency-care statistics, not a separable incident."],
  "8f12e8e37531715fffc0213e": ["systemic_context", "Scholarly systemic-care discussion, not an individual incident source."],
  eb9b0571f60e2b150b38f5df: ["systemic_context", "Health-authority statement about In Plain Sight, not a distinct patient event."],
  c7e60323e769a0c305790fe0: ["systemic_context", "Alberta policy page, not an individual incident."],
  ee001ec748fab183d3454768: ["systemic_context", "Qualitative research, not a separable public case."],
  fbe46f361930b1df8fbdceb3: ["systemic_context", "Island Health anti-racism policy launch, not an incident account."],
  "180030e3a331f363b6fbefbb": ["systemic_context", "Institutional apology for systemic practices, not a separable patient incident."],
  "30070717234318a8f36abdad": ["existing_incident_support", "Further reporting for the existing Thomas Favel / Regina General proposal."],
  "3de4bff4a3b4e6dc4bd8bee4": ["systemic_context", "Research-project page, not a case account."],
  "47f978b90d59935e8deb4eca": ["existing_incident_support", "Reporting for the existing Marissa Smoke / Cardston proposal."],
  "53546798ffae40e93ae6d0a3": ["systemic_context", "Research-media index, not an individual incident source."],
  "6938e67bf50376609b7b8eff": ["existing_incident_support", "Further reporting for the existing Thomas Favel / Regina General proposal."],
  d2eb0b5046de9c2dc07e8efc: ["existing_incident_support", "Further reporting for the existing Pearl Gambler / Misericordia proposal."],
  e12b1986ba3a6b88350d879d: ["systemic_context", "CMA apology commentary without a separable patient incident."],
  "49315613a74530ff2ca72fa8": ["systemic_context", "Leadership response to systemic ER allegations; bounded material does not identify a separable patient event."],
  "8e24bc39747160038beefc3d": ["systemic_context", "In Plain Sight report release context, not an incident source."],
  a11c69347bcf9df2adcf6e8a: ["systemic_context", "Study reporting on emergency-department exits, not an identified individual incident."],
  b2892d72e6fe50f13c44ca19: ["systemic_context", "Systemic evidence/reckoning coverage, not a separable patient event."],
  d34ef44fd1e424dbb3eb509c: ["systemic_context", "Care-intervention research page, not an incident source."],
  "883c0cfa9df87c4d13d34685": ["systemic_context", "CMA apology reporting, not an individual incident."],
  "00217c6b0e0e581fe6fdea42": ["existing_incident_support", "Primary reporting for the existing Connor Sutton proposal."],
  "046b9dc8d7ac23e27399a31d": ["systemic_context", "Medical-journal systemic discussion, not a public individual case."],
  "3b49d223d2226cb24a8a4eef": ["insufficient_detail", "Cultural-safety information page, not an incident account."],
  "41ea75b81674252b23f77ffc": ["insufficient_detail", "Story-submission page, not a published incident account."],
  "6127388355280130f276116b": ["existing_incident_support", "Reporting for the existing Janelle Orcherton / Regina General proposal."],
  "71bb3661bcf1b9865511fbae": ["existing_incident_support", "Further reporting for the existing Thomas Favel / Regina General proposal."],
  c2d236ecda078078fc4d4872: ["systemic_context", "Qualitative systematic review, not a separable incident source."],
  "22df8bbbe46a3f7d50d41705": ["insufficient_detail", "Administrative correspondence/apology without a supported healthcare encounter."],
  f7be8894e18ed6329caa93b0: ["systemic_context", "Government apology for systemic racism, not one incident."],
  "06c789860560660415aa5474": ["existing_incident_support", "Public social repost relating to the existing Dexter Adams proposal; not independent corroboration."],
  "66198b2d319353c8927c3cf2": ["existing_incident_support", "Public social repost relating to the existing Dexter Adams proposal; not independent corroboration."],
  "7605093abafd63329a93e116": ["systemic_context", "In Plain Sight report coverage, not an individual incident."],
  "7f62c94c38506851fc5fc73f": ["systemic_context", "Systemic healthcare-racism context, not a separable patient event."],
  f6be33eee9f1278d3f3eb8f8: ["existing_incident_support", "Institutional-response coverage for the existing Kitimat/Terrace pregnancy-care proposal."],
  "260e0132d415f504f52663ec": ["systemic_context", "Research reporting on systemic racism, not an individual incident source."],
  fbdb299c689e4111cd39505e: ["systemic_context", "Call for community reports of discrimination, not a documented individual encounter."],
  "868abcbbb4b460e1aebddd9c": ["existing_incident_support", "Legacy reporting already represented in the existing Northern B.C. incident proposals; no new separable case is supported."],
}

let applied = 0
for (const lead of queue.leads) {
  const decision = decisions[lead.lead_id]
  if (!decision || lead.status === "reviewed") continue
  lead.status = "reviewed"
  lead.manual_classification = decision[0]
  lead.manual_note = decision[1]
  lead.manual_retrieval = { at: new Date().toISOString(), source_fetch: "stored_bounded_source_material", advisory_model_used: false }
  lead.reviewed_at = new Date().toISOString()
  applied += 1
  saveManifest(path, queue)
}

const kinds = ["new_individual_incident", "existing_incident_support", "probable_duplicate", "multi_incident_source", "systemic_context", "insufficient_detail"]
queue.manual_review_summary_v4 = {
  reviewed_this_pass: applied,
  total_reviewed: queue.leads.filter((lead) => lead.status === "reviewed").length,
  remaining: queue.leads.filter((lead) => lead.status !== "reviewed").length,
  generated_at: new Date().toISOString(),
}
saveManifest(path, queue)
console.log(JSON.stringify({
  applied,
  reviewed: queue.manual_review_summary_v4.total_reviewed,
  remaining: queue.manual_review_summary_v4.remaining,
  classifications: Object.fromEntries(kinds.map((kind) => [kind, queue.leads.filter((lead) => lead.manual_classification === kind).length])),
}, null, 2))
