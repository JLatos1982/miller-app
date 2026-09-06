import { readFileSync, writeFileSync } from "node:fs"
import { buildPublicFundingProjection, validatePublicFundingProjection } from "../server/millerFundingListener.js"

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
const writeJson = (path, value) => writeFileSync(new URL(path, import.meta.url), `${JSON.stringify(value, null, 2)}\n`)
const verifiedAt = "2026-09-06"

const readiness = readJson("../artifacts/miller/miller-fraser-lower-mainland-support-readiness-2026-09-06.json")
const firstNationsFunding = readJson("../artifacts/miller/miller-first-nations-funding-assistance-2026-09-06.json")
const generalFunding = readJson("../artifacts/miller/miller-funding-assistance-2026-09-06.json")

const descriptions = {
  "BC Housing Housing Registry and regional listings": "Apply for subsidized housing and review regional nonprofit and co-operative housing listings.",
  "Burnaby Housing and Outreach Hub": "Housing outreach, referrals and practical help for people experiencing or at risk of homelessness.",
  "Douglas Road Emergency Shelter": "A Burnaby emergency shelter generally operating on a first-come, first-served basis.",
  "WorkBC Centre — Burnaby Metrotown": "Free employment services, planning and job-search support through the local WorkBC centre.",
  "WorkBC Centre — New Westminster": "Free employment services, planning and job-search support through the local WorkBC centre.",
  "WorkBC Centre — Coquitlam": "Free employment services, planning and job-search support through the local WorkBC centre.",
  "WorkBC Centre — Maple Ridge": "Free employment services, planning and job-search support for Maple Ridge and Pitt Meadows.",
  "Skills Training for Employment Readiness directory": "A directory of current employment-readiness training providers and programs.",
  "StrongerBC Future Skills Grant": "Funding for eligible short-term training at participating B.C. public post-secondary institutions.",
  "Identification Supplement": "Help with eligible direct costs of obtaining identification documents for people receiving specified B.C. assistance.",
  "My Self Serve income and disability assistance access": "Apply for or manage B.C. income and disability assistance online.",
  "HandyDART and HandyCard": "Accessible transit programs for people whose disabilities affect use of conventional transit.",
  "BC Bus Pass Program": "A reduced-cost annual transit pass for eligible low-income seniors and people receiving disability assistance.",
  "Fraser Health Indigenous Health Liaisons": "Health-system navigation, discharge support, cultural connections and care-planning support for Indigenous clients and families.",
  "TRAC Tenant Infoline": "Free legal information and referrals about residential tenancy matters in British Columbia.",
  "Legal Aid BC — New Westminster access": "Local access to Legal Aid BC application and service information.",
  "Burnaby Outreach Resource Centres": "Weekly outreach locations offering basic necessities and connections to social supports.",
}

const eligibility = {
  "BC Housing Housing Registry and regional listings": "Eligibility depends on the Housing Registry or individual housing provider.",
  "Burnaby Housing and Outreach Hub": "Contact the outreach team to discuss housing needs and program eligibility.",
  "Douglas Road Emergency Shelter": "Confirm current intake and space directly with the shelter.",
  "WorkBC Centre — Burnaby Metrotown": "Contact the centre; program-specific eligibility can vary.",
  "WorkBC Centre — New Westminster": "Contact the centre; program-specific eligibility can vary.",
  "WorkBC Centre — Coquitlam": "Contact the centre; program-specific eligibility can vary.",
  "WorkBC Centre — Maple Ridge": "Contact the centre; program-specific eligibility can vary.",
  "Skills Training for Employment Readiness directory": "Eligibility is set by each listed provider and program.",
  "StrongerBC Future Skills Grant": "Eligible B.C. residents meeting the current learner and program criteria.",
  "Identification Supplement": "Specified recipients of B.C. income, disability or hardship assistance.",
  "My Self Serve income and disability assistance access": "People applying for or managing B.C. income or disability assistance.",
  "HandyDART and HandyCard": "People whose physical, sensory or cognitive disability prevents independent use of conventional transit for some or all trips.",
  "BC Bus Pass Program": "Specified low-income seniors and people receiving disability assistance.",
  "Fraser Health Indigenous Health Liaisons": "People who self-identify as Indigenous or Aboriginal and their families; referrals may also come from friends or health professionals.",
  "TRAC Tenant Infoline": "B.C. residential tenants seeking legal information or referrals.",
  "Legal Aid BC — New Westminster access": "Financial and legal-issue eligibility varies; call to apply or ask about service options.",
  "Burnaby Outreach Resource Centres": "People seeking low-barrier practical necessities and social-service connections.",
}

const publicSupports = readiness.records
  .filter(record => !record.public_readiness.startsWith("hold_"))
  .map(record => ({
    id: record.miller_resource_id || `support:${record.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    kind: "service",
    name: record.name,
    organization: record.organization,
    area_served: record.geography,
    category: record.category,
    description: descriptions[record.name],
    eligibility: eligibility[record.name],
    access: record.access,
    phone: /^\+?[\d() -]+(?:\sor\s\+?[\d() -]+)?$/.test(record.contact) ? record.contact : null,
    website: record.source,
    source: { title: `${record.name} official information`, authority: record.organization, url: record.source },
    last_verified_at: verifiedAt,
  }))

const supportProjection = {
  schema_version: "miller-practical-supports-public-v1",
  generated_at: verifiedAt,
  scope: "Fraser North and adjacent Lower Mainland communities",
  caution: "Service availability and eligibility can change. Contact the service directly to confirm current information.",
  records: publicSupports,
}

const generalFunders = {
  mfa_bc_id_supplement: "Government of British Columbia",
  mfa_canada_benefits_finder: "Government of Canada",
  mfa_workbc_training: "WorkBC",
  mfa_community_workforce: "Government of British Columbia / WorkBC",
  mfa_fnha_transport: "First Nations Health Authority",
  mfa_psssp: "Indigenous Services Canada",
  mfa_iset: "Employment and Social Development Canada",
}
const millerFunding = buildPublicFundingProjection({
  records: generalFunding.records.map(record => ({
    ...record,
    funding_organization: generalFunders[record.funding_assistance_id],
    who_can_apply: record.applicant,
    purpose: record.category,
    application_method: "Review the official page and contact the administering organization if current intake or eligibility is unclear.",
  })),
  audience: "miller",
  verifiedAt,
})
const millerNorthFunding = buildPublicFundingProjection({ records: firstNationsFunding.records, audience: "miller-north", verifiedAt })
validatePublicFundingProjection(millerFunding)
validatePublicFundingProjection(millerNorthFunding)

writeJson("../src/data/miller-practical-supports-public-v1.json", supportProjection)
writeJson("../src/data/miller-funding-assistance-public-v1.json", millerFunding)
writeJson("../src/data/miller-north-funding-assistance-public-v1.json", millerNorthFunding)

console.log(JSON.stringify({ practical_supports: publicSupports.length, miller_funding: millerFunding.records.length, miller_north_funding: millerNorthFunding.records.length }))
