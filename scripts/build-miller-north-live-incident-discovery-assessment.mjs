import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8"))
const listening = read("miller-north-live-listening-public-v1.json")
const protocol = read("miller-north-live-incident-discovery-v1.json")
const byState = Object.fromEntries(Object.entries(listening.items.reduce((all, item) => ({ ...all, [item.evidence_state]: (all[item.evidence_state] || 0) + 1 }), {})).sort())
const byProvince = Object.fromEntries(Object.entries(listening.items.reduce((all, item) => ({ ...all, [item.province]: (all[item.province] || 0) + 1 }), {})).sort())
const boundedRun = {
  searches_executed: 16,
  reviewed_candidate_hits: 14,
  matched_existing_repository_events: 14,
  net_new_leads: 0,
  newly_verified: 0,
  newly_provisional: 0,
  source_families_checked: ["Indigenous journalism", "regional journalism", "provincial human-rights and legal sources", "health-system and Indigenous-health official sources"],
  result: "The strongest incident-level results matched events already present in Miller North's private or reviewed evidence. Systemic reports and service pages were retained as accountability context rather than relabeled as incidents.",
  examples_reconciled: [
    { event: "B.C. northern hospital complaints and Remembering Keegan", disposition: "existing evidence; no duplicate lead created" },
    { event: "Alberta braid-cutting, Strathmore and Fort McMurray reports", disposition: "existing evidence; follow-up sources remain attached to their event" },
    { event: "Saskatchewan hospital-security, hair-cutting and FNHO-linked reports", disposition: "existing evidence; no duplicate lead created" }
  ]
}
const assessment = {
  schema_version: "miller-north-live-incident-discovery-assessment-v1",
  assessed_on: protocol.review_date,
  external_discovery_performed: true,
  new_external_leads: boundedRun.net_new_leads,
  boundary: "This bounded search reviewed public search results and reconciled the strongest event-level hits against existing repository evidence. Search-result discovery is not a finding and did not change the public projection.",
  bounded_external_run: boundedRun,
  existing_public_queue: { items: listening.items.length, by_state: byState, by_province: byProvince },
  protocol_summary: { source_families: protocol.source_families.map(item => item.name), query_templates: protocol.query_templates, staging_policy: protocol.staging_policy, deduplication: protocol.deduplication, exclusions: protocol.exclusions },
  next_pass: "Run the listed province-and-setting searches, preserve source dates and exact URLs, check event fingerprints, then stage only evidence-state labels supported by the protocol."
}
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("miller-north-live-incident-discovery-assessment-2026-09-07.json", dir), `${JSON.stringify(assessment, null, 2)}\n`)
writeFileSync(new URL("miller-north-live-incident-discovery-assessment-2026-09-07.md", dir), `# Miller North live incident discovery assessment\n\n- Assessment date: ${assessment.assessed_on}\n- External discovery performed in this pass: **Yes — bounded public search**\n- Search queries executed: **${boundedRun.searches_executed}**\n- Strong candidate hits reviewed: **${boundedRun.reviewed_candidate_hits}**\n- Matched to existing repository events: **${boundedRun.matched_existing_repository_events}**\n- Net-new external leads retained: **${boundedRun.net_new_leads}**\n- Newly verified / provisional: **${boundedRun.newly_verified} / ${boundedRun.newly_provisional}**\n- Existing publication-safe queue: **${listening.items.length}** items (${Object.entries(byProvince).map(([name, count]) => `${name}: ${count}`).join(", ")}).\n- Existing evidence states: ${Object.entries(byState).map(([name, count]) => `${name}: ${count}`).join(", ")}.\n\n## What the bounded search established\n\n${boundedRun.result}\n\n${boundedRun.examples_reconciled.map(item => `- **${item.event}:** ${item.disposition}.`).join("\n")}\n\nThis zero-net-new result is a deduplication result, not a claim that no other incidents exist. No public record was added or upgraded from search-result text alone.\n\n## Bounded next pass\n\nUse Indigenous journalism, regional journalism, and official/oversight sources. Apply the saved institution-, date- and setting-specific templates; retain a single report as verification in progress, require independent corroboration or a specific official follow-up for a corroborated public report, and reserve “formal finding” for an actual decision, report or investigation.\n\nThe queue must be de-duplicated by province, locality, facility, date window and allegation class. A national source, academic research, institutional response, commentary, repost or shared URL cannot be upgraded beyond its supported role.\n`)
console.log(JSON.stringify({ items: listening.items.length, byState, byProvince, externalSearches: boundedRun.searches_executed, reviewedCandidateHits: boundedRun.reviewed_candidate_hits, newExternalLeads: boundedRun.net_new_leads }))
