#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { buildPalantirRemoteContractOwnerBrief, runPalantirRemoteContractOpportunityCycle } from "../server/palantirRemoteContractOpportunityHunter.js"

const inputPath = process.argv[2]
const outputDirectory = process.argv[3]
if (!inputPath || !outputDirectory) throw new Error("usage: node scripts/run-palantir-remote-contract-opportunity-cycle.mjs <private-input.json> <private-output-directory>")

const input = JSON.parse(readFileSync(inputPath, "utf8"))
const cycle = runPalantirRemoteContractOpportunityCycle({ opportunities: input.opportunities, previousOpportunityIds: input.previous_opportunity_ids, now: new Date(input.reviewed_at || Date.now()) })
const brief = buildPalantirRemoteContractOwnerBrief(cycle)
const memory = {
  schema_version: "palantir-opportunity-research-memory-v1",
  research_request_id: cycle.research_request_id,
  topic: "Remote contract, project, freelance and light asynchronous work that resembles Palantír/Farm capabilities",
  state: "completed",
  sources_checked: cycle.sources_checked,
  opportunities_seen: cycle.opportunities_seen,
  shortlisted_opportunity_ids: brief.shortlist.map(item => item.canonical_opportunity_id),
  duplicates: cycle.duplicates_suppressed,
  rejected: cycle.rejected_count,
  cross_domain_discoveries: input.cross_domain_discoveries || [],
  company_patterns: input.company_patterns || [],
  commercial_lessons: input.commercial_lessons || [],
  unanswered_questions: input.unanswered_questions || [],
  continuation: cycle.continuation,
  stopping_reason: "bounded_source_plan_exhausted",
  external_search_cost_usd: Number(input.external_search_cost_usd || 0),
  automatic_applications: 0,
  external_contacts: 0,
  mutation_authority: false,
  publication_authority: false,
}

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
writeFileSync(path.join(outputDirectory, "cycle-v1.json"), `${JSON.stringify(cycle, null, 2)}\n`, { mode: 0o600 })
writeFileSync(path.join(outputDirectory, "owner-brief-v1.json"), `${JSON.stringify(brief, null, 2)}\n`, { mode: 0o600 })
writeFileSync(path.join(outputDirectory, "research-memory-v1.json"), `${JSON.stringify(memory, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ research_request_id: cycle.research_request_id, state: memory.state, seen: cycle.opportunities_seen, eligible: cycle.eligible_count, shortlisted: brief.shortlist.length, alerts: brief.summary.alerts, automatic_applications: 0, external_contacts: 0 }, null, 2))
