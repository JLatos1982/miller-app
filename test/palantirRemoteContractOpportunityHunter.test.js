import assert from "node:assert/strict"
import test from "node:test"

import { buildPalantirRemoteContractOwnerBrief, normalizePalantirRemoteContractOpportunity, PALANTIR_REMOTE_CONTRACT_LISTENER, runPalantirRemoteContractOpportunityCycle } from "../server/palantirRemoteContractOpportunityHunter.js"

const opportunity = overrides => ({
  title: "Public-record research contractor",
  company: "Example Research",
  source: "official_career_page",
  url: "https://jobs.lever.co/example/public-record-research?source=test",
  remote_status: "fully_remote",
  canada_eligible: true,
  contract_type: "independent_contractor",
  hours_min: 5,
  hours_max: 12,
  compensation: { currency: "CAD", hourly_min: 35, hourly_max: 45 },
  required_skills: ["public records", "source verification", "structured extraction"],
  relevant_owner_strengths: ["public-record research"],
  time_to_money: "immediate_application",
  next_action: "Owner may review and apply manually.",
  ...overrides,
})

test("hunter normalizes only allowlisted public sources and grants no application authority", () => {
  const item = normalizePalantirRemoteContractOpportunity(opportunity())
  assert.equal(item.farm_fit, "excellent_farm_fit")
  assert.equal(item.automation_potential, "high")
  assert.equal(item.application_authority, false)
  assert.equal(item.contact_authority, false)
  assert.doesNotMatch(item.url, /source=test/)
  assert.throws(() => normalizePalantirRemoteContractOpportunity(opportunity({ url: "https://unrestricted.example/jobs/1" })), /not_allowlisted/)
})

test("weekly cycle suppresses duplicates and rejects full-time, non-Canadian and expired listings", () => {
  const cycle = runPalantirRemoteContractOpportunityCycle({ opportunities: [
    opportunity(),
    opportunity(),
    opportunity({ title: "Full-time analyst", url: "https://jobs.lever.co/example/full-time", hours_min: 40, hours_max: 40 }),
    opportunity({ title: "US only", url: "https://www.upwork.com/freelance-jobs/apply/us-only", canada_eligible: false }),
    opportunity({ title: "Expired", url: "https://www.jobs.ca/example/expired", listing_status: "expired" }),
  ], now: new Date("2026-09-08T12:00:00Z") })
  assert.equal(cycle.opportunities_seen, 4)
  assert.equal(cycle.duplicates_suppressed, 1)
  assert.equal(cycle.eligible_count, 1)
  assert.equal(cycle.rejected_count, 3)
  assert.equal(cycle.alerts.length, 1)
  assert.equal(cycle.application_actions, 0)
  assert.equal(cycle.publication_authority, false)
})

test("credential uncertainty and incompatible hours prevent strong alerts", () => {
  const cycle = runPalantirRemoteContractOpportunityCycle({ opportunities: [
    opportunity({ title: "Licensed clinician reviewer", url: "https://jobs.ashbyhq.com/example/clinician", credential_required: true, credential_status: "unconfirmed" }),
    opportunity({ title: "Permanent manager", url: "https://jobs.lever.co/example/manager", contract_type: "permanent" }),
  ] })
  assert.equal(cycle.alerts.length, 0)
  assert.equal(cycle.ranked[0].owner_fit, "credential_mismatch_or_unconfirmed")
})

test("owner brief is bounded, private and contains no automatic action", () => {
  const cycle = runPalantirRemoteContractOpportunityCycle({ opportunities: [
    opportunity(),
    opportunity({ title: "Paid one-hour interview", url: "https://www.upwork.com/freelance-jobs/apply/one-hour", one_time_hours: 1, hours_min: 0, hours_max: 0, application_effort: "easy_application_with_screening_answers", compensation: { currency: "USD", fixed_fee: 55 }, farm_fit: "mostly_human_work", owner_fit: "conditional" }),
  ] })
  const brief = buildPalantirRemoteContractOwnerBrief(cycle)
  assert.equal(brief.shortlist.length, 2)
  assert.equal(brief.best_farm_assisted.length, 1)
  assert.equal(brief.easiest_first_dollar.title, "Paid one-hour interview")
  assert.equal(brief.automatic_applications, false)
  assert.equal(brief.external_contacts, false)
  assert.equal(brief.raw_logs_included, false)
  assert.equal(PALANTIR_REMOTE_CONTRACT_LISTENER.state, "designed_not_enabled")
})
