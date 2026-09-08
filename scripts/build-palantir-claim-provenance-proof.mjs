import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildPalantirClaimLedger, buildPalantirClaimOwnerSummary, buildPalantirClaimTimeline, projectPalantirClaimGraph, routePalantirClaim } from "../server/palantirClaimProvenance.js"
import { benefitsClaimLessons, millerNorthClaimRegressionLessons, workplaceClaimLessons } from "../test/fixtures/palantirClaimProvenanceLessons.js"

const outputDirectory = resolve("artifacts/samwise-public-records/claim-provenance-intelligence-v1")
const outputPath = resolve(outputDirectory, "proof-ledger-v1.json")
const benefits = buildPalantirClaimLedger(benefitsClaimLessons.claims, benefitsClaimLessons.relationships, { ledgerId: "palantir:claims:public-benefits", generatedAt: "2026-09-08T00:00:00.000Z" })
const workplace = buildPalantirClaimLedger(workplaceClaimLessons.claims, workplaceClaimLessons.relationships, { ledgerId: "palantir:claims:workplace-safety", generatedAt: "2026-09-08T00:00:00.000Z" })
const regression = buildPalantirClaimLedger(millerNorthClaimRegressionLessons.claims, millerNorthClaimRegressionLessons.relationships, { ledgerId: "palantir:claims:miller-north-regression", generatedAt: "2026-09-08T00:00:00.000Z" })

const artifact = {
  schema_version: "palantir-claim-provenance-proof-v1",
  generated_at: "2026-09-08T00:00:00.000Z",
  capability_id: "samwise_public_records_intelligence",
  primitive: "claim_provenance_intelligence",
  ledgers: { benefits, workplace, miller_north_regression: regression },
  timelines: {
    benefits_bc: buildPalantirClaimTimeline(benefits, { canonicalEventId: "event:bc-benefits-telephone-access" }),
    benefits_alberta: buildPalantirClaimTimeline(benefits, { canonicalEventId: "event:ab-aish-personal-health-benefit" }),
    benefits_saskatchewan: buildPalantirClaimTimeline(benefits, { canonicalEventId: "event:sk-income-support-controls" }),
    workplace_kikino: buildPalantirClaimTimeline(workplace, { canonicalEventId: "event:ab-ohs-kikino" }),
    miller_north_structural_regression: buildPalantirClaimTimeline(regression, { canonicalEventId: "event:mn-regression-accountability" }),
  },
  graphs: {
    benefits: projectPalantirClaimGraph(benefits),
    workplace: projectPalantirClaimGraph(workplace),
    miller_north_regression: projectPalantirClaimGraph(regression),
  },
  owner_summaries: {
    benefits: buildPalantirClaimOwnerSummary(benefits),
    workplace: buildPalantirClaimOwnerSummary(workplace),
    miller_north_regression: buildPalantirClaimOwnerSummary(regression),
  },
  consumer_routing: {
    miller_north_private_candidates: workplace.claims.concat(regression.claims).map(claim => routePalantirClaim(claim, { relationshipReviewComplete: true })).filter(route => route.routes.includes("miller_north_evidence_candidate")).map(route => route.claim_id),
    miller_public_claims: 0,
    shared_resource_verification_candidates: 0,
    automatic_publications: 0,
  },
  recent_resource_opportunity_review: {
    research_projects_checked: ["health_ai_commercialization", "public_benefits", "workplace_safety", "legal", "child_youth", "policing_corrections"],
    candidates_requiring_separate_verification: ["211 data partnership/access opportunity"],
    already_canonical_or_duplicate: ["Alberta Income Support and Emergency Financial Assistance", "Jordan's Principle Requests"],
    approved_new_resources: 0,
    rejected_research_records: "All decisions, audits, investigations and enforcement findings remain in intelligence projections.",
  },
  boundaries: { mutation_authority: false, publication_authority: false, public_miller_claims_allowed: false, private_regression_only: true, qwen_usage: 0, external_cost_usd: 0 },
}

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ output: outputPath, counts: { claims: benefits.counts.claims + workplace.counts.claims + regression.counts.claims, relationships: benefits.counts.relationships + workplace.counts.relationships + regression.counts.relationships, contradictions: benefits.counts.contradictions + workplace.counts.contradictions + regression.counts.contradictions, timelines: Object.keys(artifact.timelines).length, miller_north_private_candidates: artifact.consumer_routing.miller_north_private_candidates.length, miller_public_claims: 0, approved_new_resources: 0 }, mutation_authority: false, publication_authority: false }, null, 2))
