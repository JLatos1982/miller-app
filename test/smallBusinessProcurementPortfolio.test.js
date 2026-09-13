import test from "node:test"
import assert from "node:assert/strict"
import {
  assessSamwiseLeverage,
  assessSmallBusinessProcurementFit,
  buildProcurementPortfolioStrategy,
  classifyCompetition,
  classifyProcurementAction,
  createCompanyCapabilityProfile,
  createSmallBusinessOpportunity,
  procurementAutomationAssessment,
} from "../server/smallBusinessProcurementPortfolio.js"

const base = {
  buyer: "Public Buyer",
  title: "Data quality review",
  jurisdiction: "British Columbia",
  category: "data_research",
  posted_date: "2026-09-10",
  close_date: "2026-10-10",
  opportunity_state: "OPEN_NOW",
  source_url: "https://example.gov.bc.ca/opportunity/1",
  verification_date: "2026-09-13T12:00:00Z",
  staffing_capacity: "SOLO",
  estimated_contract_scale: "SMALL_25K_TO_100K",
  requirements: {
    capital_requirement: "LOW",
    special_equipment_requirement: "NONE",
    professional_credentials: "MODERATE",
    insurance_bonding_requirement: "LOW",
    geographic_delivery_burden: "LOW",
    past_performance_requirement: "MODERATE",
    proposal_complexity: "MODERATE",
    security_clearance: "NONE",
    inventory_requirement: "NONE",
  },
  mandatory_requirements_status: "SATISFIED",
  digital_remote_deliverability: "HIGH",
  recurrence_potential: "MODERATE",
  capability_tags: ["data_research", "report_generation"],
}

test("creates a private opportunity with stable source identity", () => {
  const first = createSmallBusinessOpportunity(base)
  const second = createSmallBusinessOpportunity(base)
  assert.equal(first.opportunity_id, second.opportunity_id)
  assert.equal(first.private_only, true)
  assert.equal(first.publication_authority, false)
})

test("fails closed on invalid or non-https opportunity evidence", () => {
  assert.throws(() => createSmallBusinessOpportunity({ ...base, source_url: "http://example.com" }), /invalid/)
  assert.throws(() => createSmallBusinessOpportunity({ ...base, opportunity_state: "COMING_SOON" }), /invalid/)
})

test("classifies a fully evidenced solo service as solo friendly", () => {
  const opportunity = createSmallBusinessOpportunity(base)
  const fit = assessSmallBusinessProcurementFit(opportunity)
  assert.equal(fit.classification, "SOLO_FRIENDLY")
  assert.equal(fit.inferred_missing_requirements, false)
})

test("explicit capital burden takes precedence over a friendly staffing size", () => {
  const opportunity = createSmallBusinessOpportunity({ ...base, requirements: { ...base.requirements, capital_requirement: "HIGH" } })
  assert.equal(assessSmallBusinessProcurementFit(opportunity).classification, "CAPITAL_HEAVY")
})

test("unknown qualification details do not become friendly by inference", () => {
  const opportunity = createSmallBusinessOpportunity({ ...base, staffing_capacity: "UNKNOWN", estimated_contract_scale: "UNKNOWN", requirements: {} })
  const fit = assessSmallBusinessProcurementFit(opportunity)
  assert.equal(fit.classification, "INSUFFICIENT_INFORMATION")
  assert.ok(fit.unknown_requirements.length >= 4)
})

test("Samwise leverage is based on supported capability tags", () => {
  const opportunity = createSmallBusinessOpportunity(base)
  assert.equal(assessSamwiseLeverage(opportunity).classification, "SAMWISE_LEVERAGE_HIGH")
  const unrelated = createSmallBusinessOpportunity({ ...base, title: "Grounds care", source_id: "2", capability_tags: ["landscaping"] })
  assert.equal(assessSamwiseLeverage(unrelated).classification, "SAMWISE_LEVERAGE_LOW")
})

test("pursue requires supported qualifications and a viable deadline", () => {
  const opportunity = createSmallBusinessOpportunity(base)
  const fit = assessSmallBusinessProcurementFit(opportunity)
  const leverage = assessSamwiseLeverage(opportunity)
  const companyProfile = createCompanyCapabilityProfile({ name: "Synthetic Data Studio", jurisdictions: ["British Columbia"], capabilities: ["data_research"], staff_capacity: 1 })
  assert.equal(classifyProcurementAction({ opportunity, fit, leverage, companyProfile, observedAt: "2026-09-13T12:00:00Z" }).action, "PURSUE")
  const unverified = createSmallBusinessOpportunity({ ...base, source_id: "3", mandatory_requirements_status: "UNVERIFIED" })
  assert.equal(classifyProcurementAction({ opportunity: unverified, fit: assessSmallBusinessProcurementFit(unverified), leverage: assessSamwiseLeverage(unverified), companyProfile, observedAt: "2026-09-13T12:00:00Z" }).action, "WATCH")
})

test("heavy opportunities are skipped for a solo profile", () => {
  const opportunity = createSmallBusinessOpportunity({ ...base, source_id: "4", requirements: { ...base.requirements, special_equipment_requirement: "HIGH" } })
  const profile = createCompanyCapabilityProfile({ name: "Solo", jurisdictions: ["British Columbia"] })
  const action = classifyProcurementAction({ opportunity, fit: assessSmallBusinessProcurementFit(opportunity), leverage: assessSamwiseLeverage(opportunity), companyProfile: profile, observedAt: "2026-09-13" })
  assert.equal(action.action, "SKIP")
})

test("portfolio strategy preserves pursue watch skip and supplier-list groups", () => {
  const profile = createCompanyCapabilityProfile({ name: "Synthetic Data Studio", jurisdictions: ["British Columbia", "Federal Canada"], capabilities: ["data_research"], staff_capacity: 1 })
  const supplierList = createSmallBusinessOpportunity({ ...base, source_id: "list", opportunity_state: "SUPPLIER_LIST_STANDING_OFFER", mandatory_requirements_status: "UNVERIFIED" })
  const heavy = createSmallBusinessOpportunity({ ...base, source_id: "heavy", title: "Equipment supply", requirements: { ...base.requirements, inventory_requirement: "HIGH" } })
  const portfolio = buildProcurementPortfolioStrategy({ companyProfile: profile, opportunities: [createSmallBusinessOpportunity(base), supplierList, heavy], observedAt: "2026-09-13" })
  assert.equal(portfolio.pursue.length, 1)
  assert.equal(portfolio.watch.length, 1)
  assert.equal(portfolio.skip.length, 1)
  assert.equal(portfolio.supplier_lists.length, 1)
  assert.equal(portfolio.no_win_probability_claim, true)
})

test("competition visibility never claims a complete field", () => {
  const result = classifyCompetition({ known_competitor_count: 7 })
  assert.equal(result.classification, "HIGH_VISIBILITY")
  assert.equal(result.completeness_claimed, false)
})

test("automation assessment keeps qualification and final decision human-gated", () => {
  const assessment = procurementAutomationAssessment()
  assert.equal(assessment.deadline_monitoring, "FULLY_AUTOMATABLE")
  assert.equal(assessment.qualification_confirmation, "HUMAN_REVIEW_REQUIRED")
  assert.equal(assessment.final_pursue_decision, "MANUAL")
})
